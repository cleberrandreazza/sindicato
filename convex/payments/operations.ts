import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../_generated/server'
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
  const accessToken = generateAccessToken()
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
    updatedAt: now,
  })

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
  }
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
