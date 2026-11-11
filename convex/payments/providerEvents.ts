import { ConvexError, v } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { paymentProviderName, transactionStatus } from '../domain/statuses'
import type { ProviderEventOutcome } from '../domain/statuses'
import { applyConfirmation } from './confirmations'
import type { ConfirmationOutcome } from './confirmations'

/** Limite defensivo de leitura da fila de alertas. */
const MAX_ALERTS = 200

export interface IngestResult {
  /** `true` se este evento (mesma origem + mesmo id) já havia sido recebido. */
  duplicate: boolean
  outcome: ProviderEventOutcome
  /**
   * Resultado completo do processamento realizado AGORA (ids do comprovante/análise, etc.).
   * `null` quando o evento é um repetido já resolvido: nada foi reprocessado, portanto o
   * chamador NÃO deve enviar comprovante/avisos de novo.
   */
  result: ConfirmationOutcome | null
  /** Este recebimento abriu um alerta administrativo. */
  alertOpened: boolean
}

/**
 * PORTA ÚNICA para eventos financeiros vindos do provedor (já autenticados e normalizados por
 * `PaymentProvider.processConfirmation`).
 *
 * 1. Registra a chegada (`providerEvents`): origem + id do evento, valores normalizados, quantas
 *    vezes chegou e o resultado. Isto acontece na MESMA transação do processamento: se algo
 *    falhar, nada é registrado pela metade e o provedor reenvia.
 * 2. Identifica repetição por (`provider`, `eventId`): um evento repetido não é reaplicado.
 * 3. Delega a decisão a `applyConfirmation`, que só confirma com uma transação NOSSA validada.
 * 4. Se a cobrança é desconhecida, registra o evento, abre um alerta administrativo e NÃO
 *    confirma nem libera nada. Não há reembolso nem liberação automática.
 *
 * Exceção deliberada à regra de "repetido não reaplica": se o evento anterior foi
 * `unknown_transaction`, a repetição tenta de novo. Isso cobre a corrida em que o webhook chega
 * antes de a transação local ser gravada; se agora a transação existe, o evento é processado e
 * o alerta é encerrado pelo sistema.
 *
 * Concorrência: a leitura do índice `by_provider_event` entra no conjunto de leitura da
 * transação; duas chegadas simultâneas do mesmo evento conflitam, e a reexecutada enxerga o
 * registro da primeira (contado como repetição, sem duplicar linha).
 */
export const ingest = internalMutation({
  args: {
    provider: paymentProviderName,
    eventId: v.string(),
    providerTransactionId: v.string(),
    status: transactionStatus,
    amountCents: v.number(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args): Promise<IngestResult> => {
    if (
      args.eventId.trim() === '' ||
      args.providerTransactionId.trim() === '' ||
      !Number.isSafeInteger(args.amountCents) ||
      args.amountCents < 0 ||
      !Number.isFinite(args.occurredAt)
    ) {
      throw new ConvexError({ code: 'invalid_provider_event' })
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('providerEvents')
      .withIndex('by_provider_event', (q) =>
        q.eq('provider', args.provider).eq('eventId', args.eventId),
      )
      .unique()

    const confirmation = {
      provider: args.provider,
      providerTransactionId: args.providerTransactionId,
      status: args.status,
      amountCents: args.amountCents,
      occurredAt: args.occurredAt,
    }

    if (!existing) {
      const result = await applyConfirmation(ctx, confirmation)
      const unknown = result.outcome === 'unknown_transaction'
      await ctx.db.insert('providerEvents', {
        provider: args.provider,
        eventId: args.eventId,
        providerTransactionId: args.providerTransactionId,
        status: args.status,
        amountCents: args.amountCents,
        occurredAt: args.occurredAt,
        occurrences: 1,
        lastReceivedAt: now,
        outcome: result.outcome,
        ...('operationId' in result ? { operationId: result.operationId } : {}),
        ...(unknown
          ? { alertReason: 'unknown_transaction' as const, alertStatus: 'open' as const }
          : {}),
      })
      return { duplicate: false, outcome: result.outcome, result, alertOpened: unknown }
    }

    // Repetição.
    const repeat = { occurrences: existing.occurrences + 1, lastReceivedAt: now }
    if (existing.outcome !== 'unknown_transaction') {
      await ctx.db.patch(existing._id, repeat)
      return { duplicate: true, outcome: existing.outcome, result: null, alertOpened: false }
    }

    const result = await applyConfirmation(ctx, confirmation)
    if (result.outcome === 'unknown_transaction') {
      await ctx.db.patch(existing._id, repeat)
      return { duplicate: true, outcome: 'unknown_transaction', result, alertOpened: false }
    }
    await ctx.db.patch(existing._id, {
      ...repeat,
      outcome: result.outcome,
      ...('operationId' in result ? { operationId: result.operationId } : {}),
      ...(existing.alertStatus === 'open'
        ? {
            alertStatus: 'resolved' as const,
            resolvedAt: now,
            resolvedBy: 'system',
            resolutionNote: 'Transação passou a existir; evento reprocessado.',
          }
        : {}),
    })
    return { duplicate: true, outcome: result.outcome, result, alertOpened: false }
  },
})

/**
 * Encerra um alerta após análise humana. NÃO altera operações, transações nem reservas:
 * decidir o que fazer com o dinheiro recebido (ex.: reembolso) é um processo manual externo.
 *
 * `internal` até existir autenticação administrativa; quando existir, uma função pública
 * deverá verificar o perfil e passar a identidade real em `resolvedBy`.
 */
export const resolveAlert = internalMutation({
  args: {
    providerEventId: v.id('providerEvents'),
    resolvedBy: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.providerEventId)
    if (!event) throw new ConvexError({ code: 'provider_event_not_found' })
    if (event.alertStatus !== 'open') throw new ConvexError({ code: 'alert_not_open' })
    await ctx.db.patch(event._id, {
      alertStatus: 'resolved',
      resolvedAt: Date.now(),
      resolvedBy: args.resolvedBy,
      resolutionNote: args.note,
    })
  },
})

/** Fila de alertas abertos para o painel administrativo (mais antigos primeiro). */
export const listOpenAlerts = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<'providerEvents'>[]> => {
    return await ctx.db
      .query('providerEvents')
      .withIndex('by_alert_status', (q) => q.eq('alertStatus', 'open'))
      .take(MAX_ALERTS)
  },
})
