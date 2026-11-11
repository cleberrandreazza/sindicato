import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation } from '../_generated/server'
import { canTransitionOperational } from '../domain/statuses'
import { reacquireClaims, releaseClaims } from './claims'
import { recordEvent } from './events'
import { issueReceipt } from './receipts'

/**
 * Conclui uma análise administrativa.
 *
 * - `approved`: valida o recebimento. Se a operação estava em análise, ela passa a `confirmed`
 *   (utilização liberada) e o comprovante é emitido. Se o motivo foi `unexpected_payment`, a
 *   operação já estava resolvida e apenas a análise é encerrada.
 * - `rejected`: a utilização não é liberada; as reservas são liberadas. Nenhum reembolso é
 *   iniciado aqui: devolução de valores é tratada manualmente, fora do sistema.
 *
 * É `internal`: o painel administrativo a exporá por trás de autenticação e papel.
 */
export const resolve = internalMutation({
  args: {
    reviewId: v.id('paymentReviews'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    resolvedBy: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId)
    if (!review) throw new ConvexError({ code: 'review_not_found' })
    if (review.status !== 'open') throw new ConvexError({ code: 'review_not_open' })

    const operation = await ctx.db.get(review.operationId)
    if (!operation) throw new ConvexError({ code: 'operation_not_found' })

    const now = Date.now()
    let financialStatus = operation.financialStatus
    let operationalStatus = operation.operationalStatus

    if (operation.operationalStatus === 'under_review') {
      if (args.decision === 'approved') {
        const { conflicts } = await reacquireClaims(ctx, operation._id)
        if (conflicts.length > 0) {
          // Aprovar quebraria a unicidade de uso por pessoa/data.
          throw new ConvexError({ code: 'claim_conflict', names: conflicts })
        }
        if (operation.financialStatus === 'unpaid') financialStatus = 'paid'
        // paid_late aprovado na análise: financeiro permanece paid_late; operacional confirmed.
        operationalStatus = 'confirmed'
        const receiptId = await issueReceipt(ctx, {
          operationId: operation._id,
          transactionId: review.transactionId,
          nowMs: now,
        })
        await ctx.scheduler.runAfter(0, internal.notifications.outbox.afterConfirmed, {
          operationId: operation._id,
          receiptId,
        })
      } else {
        operationalStatus = 'rejected'
        await releaseClaims(ctx, operation._id)
      }

      if (!canTransitionOperational(operation.operationalStatus, operationalStatus)) {
        throw new ConvexError({ code: 'invalid_transition' })
      }
      await ctx.db.patch(operation._id, { financialStatus, operationalStatus, updatedAt: now })
    }

    await ctx.db.patch(review._id, {
      status: args.decision,
      resolvedAt: now,
      resolvedBy: args.resolvedBy,
      ...(args.note !== undefined ? { resolutionNote: args.note } : {}),
    })
    await recordEvent(ctx, {
      operationId: operation._id,
      type: 'review_resolved',
      actor: 'admin',
      financialStatus,
      operationalStatus,
      note: `motivo: ${review.reason}; decisão: ${args.decision}`,
    })

    return { operationalStatus, financialStatus }
  },
})
