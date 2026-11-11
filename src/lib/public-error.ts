import { ConvexError } from 'convex/values'

/**
 * Erro público do backend (`convex/domain/publicErrors.ts`): `{ code, message }` dentro de um
 * `ConvexError`. Qualquer outra falha (rede, indisponibilidade, erro inesperado do servidor) não
 * é um erro público e não deve ter o texto repassado à tela.
 */
export interface PublicErrorShape {
  code: string
  message?: unknown
  /** Só presente em `duplicate_usage`: nomes das pessoas da PRÓPRIA seleção em conflito. */
  names?: unknown
}

export function readPublicError(error: unknown): PublicErrorShape | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null) return null
  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null
  const { message, names } = data as { message?: unknown; names?: unknown }
  return { code, message, names }
}

/** Texto do backend quando existir; senão o de reserva. */
export function messageOr(error: PublicErrorShape, fallback: string): string {
  return typeof error.message === 'string' && error.message !== '' ? error.message : fallback
}

/** Lista de textos (ex.: `names`); ignora qualquer valor que não seja texto não vazio. */
export function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}
