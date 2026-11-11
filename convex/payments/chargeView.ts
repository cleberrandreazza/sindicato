import type { Doc, Id } from '../_generated/dataModel'
import { describeChargeForMember } from '../domain/chargeMessages'
import { describeOperationForMember, type OperationPresentation } from '../domain/messages'
import { isExpired } from '../domain/pricing'
import type {
  FinancialStatus,
  OperationalStatus,
  PaymentMethod,
  PixQrCode,
  TransactionStatus,
} from '../domain/statuses'

/**
 * O que o associado enxerga de uma cobrança e do estado da operação. Montado campo a campo: não
 * devolve o id do provedor, a chave de idempotência nem nenhum dado interno.
 */

export interface PaymentView {
  /** Identificador da cobrança para o associado (id local, não o do provedor). */
  paymentId: Id<'paymentTransactions'>
  method: PaymentMethod
  /**
   * Estado DA COBRANÇA (uma tentativa de pagamento). `succeeded` aqui significa "o provedor
   * aprovou"; a liberação da utilização é decidida pelo estado da operação.
   * `failed`, `canceled` e `expired` significam que NENHUM recebimento foi identificado.
   */
  status: TransactionStatus
  /** Valor da cobrança em centavos, sempre o valor armazenado da operação. */
  amountCents: number
  /** Mensagem de resultado, pronta para exibir. */
  message: string
  /** Dados para pagar; somente enquanto o Pix está pendente. */
  pix: { copyPasteCode: string; qrCode: PixQrCode; expiresAt: number } | null
}

export interface OperationStateView {
  /** Estado operacional exibido (vira `expired` quando o prazo passou). */
  operationalStatus: OperationalStatus
  financialStatus: FinancialStatus
  presentation: OperationPresentation
}

type OperationState = Pick<
  Doc<'paymentOperations'>,
  'financialStatus' | 'operationalStatus' | 'expiresAt'
>

export function describeOperationState(
  operation: OperationState,
  nowMs: number,
): OperationStateView {
  const operationalStatus: OperationalStatus =
    operation.operationalStatus === 'awaiting_payment' && isExpired(operation.expiresAt, nowMs)
      ? 'expired'
      : operation.operationalStatus
  return {
    operationalStatus,
    financialStatus: operation.financialStatus,
    presentation: describeOperationForMember({
      financialStatus: operation.financialStatus,
      operationalStatus,
    }),
  }
}

export function buildPaymentView(
  operation: OperationState,
  transaction: Doc<'paymentTransactions'>,
  nowMs: number,
): PaymentView {
  const state = describeOperationState(operation, nowMs)
  const showPix =
    transaction.method === 'pix' &&
    transaction.status === 'pending' &&
    transaction.pixCopyPasteCode !== undefined &&
    transaction.qrCode !== undefined
  return {
    paymentId: transaction._id,
    method: transaction.method,
    status: transaction.status,
    amountCents: transaction.amountCents,
    message: describeChargeForMember({
      method: transaction.method,
      status: transaction.status,
      operation: state.presentation,
    }),
    pix:
      showPix && transaction.pixCopyPasteCode !== undefined && transaction.qrCode !== undefined
        ? {
            copyPasteCode: transaction.pixCopyPasteCode,
            qrCode: transaction.qrCode,
            expiresAt: transaction.chargeExpiresAt ?? operation.expiresAt,
          }
        : null,
  }
}

export interface StartPaymentResult {
  payment: PaymentView
  operation: OperationStateView
  /** `true` quando a cobrança já existia e foi apenas devolvida (nenhuma cobrança nova). */
  reused: boolean
}

export function buildStartPaymentResult(
  operation: OperationState,
  transaction: Doc<'paymentTransactions'>,
  reused: boolean,
  nowMs: number,
): StartPaymentResult {
  return {
    payment: buildPaymentView(operation, transaction, nowMs),
    operation: describeOperationState(operation, nowMs),
    reused,
  }
}
