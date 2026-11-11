import { messageOr, readPublicError } from '@/lib/public-error'
import type { CheckDuplicatesResult } from '../api/check-usage-date'

/**
 * Traduz a resposta de `public/payments:checkDuplicates` no que a tela precisa decidir. Quem
 * aceita a data e quem tem conflito é sempre o backend; aqui só se classifica o resultado.
 */
export type UsageDateOutcome =
  /** O backend aceitou a data e nenhuma das pessoas tem operação incompatível nela. */
  | { kind: 'accepted' }
  /** Pessoas da PRÓPRIA seleção com operação incompatível, só pelos nomes que o backend devolveu. */
  | { kind: 'conflict'; names: string[] }
  /** O backend recusou a data ou a seleção (texto pronto em pt-BR). */
  | { kind: 'rejected'; message: string }
  /** A prova de identificação não vale mais: é preciso se identificar de novo. */
  | { kind: 'session_expired' }
  | { kind: 'unavailable' }

const REJECTED_FALLBACK = 'Não foi possível validar a data. Revise a data e as pessoas escolhidas.'

export function interpretUsageDateResult(result: CheckDuplicatesResult): UsageDateOutcome {
  if (result.ok) {
    if (!result.hasConflicts) return { kind: 'accepted' }
    // Só os nomes: a resposta já é restrita às pessoas selecionadas e não diz de quem é a
    // operação conflitante. Nome ausente não vira texto inventado.
    const names = result.conflicts.map((person) => person.name).filter((name) => name !== '')
    return { kind: 'conflict', names }
  }
  // Titular não encontrado: o backend pede nova identificação.
  if (result.code === 'member_not_found') return { kind: 'session_expired' }
  return { kind: 'rejected', message: result.message || REJECTED_FALLBACK }
}

/**
 * Prova inválida ou expirada vira `session_expired`. Erros públicos de validação viram recusa.
 * Qualquer outra falha (rede, servidor, erro inesperado) vira `unavailable`, sem expor o motivo.
 */
export function interpretUsageDateError(error: unknown): UsageDateOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unavailable' }
  if (publicError.code === 'session_invalid') return { kind: 'session_expired' }
  if (
    publicError.code === 'invalid_selection' ||
    publicError.code === 'link_not_found' ||
    publicError.code === 'invalid_usage_date' ||
    publicError.code === 'past_usage_date'
  ) {
    return { kind: 'rejected', message: messageOr(publicError, REJECTED_FALLBACK) }
  }
  return { kind: 'unavailable' }
}
