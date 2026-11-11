import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { processProviderNotification, type NotificationResult } from '../payments/webhookProcessor'
import { MOCK_WEBHOOK_SIGNATURE } from '../providers/mock/mockPaymentProvider'
import { getPaymentProvider } from '../providers/registry'

/**
 * SIMULAÇÃO DE PAGAMENTO, SOMENTE DESENVOLVIMENTO.
 *
 * Como o mock não tem relógio nem recebe dinheiro, esta função faz o papel do provedor: monta
 * uma notificação assinada (formato do mock) e a entrega ao MESMO processador que o webhook real
 * usará (`processProviderNotification`). Assim exercita a verificação de assinatura, o registro
 * do evento, a idempotência e as regras de prazo/valor/análise, sem atalhos.
 *
 * É `internalAction`: não existe para o navegador. Execute pelo painel do Convex ou pela CLI:
 *
 *   npx convex run dev/simulate:simulatePayment '{"operationId":"…","outcome":"approved"}'
 *
 * Mesmo sendo interna, recusa rodar fora de `APP_ENV=development` ou com provider diferente do
 * mock, para que uma configuração de produção nunca consiga "pagar" uma operação.
 *
 * Resultados (`outcome`):
 * - `approved`: recebimento agora (se o prazo já passou, é tardio, como na vida real);
 * - `declined`: cobrança recusada (nenhum recebimento);
 * - `pending`: confirma que segue pendente (nenhuma mudança);
 * - `approved_after_expiry`: recebimento com `occurredAt` depois do prazo → `paid_late` + análise.
 *
 * Repetir com o mesmo `eventId` simula reenvio do provedor; omitir gera um evento novo.
 */

export type SimulationOutcome = 'approved' | 'declined' | 'pending' | 'approved_after_expiry'

export interface SimulationResult {
  eventId: string
  providerTransactionId: string
  notification: NotificationResult
}

export const simulatePayment = internalAction({
  args: {
    operationId: v.id('paymentOperations'),
    outcome: v.union(
      v.literal('approved'),
      v.literal('declined'),
      v.literal('pending'),
      v.literal('approved_after_expiry'),
    ),
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SimulationResult> => {
    if (process.env.APP_ENV !== 'development') {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    let providerName: string
    try {
      providerName = getPaymentProvider().name
    } catch {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    if (providerName !== 'mock') throw new ConvexError({ code: 'simulation_disabled' })

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
  },
})
