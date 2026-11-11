import { messageOr, readPublicError, readStrings } from '@/lib/public-error'
import type { CreateOperationResult, OperationView } from '../api/create-operation'
import type { CreatedOperation } from './created-operation'

/**
 * Traduz o que o backend respondeu à criação da operação no que a tela precisa decidir. Quem
 * decide é sempre o backend; aqui só se classifica o resultado.
 *
 * Importante: só há "falha" quando o backend RESPONDEU que não criou. Qualquer coisa que não seja
 * uma resposta do backend (rede, tempo esgotado, erro inesperado) é `unknown`: o resultado é
 * desconhecido, a operação pode ter sido criada, e a tela nunca afirma que falhou.
 */
export type ConfirmationOutcome =
  | { kind: 'created'; operation: CreatedOperation }
  /** A prova de identificação não vale mais: é preciso se identificar de novo. */
  | { kind: 'session_expired' }
  /** O backend recusou e NADA foi criado. `reason` indica o que corrigir. */
  | { kind: 'rejected'; reason: 'selection' | 'date' | 'other'; message: string }
  /** Já existe operação pendente/paga para pessoas da seleção nesta data. Nada foi criado. */
  | { kind: 'duplicate'; names: string[]; message: string }
  | { kind: 'unknown' }

const FALLBACK = 'Não foi possível criar a operação. Revise os dados e tente novamente.'

const SELECTION_CODES = new Set([
  'empty_selection',
  'duplicate_person',
  'link_not_found',
  'link_inactive',
  'member_inactive',
  'invalid_selection',
])
const DATE_CODES = new Set(['invalid_usage_date', 'past_usage_date'])
const OTHER_REJECTION_CODES = new Set([
  'request_id_conflict',
  'invalid_request_id',
  'operation_not_recoverable',
  'too_many_requests',
])

export function interpretCreateResult(result: CreateOperationResult): ConfirmationOutcome {
  return {
    kind: 'created',
    operation: {
      operationId: result.operationId,
      accessToken: result.accessToken,
      usageDate: result.usageDate,
      quantity: result.quantity,
      unitAmountCents: result.unitAmountCents,
      totalAmountCents: result.totalAmountCents,
      expiresAt: result.expiresAt,
      people: result.people,
      recovered: result.reused,
    },
  }
}

export function interpretCreateError(error: unknown): ConfirmationOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unknown' }

  const { code } = publicError
  if (code === 'session_invalid' || code === 'member_not_found') return { kind: 'session_expired' }
  if (code === 'duplicate_usage') {
    return {
      kind: 'duplicate',
      names: readStrings(publicError.names),
      message: messageOr(publicError, FALLBACK),
    }
  }
  if (SELECTION_CODES.has(code)) {
    return { kind: 'rejected', reason: 'selection', message: messageOr(publicError, FALLBACK) }
  }
  if (DATE_CODES.has(code)) {
    return { kind: 'rejected', reason: 'date', message: messageOr(publicError, FALLBACK) }
  }
  if (OTHER_REJECTION_CODES.has(code)) {
    return { kind: 'rejected', reason: 'other', message: messageOr(publicError, FALLBACK) }
  }
  // Inclusive `service_unavailable`: nada garante que o servidor não tenha chegado a criar.
  return { kind: 'unknown' }
}

/**
 * Estado OFICIAL de uma operação recuperada (`getOperation`). Só uma operação ainda pendente,
 * sem pagamento e dentro do prazo, segue para a etapa de pagamento.
 */
export type RecoveredOperationCheck =
  { usable: true } | { usable: false; expired: boolean; message: string }

export function checkRecoveredOperation(view: OperationView): RecoveredOperationCheck {
  if (view.financialStatus === 'unpaid' && view.operationalStatus === 'awaiting_payment') {
    return { usable: true }
  }
  return {
    usable: false,
    expired: view.operationalStatus === 'expired',
    message: view.presentation.message,
  }
}
