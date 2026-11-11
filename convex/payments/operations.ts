import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation } from '../_generated/server'
import { generateAccessToken, hashAccessToken } from '../domain/privacy'
import {
  PAYMENT_WINDOW_MS,
  calculateExpiresAt,
  calculateOperationAmounts,
  isExpired,
} from '../domain/pricing'
import { resolveSelection } from '../domain/selection'
import { personRef } from '../domain/statuses'
import { defaultUsagePolicy } from '../domain/usagePolicy'
import { findActiveClaim, releaseClaims } from './claims'
import { recordEvent } from './events'

/** Limite defensivo de leitura; um titular não tem centenas de vínculos. */
const MAX_LINKS = 200

/**
 * Cria uma operação de pagamento.
 *
 * É `internal`: deve ser chamada pela action pública de criação, que antes confirma carteirinha
 * e CPF no MemberProvider e atualiza o cache. Recebe apenas *quem* e *quando*; valores,
 * nomes, prazo e elegibilidade são calculados/lidos aqui, nunca vindos do navegador.
 *
 * Toda a validação de duplicidade e a inserção das reservas acontecem NESTA mutation
 * (ver `claims.ts` para a garantia de concorrência).
 */
export const create = internalMutation({
  args: {
    memberId: v.id('members'),
    usageDate: v.string(),
    people: v.array(personRef),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const policy = defaultUsagePolicy

    const member = await ctx.db.get(args.memberId)
    if (!member) throw new ConvexError({ code: 'member_not_found' })

    const dateCheck = policy.checkUsageDate(args.usageDate, now)
    if (!dateCheck.ok) throw new ConvexError({ code: dateCheck.code })

    const linkDocs = await ctx.db
      .query('householdLinks')
      .withIndex('by_member_and_external_link', (q) => q.eq('memberId', member._id))
      .take(MAX_LINKS)
    const links = []
    for (const link of linkDocs) {
      const person = await ctx.db.get(link.personRef)
      if (!person) throw new ConvexError({ code: 'person_not_found' })
      links.push({
        id: link._id,
        personId: person.personId,
        name: person.name,
        role: link.role,
        status: link.status,
      })
    }

    const selection = resolveSelection({
      memberStatus: member.status,
      links,
      linkIds: args.people.map((ref) => ref.linkId),
    })
    if (!selection.ok) throw new ConvexError({ code: selection.code })

    // Duplicidade: nenhuma pessoa pode ter reserva ativa (pendente, paga ou em análise) na data.
    const conflictingNames: string[] = []
    for (const person of selection.people) {
      const active = await findActiveClaim(ctx, person.personId, args.usageDate)
      if (active) conflictingNames.push(person.name)
    }
    if (conflictingNames.length > 0) {
      throw new ConvexError({ code: 'duplicate_usage', names: conflictingNames })
    }

    const amounts = calculateOperationAmounts(
      selection.people.length,
      policy.unitAmountCents(args.usageDate),
    )
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

    for (const person of selection.people) {
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
    }
  },
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
