import { messageOr, readPublicError } from '@/lib/public-error'
import type { OperationView, StartPaymentResult } from '../api/start-payment'

/**
 * Traduz respostas de `startPayment` / `getOperation` no que a tela precisa. Quem decide estados
 * financeiros e operacionais é sempre o backend; aqui só se classifica.
 */

export type PaymentFlowOutcome =
  | { kind: 'ready'; result: StartPaymentResult }
  | { kind: 'snapshot'; view: OperationView }
  | { kind: 'operation_gone' }
  | { kind: 'operation_closed'; message: string; code: string }
  | { kind: 'rejected'; message: string; code: string }
  | { kind: 'unavailable' }

const FALLBACK = 'Não foi possível iniciar o pagamento. Tente novamente em instantes.'

const CLOSED_CODES = new Set([
  'operation_expired',
  'operation_already_paid',
  'operation_under_review',
  'operation_closed',
])

const REJECTED_CODES = new Set([
  'invalid_payment_method',
  'invalid_payment_token',
  'payment_method_conflict',
  'payment_attempts_exceeded',
  'invalid_operation_amount',
  'payment_in_progress',
])

export function interpretStartResult(result: StartPaymentResult): PaymentFlowOutcome {
  return { kind: 'ready', result }
}

export function interpretStartError(error: unknown): PaymentFlowOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unavailable' }
  if (publicError.code === 'operation_not_found') return { kind: 'operation_gone' }
  if (CLOSED_CODES.has(publicError.code)) {
    return {
      kind: 'operation_closed',
      code: publicError.code,
      message: messageOr(publicError, FALLBACK),
    }
  }
  if (REJECTED_CODES.has(publicError.code)) {
    return {
      kind: 'rejected',
      code: publicError.code,
      message: messageOr(publicError, FALLBACK),
    }
  }
  return { kind: 'unavailable' }
}

export function interpretGetResult(view: OperationView): PaymentFlowOutcome {
  return { kind: 'snapshot', view }
}

export function interpretGetError(error: unknown): PaymentFlowOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unavailable' }
  if (publicError.code === 'operation_not_found') return { kind: 'operation_gone' }
  return { kind: 'unavailable' }
}

/** A operação ainda aceita tentativa de pagamento? (visão oficial do backend.) */
export function canAttemptPayment(
  view: Pick<OperationView, 'financialStatus' | 'operationalStatus'>,
): boolean {
  return view.financialStatus === 'unpaid' && view.operationalStatus === 'awaiting_payment'
}
