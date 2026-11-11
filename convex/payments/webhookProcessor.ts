import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction, type ActionCtx } from '../_generated/server'
import type { ProviderEventOutcome } from '../domain/statuses'
import { ProviderError } from '../providers/errors'
import type { WebhookRequest } from '../providers/paymentProvider'
import { getPaymentProvider } from '../providers/registry'

/**
 * Processamento de uma notificação do provedor de pagamento (webhook). É o ÚNICO caminho pelo
 * qual um evento financeiro entra no sistema, hoje e quando existir a rota HTTP da Stripe:
 *
 *   corpo bruto + cabeçalhos
 *     → `PaymentProvider.processConfirmation`  (verifica a ASSINATURA e normaliza)
 *     → `providerEvents.ingest`                (registra, deduplica, decide, aplica)
 *
 * NÃO há rota HTTP nesta etapa (o teste `publicSurface` proíbe `http.ts`). Quando houver, a rota
 * deve apenas repassar o corpo EXATAMENTE como recebido e os cabeçalhos para
 * `processProviderNotification` e traduzir o resultado: `accepted` → 200; `rejected` com
 * `invalid_signature`/`invalid_request` → 400; `provider_unavailable` → 503 (o provedor reenvia).
 *
 * Esta função nunca recebe nem devolve dados pessoais, e não confia em nenhum campo antes de a
 * assinatura ser verificada pelo provider.
 */

export type NotificationResult =
  | {
      status: 'rejected'
      reason: 'invalid_signature' | 'invalid_request' | 'provider_unavailable'
    }
  | {
      status: 'accepted'
      /** O evento (mesma origem + id) já havia sido recebido. */
      duplicate: boolean
      outcome: ProviderEventOutcome
      /** O recebimento é de uma cobrança desconhecida e gerou alerta administrativo. */
      alertOpened: boolean
    }

function normalizeHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) normalized[name.toLowerCase()] = value
  return normalized
}

export async function processProviderNotification(
  ctx: ActionCtx,
  request: { rawBody: string; headers: Readonly<Record<string, string>> },
): Promise<NotificationResult> {
  const webhook: WebhookRequest = {
    rawBody: request.rawBody,
    headers: normalizeHeaders(request.headers),
  }

  let provider
  let confirmation
  try {
    provider = getPaymentProvider()
    confirmation = await provider.processConfirmation(webhook)
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'unknown'
    // Só o código técnico vai para o log: nunca o corpo nem os cabeçalhos.
    console.error('webhook: notificação não aceita', code)
    if (code === 'invalid_signature') return { status: 'rejected', reason: 'invalid_signature' }
    if (code === 'invalid_request') return { status: 'rejected', reason: 'invalid_request' }
    return { status: 'rejected', reason: 'provider_unavailable' }
  }

  try {
    const ingested = await ctx.runMutation(internal.payments.providerEvents.ingest, {
      provider: provider.name,
      eventId: confirmation.eventId,
      providerTransactionId: confirmation.providerTransactionId,
      status: confirmation.status,
      amountCents: confirmation.amountCents,
      occurredAt: confirmation.occurredAt,
    })
    return {
      status: 'accepted',
      duplicate: ingested.duplicate,
      outcome: ingested.outcome,
      alertOpened: ingested.alertOpened,
    }
  } catch (error) {
    if (error instanceof ConvexError) {
      // Evento autêntico, porém com valores inválidos (ex.: valor negativo).
      return { status: 'rejected', reason: 'invalid_request' }
    }
    throw error
  }
}

/** Ponto de entrada interno (para a futura rota HTTP e para a simulação de desenvolvimento). */
export const processNotification = internalAction({
  args: { rawBody: v.string(), headers: v.record(v.string(), v.string()) },
  handler: (ctx, args): Promise<NotificationResult> => processProviderNotification(ctx, args),
})
