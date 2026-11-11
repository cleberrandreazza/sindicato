import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { Doc } from '../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../_generated/server'
import { deriveAccessToken } from '../domain/idempotency'
import { generateAccessToken, hashAccessToken } from '../domain/privacy'
import { publicError } from '../domain/publicErrors'
import {
  PAYMENT_WINDOW_MS,
  calculateExpiresAt,
  calculateOperationAmounts,
  isExpired,
} from '../domain/pricing'
import { personRef } from '../domain/statuses'
import { defaultUsagePolicy } from '../domain/usagePolicy'
import { resolveMemberSelection } from '../members/family'
import { findConflicts, releaseClaims } from './claims'
import { recordEvent } from './events'

/**
 * Cria uma operação de pagamento. REGRA ÚNICA: tanto a função pública
 * (`public/payments:createOperation`) quanto a mutation interna abaixo chamam esta função, para
 * que nenhuma regra seja duplicada.
 *
 * Recebe apenas *quem* (vínculos) e *quando* (data). Valores, nomes, prazo e elegibilidade são
 * calculados/lidos aqui, nunca vindos do navegador.
 *
 * Toda a validação de duplicidade e a inserção das reservas acontecem NESTA transação
 * (ver `claims.ts` para a garantia de concorrência). Quem chama deve estar numa mutation.
 */
export async function createOperationCore(
  ctx: MutationCtx,
  args: {
    memberId: Id<'members'>
    usageDate: string
    linkIds: readonly Id<'householdLinks'>[]
    /**
     * Idempotência (opcional). Quando presente, a operação guarda `requestKeyHash` e o token de
     * acesso é DERIVADO (HMAC) em vez de aleatório, para poder ser devolvido de novo na repetição
     * da mesma solicitação. Quem chama já verificou, NA MESMA transação, que não existe operação
     * para esta chave (ver `findOperationByRequest`).
     */
    request?: { requestId: string; requestKeyHash: string; secret: string }
  },
) {
  const now = Date.now()
  const policy = defaultUsagePolicy

  const dateCheck = policy.checkUsageDate(args.usageDate, now)
  if (!dateCheck.ok) throw publicError(dateCheck.code)

  const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
  if (!selection.ok) throw publicError(selection.code)
  const { member, people } = selection

  // Duplicidade: nenhuma pessoa pode ter reserva ativa (pendente, paga ou em análise) na data.
  const conflicts = await findConflicts(ctx, people, args.usageDate)
  if (conflicts.length > 0) {
    throw publicError('duplicate_usage', {
      names: conflicts.map((person) => person.name),
      linkIds: conflicts.map((person) => person.linkId),
    })
  }

  const amounts = calculateOperationAmounts(people.length, policy.unitAmountCents(args.usageDate))
  // Sem `requestId` o token é aleatório (comportamento original). Com `requestId` é recalculado
  // abaixo, quando o id da operação já existe, e substitui o hash provisório.
  let accessToken = generateAccessToken()
  const expiresAt = calculateExpiresAt(now)

  const operationId = await ctx.db.insert('paymentOperations', {
    memberId: member._id,
    usageDate: args.usageDate,
    quantity: amounts.quantity,
    unitAmountCents: amounts.unitAmountCents,
    totalAmountCents: amounts.totalAmountCents,
    expiresAt,
    financialStatus: 'unpaid',
    operationalStatus: 'awaiting_payment',
    accessTokenHash: await hashAccessToken(accessToken),
    ...(args.request ? { requestKeyHash: args.request.requestKeyHash } : {}),
    updatedAt: now,
  })

  if (args.request) {
    accessToken = await deriveAccessToken(args.request.secret, {
      operationId,
      memberId: member._id,
      requestId: args.request.requestId,
    })
    await ctx.db.patch(operationId, { accessTokenHash: await hashAccessToken(accessToken) })
  }

  for (const person of people) {
    await ctx.db.insert('operationPeople', {
      operationId,
      usageDate: args.usageDate,
      personId: person.personId,
      linkId: person.linkId,
      role: person.role,
      name: person.name,
      claim: 'active',
    })
  }

  await recordEvent(ctx, {
    operationId,
    type: 'created',
    actor: 'member',
    financialStatus: 'unpaid',
    operationalStatus: 'awaiting_payment',
  })

  await ctx.scheduler.runAfter(PAYMENT_WINDOW_MS, internal.payments.operations.expire, {
    operationId,
  })

  return {
    operationId,
    accessToken,
    usageDate: args.usageDate,
    quantity: amounts.quantity,
    unitAmountCents: amounts.unitAmountCents,
    totalAmountCents: amounts.totalAmountCents,
    expiresAt,
    people: people.map((person) => ({ name: person.name, role: person.role })),
    reused: false as boolean,
  }
}

