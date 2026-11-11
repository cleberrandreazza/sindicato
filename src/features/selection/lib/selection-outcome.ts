import { messageOr, readPublicError } from '@/lib/public-error'
import type { ValidateSelectionResult } from '../api/validate-selection'

/**
 * Traduz a resposta de `public/members:validateSelection` no que a tela precisa decidir. A
 * elegibilidade de cada pessoa é decidida pelo backend; aqui só se classifica o resultado.
 */
export type ValidationOutcome =
  | { kind: 'valid'; quantity: number }
  /** O backend recusou a seleção (resultado normal, com texto pronto em pt-BR). */
  | { kind: 'rejected'; message: string }
  /** A prova de identificação não vale mais: é preciso se identificar de novo. */
  | { kind: 'session_expired' }
  | { kind: 'unavailable' }

const REJECTED_FALLBACK = 'Não foi possível validar a seleção. Revise as pessoas escolhidas.'

export function interpretValidationResult(result: ValidateSelectionResult): ValidationOutcome {
  if (result.ok) return { kind: 'valid', quantity: result.quantity }
  // Titular não encontrado: o backend pede nova identificação.
  if (result.code === 'member_not_found') return { kind: 'session_expired' }
  return { kind: 'rejected', message: result.message || REJECTED_FALLBACK }
}

/**
 * Prova inválida ou expirada vira `session_expired`. Qualquer outra falha (rede, servidor,
 * erro inesperado) vira `unavailable`, sem expor o motivo.
 */
export function interpretValidationError(error: unknown): ValidationOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unavailable' }
  if (publicError.code === 'session_invalid') return { kind: 'session_expired' }
  if (publicError.code === 'invalid_selection' || publicError.code === 'link_not_found') {
    return { kind: 'rejected', message: messageOr(publicError, REJECTED_FALLBACK) }
  }
  return { kind: 'unavailable' }
}
