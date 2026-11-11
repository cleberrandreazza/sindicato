import { isExpired } from './pricing'
import type {
  FinancialStatus,
  OperationalStatus,
  PaymentMethod,
  TransactionStatus,
} from './statuses'

/**
 * Regras puras da criação de cobranças (sem banco, sem provider). A mutation apenas carrega os
 * dados e executa o que estas funções decidem.
 *
 * Três estados diferentes, que nunca se confundem:
 * - ESTADO DA COBRANÇA (`paymentTransactions.status`): o que o provedor diz sobre UMA tentativa
 *   de pagamento (`pending | succeeded | failed | canceled | expired`).
 * - ESTADO FINANCEIRO da operação: o dinheiro foi recebido? (`unpaid | paid | paid_late`)
 * - ESTADO OPERACIONAL da operação: o direito de uso foi liberado? (`awaiting_payment |
 *   confirmed | expired | under_review | rejected`)
 * Cobrança `failed`, `canceled` ou `expired` NUNCA altera o estado financeiro: só um recebimento
 * (`succeeded`), validado por `decideConfirmation`, move a operação para `paid`/`paid_late`.
 */

export type NotPayableReason =
  | 'operation_expired'
  | 'operation_already_paid'
  | 'operation_under_review'
  | 'operation_closed'
  | 'invalid_operation_amount'

export type PayableCheck =
  { readonly ok: true } | { readonly ok: false; readonly code: NotPayableReason }

export interface PayableOperation {
  readonly financialStatus: FinancialStatus
  readonly operationalStatus: OperationalStatus
  readonly expiresAt: number
  readonly quantity: number
  readonly unitAmountCents: number
  readonly totalAmountCents: number
}

/**
 * A operação pode receber uma nova cobrança?
 *
 * A ordem importa: um recebimento já identificado (mesmo tardio) prevalece sobre "expirada",
 * para que o associado não seja orientado a pagar de novo.
 *
 * O valor é conferido de forma independente: a quantidade de pessoas gravadas precisa bater com a
 * `quantity` da operação, e o total precisa ser `quantity × unitAmountCents`, inteiro e positivo.
 * Qualquer inconsistência bloqueia a cobrança (fail closed) em vez de cobrar um valor duvidoso.
 */
export function checkOperationPayable(
  operation: PayableOperation,
  selectedPeopleCount: number,
  nowMs: number,
): PayableCheck {
  if (operation.financialStatus === 'paid' || operation.operationalStatus === 'confirmed') {
    return { ok: false, code: 'operation_already_paid' }
  }
  if (operation.financialStatus === 'paid_late' || operation.operationalStatus === 'under_review') {
    return { ok: false, code: 'operation_under_review' }
  }
  if (operation.operationalStatus === 'rejected') {
    return { ok: false, code: 'operation_closed' }
  }
  if (operation.operationalStatus === 'expired' || isExpired(operation.expiresAt, nowMs)) {
    return { ok: false, code: 'operation_expired' }
  }

  const { quantity, unitAmountCents, totalAmountCents } = operation
  const validAmount =
    Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    selectedPeopleCount === quantity &&
    Number.isSafeInteger(unitAmountCents) &&
    unitAmountCents >= 1 &&
    Number.isSafeInteger(totalAmountCents) &&
    totalAmountCents >= 1 &&
    totalAmountCents === quantity * unitAmountCents
  if (!validAmount) return { ok: false, code: 'invalid_operation_amount' }

  return { ok: true }
}

export interface ChargeAttemptSummary {
  readonly attempt: number
  readonly method: PaymentMethod
  readonly state: 'creating' | 'created' | 'error'
  /** Instante (ms) em que a tentativa foi iniciada (ou retomada). */
  readonly startedAt: number
}

export interface ChargeTransactionSummary {
  readonly method: PaymentMethod
  readonly status: TransactionStatus
}

export type ChargePlan =
  /** Já existe cobrança em aberto compatível: devolver a mesma, sem chamar o provedor. */
  | { readonly kind: 'reuse_existing' }
  /** Existe cobrança em aberto de OUTRA forma de pagamento. */
  | { readonly kind: 'conflict' }
  /** Outra chamada está criando a cobrança neste momento. */
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'too_many_attempts' }
  /** Criar (ou retomar) a tentativa `attempt`. `resume` mantém a chave de idempotência. */
  | { readonly kind: 'create'; readonly attempt: number; readonly resume: boolean }

/**
 * Decide o que fazer ao receber um pedido de cobrança, olhando as tentativas e as transações
 * anteriores da operação. Garante UMA cobrança em aberto por operação:
 *
 * - cobrança `pending` da mesma forma de pagamento → reaproveita (idempotência);
 * - cobrança `pending` de outra forma → conflito (evita dois pagamentos simultâneos);
 * - tentativa em andamento recente → `in_progress` (chamada simultânea);
 * - tentativa em andamento antiga (processo interrompido) ou terminada em erro, da mesma forma
 *   de pagamento → retoma com a MESMA chave de idempotência, para que o provedor devolva a mesma
 *   cobrança caso ela já tenha sido criada;
 * - cobrança anterior recusada/cancelada/expirada → nova tentativa, até o limite.
 *
 * Cobrança `succeeded` não chega aqui: `checkOperationPayable` já recusou a operação.
 */
export function planCharge(input: {
  readonly method: PaymentMethod
  readonly attempts: readonly ChargeAttemptSummary[]
  readonly transactions: readonly ChargeTransactionSummary[]
  readonly nowMs: number
  readonly staleAfterMs: number
  readonly maxAttempts: number
}): ChargePlan {
  const { method, attempts, transactions, nowMs, staleAfterMs, maxAttempts } = input

  const live = transactions.find((tx) => tx.status === 'pending')
  if (live) return live.method === method ? { kind: 'reuse_existing' } : { kind: 'conflict' }

  const last = attempts.reduce<ChargeAttemptSummary | null>(
    (latest, candidate) =>
      latest === null || candidate.attempt > latest.attempt ? candidate : latest,
    null,
  )

  if (last?.state === 'creating' && nowMs - last.startedAt < staleAfterMs) {
    return { kind: 'in_progress' }
  }
  if (last && last.state !== 'created' && last.method === method) {
    // Retomada: não conta como nova tentativa.
    return { kind: 'create', attempt: last.attempt, resume: true }
  }
  if (attempts.length >= maxAttempts) return { kind: 'too_many_attempts' }
  return { kind: 'create', attempt: (last?.attempt ?? 0) + 1, resume: false }
}

/** Chave de idempotência enviada ao provedor: estável para a mesma tentativa. */
export function chargeIdempotencyKey(
  operationId: string,
  method: PaymentMethod,
  attempt: number,
): string {
  return `op_${operationId}_${method}_${attempt}`
}