/**
 * Operação já criada para esta solicitação (mesmo associado e mesmo `requestId`), se houver. A
 * leitura do índice entra no conjunto de leitura da transação: se outra criação com a mesma
 * chave confirmar antes, o Convex reexecuta esta mutation, que então a encontra e a reutiliza.
 */
export async function findOperationByRequest(
  ctx: MutationCtx,
  memberId: Id<'members'>,
  requestKeyHash: string,
): Promise<Doc<'paymentOperations'> | null> {
  return await ctx.db
    .query('paymentOperations')
    .withIndex('by_member_request', (q) =>
      q.eq('memberId', memberId).eq('requestKeyHash', requestKeyHash),
    )
    .first()
}

/**
 * Repetição da mesma solicitação: devolve a operação ORIGINAL (`reused: true`) com o mesmo token.
 * Não cria nada, não mexe em reservas nem no limite de criações.
 *
 * - A chave só vale para os mesmos dados (data e conjunto de vínculos); outros dados com a mesma
 *   chave são recusados (`request_id_conflict`).
 * - O token é recalculado e conferido com o hash guardado, testando os segredos em ordem (rotação).
 *   Se nenhum confere, não se devolve token algum (`operation_not_recoverable`).
 * - O estado devolvido é o da criação; o chamador deve consultar `getOperation` para o estado
 *   oficial (a operação pode ter expirado ou sido paga).
 */
export async function replayOperation(
  ctx: MutationCtx,
  existing: Doc<'paymentOperations'>,
  args: {
    memberId: Id<'members'>
    usageDate: string
    linkIds: readonly Id<'householdLinks'>[]
    request: { requestId: string; secrets: readonly string[] }
  },
) {
  const stored = await ctx.db
    .query('operationPeople')
    .withIndex('by_operation', (q) => q.eq('operationId', existing._id))
    .collect()

  const sameDate = existing.usageDate === args.usageDate
  const storedLinks = new Set<string>(stored.map((person) => person.linkId))
  const requestedLinks = new Set<string>(args.linkIds)
  const sameLinks =
    storedLinks.size === requestedLinks.size &&
    [...requestedLinks].every((linkId) => storedLinks.has(linkId))
  if (!sameDate || !sameLinks) throw publicError('request_id_conflict')

  for (const secret of args.request.secrets) {
    const token = await deriveAccessToken(secret, {
      operationId: existing._id,
      memberId: existing.memberId,
      requestId: args.request.requestId,
    })
    if ((await hashAccessToken(token)) === existing.accessTokenHash) {
      return {
        operationId: existing._id,
        accessToken: token,
        usageDate: existing.usageDate,
        quantity: existing.quantity,
        unitAmountCents: existing.unitAmountCents,
        totalAmountCents: existing.totalAmountCents,
        expiresAt: existing.expiresAt,
        people: stored.map((person) => ({ name: person.name, role: person.role })),
        reused: true as boolean,
      }
    }
  }
  throw publicError('operation_not_recoverable')
}

/** Versão interna (usada por testes e por futuras rotinas do servidor). */
export const create = internalMutation({
  args: {
    memberId: v.id('members'),
    usageDate: v.string(),
    people: v.array(personRef),
  },
  handler: (ctx, args) =>
    createOperationCore(ctx, {
      memberId: args.memberId,
      usageDate: args.usageDate,
      linkIds: args.people.map((person) => person.linkId),
    }),
})

/**
 * Expira a operação se o prazo acabou sem recebimento e libera as reservas, para que uma nova
 * tentativa não fique bloqueada. Idempotente: roda no agendamento e pode ser chamada de novo.
 * Não descarta nada: um recebimento posterior ainda é tratado em `confirmations.applyConfirmation`.
 */
export const expire = internalMutation({
  args: { operationId: v.id('paymentOperations') },
  handler: async (ctx, { operationId }) => {
    const operation = await ctx.db.get(operationId)
    if (!operation) return { expired: false }
    if (operation.operationalStatus !== 'awaiting_payment') return { expired: false }

    const now = Date.now()
    if (!isExpired(operation.expiresAt, now)) return { expired: false }

    await ctx.db.patch(operationId, { operationalStatus: 'expired', updatedAt: now })
    await releaseClaims(ctx, operationId)
    await recordEvent(ctx, {
      operationId,
      type: 'expired',
      actor: 'system',
      financialStatus: operation.financialStatus,
      operationalStatus: 'expired',
    })
    return { expired: true }
  },
})
