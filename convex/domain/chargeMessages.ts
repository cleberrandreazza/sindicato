import {
  CARD_PENDING_MESSAGE,
  CHARGE_CANCELED_MESSAGE,
  CHARGE_FAILED_MESSAGE,
  EXPIRED_MESSAGE,
  PIX_PENDING_MESSAGE,
  type OperationPresentation,
} from './messages'
import type { PaymentMethod, TransactionStatus } from './statuses'

/**
 * Mensagem de resultado de UMA cobrança, para o associado.
 *
 * - `pending`: aguardando; nunca é apresentada como pagamento recebido.
 * - `succeeded`: usa a mensagem da OPERAÇÃO, porque "o provedor aprovou" não significa
 *   "utilização liberada": um recebimento tardio ou divergente fica em análise e a mensagem
 *   correta é a da análise.
 * - `failed`, `canceled`, `expired`: sem recebimento; o texto deixa isso explícito.
 */
export function describeChargeForMember(input: {
  readonly method: PaymentMethod
  readonly status: TransactionStatus
  readonly operation: OperationPresentation
}): string {
  switch (input.status) {
    case 'pending':
      return input.method === 'pix' ? PIX_PENDING_MESSAGE : CARD_PENDING_MESSAGE
    case 'succeeded':
      return input.operation.message
    case 'failed':
      return CHARGE_FAILED_MESSAGE
    case 'canceled':
      return CHARGE_CANCELED_MESSAGE
    case 'expired':
      return EXPIRED_MESSAGE
  }
}
