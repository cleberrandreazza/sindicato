import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { ActionCtx } from '../_generated/server'
import { processProviderNotification, type NotificationResult } from '../payments/webhookProcessor'
import { MOCK_WEBHOOK_SIGNATURE } from '../providers/mock/mockPaymentProvider'

/**
 * Núcleo compartilhado da simulação mock: monta notificação assinada e entrega a
 * `processProviderNotification` (mesma porta do webhook real). Não valida APP_ENV nem
 * accessToken — quem chama (internal ou público) aplica as portas.
 */

export type SimulationOutcome = 'approved' | 'declined' | 'pending' | 'approved_after_expiry'

export interface SimulationResult {
  eventId: string
  providerTransactionId: string
  notification: NotificationResult
}

export async function executeMockPaymentSimulation(
  ctx: ActionCtx,
  args: {
    operationId: Id<'paymentOperations'>
    outcome: SimulationOutcome
    eventId?: string
  },
): Promise<SimulationResult> {
  const target = await ctx.runQuery(internal.payments.charges.latestCharge, {
    operationId: args.operationId,
  })
  if (!target) throw new ConvexError({ code: 'no_charge_for_operation' })

  const now = Date.now()
  const status =
    args.outcome === 'declined' ? 'failed' : args.outcome === 'pending' ? 'pending' : 'succeeded'
  const occurredAt =
    args.outcome === 'approved_after_expiry'
      ? Math.max(now, target.operationExpiresAt + 1_000)
      : now
  const eventId = args.eventId ?? `sim_${args.outcome}_${crypto.randomUUID()}`

  const notification = await processProviderNotification(ctx, {
    rawBody: JSON.stringify({
      eventId,
      providerTransactionId: target.providerTransactionId,
      status,
      amountCents: target.amountCents,
      occurredAt,
    }),
    headers: { 'x-mock-signature': MOCK_WEBHOOK_SIGNATURE },
  })
  return { eventId, providerTransactionId: target.providerTransactionId, notification }
}
