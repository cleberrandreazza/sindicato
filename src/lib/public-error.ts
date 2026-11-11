import { ConvexError } from 'convex/values'

/**
 * Erro público do backend (`convex/domain/publicErrors.ts`): `{ code, message }` dentro de um
 * `ConvexError`. Qualquer outra falha (rede, indisponibilidade, erro inesperado do servidor) não
 * é um erro público e não deve ter o texto repassado à tela.
 */
export interface PublicErrorShape {
  code: string
  message?: unknown
}

export function readPublicError(error: unknown): PublicErrorShape | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null) return null
  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null
  return { code, message: (data as { message?: unknown }).message }
}

/** Texto do backend quando existir; senão o de reserva. */
export function messageOr(error: PublicErrorShape, fallback: string): string {
  return typeof error.message === 'string' && error.message !== '' ? error.message : fallback
}
