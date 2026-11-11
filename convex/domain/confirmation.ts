import { isExpired } from './pricing'
import type {
  FinancialStatus,
  OperationalStatus,
  ReviewReason,
  TransactionStatus,
} from './statuses'

/**
 * Decisão sobre uma notificação de pagamento do provedor. Função pura e determinística:
 * a mutation apenas executa o que ela decide, o que permite testar todos os cenários sem banco.
 *
 * Princípios:
 * 1. Notificação repetida não altera nada (idempotência).
 * 2. Dinheiro efetivamente recebido nunca é descartado, mesmo com a operação expirada.
 * 3. "No prazo" é decidido pelo instante do recebimento informado pelo provedor
 *    (`occurredAt`), não pelo momento em que a notificação chegou.
 * 4. Qualquer situação fora do caminho feliz vai para análise administrativa; nada é liberado
 *    automaticamente e nenhum reembolso é iniciado.
 */

export interface ConfirmationInput {
  readonly operation: {
    readonly financialStatus: FinancialStatus
    readonly operationalStatus: OperationalStatus
    readonly expiresAt: number
    readonly totalAmountCents: number
  }
  readonly transaction: { readonly status: TransactionStatus }
  readonly confirmation: {
    readonly status: TransactionStatus
    readonly amountCents: number
    readonly occurredAt: number
  }
}

export type ConfirmationDecision =
  /** Notificação já refletida no estado atual (repetida ou fora de ordem). */
  | { readonly kind: 'ignore' }
  /** Evento sem recebimento (falha, cancelamento, expiração no provedor). */
  | { readonly kind: 'update_transaction'; readonly status: TransactionStatus }
  /** Recebido no prazo e com valor correto: financeiro `paid`, operacional `confirmed`. */
  | { readonly kind: 'settle'; readonly reclaimClaims: boolean }
  /** Recebido, mas exige análise administrativa. */
  | {
      readonly kind: 'review'
      readonly reason: ReviewReason
      /** Novo estado financeiro; `null` mantém o atual. */
      readonly financialStatus: FinancialStatus | null
      /** Se `false`, a operação não muda: apenas a análise é aberta. */
      readonly escalateOperation: boolean
      /** A operação expirou e liberou as reservas; é preciso tentar retomá-las. */
      readonly reclaimClaims: boolean
    }

export function decideConfirmation({
  operation,
  transaction,
  confirmation,
}: ConfirmationInput): ConfirmationDecision {
  if (confirmation.status !== 'succeeded') {
    // `succeeded` nunca é rebaixado e o mesmo estado repetido não faz nada.
    if (transaction.status === 'succeeded' || transaction.status === confirmation.status) {
      return { kind: 'ignore' }
    }
    if (transaction.status !== 'pending') return { kind: 'ignore' }
    return { kind: 'update_transaction', status: confirmation.status }
  }

  if (transaction.status === 'succeeded') return { kind: 'ignore' }

  const reclaimClaims = operation.operationalStatus === 'expired'

  // Só operações abertas (`awaiting_payment`) ou recém-expiradas e sem recebimento podem ser
  // liquidadas automaticamente. Qualquer outro caso (já paga, em análise, encerrada) é um
  // recebimento inesperado: possível cobrança duplicada, que um administrador deve avaliar.
  const isSettleable =
    operation.operationalStatus === 'awaiting_payment' || operation.operationalStatus === 'expired'
  if (operation.financialStatus !== 'unpaid' || !isSettleable) {
    return {
      kind: 'review',
      reason: 'unexpected_payment',
      financialStatus: null,
      escalateOperation: false,
      reclaimClaims: false,
    }
  }

  if (confirmation.amountCents !== operation.totalAmountCents) {
    return {
      kind: 'review',
      reason: 'amount_mismatch',
      financialStatus: null,
      escalateOperation: true,
      reclaimClaims,
    }
  }

  if (isExpired(operation.expiresAt, confirmation.occurredAt)) {
    return {
      kind: 'review',
      reason: 'late_payment',
      financialStatus: 'paid_late',
      escalateOperation: true,
      reclaimClaims,
    }
  }

  return { kind: 'settle', reclaimClaims }
}
