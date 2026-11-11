/** Por que o associado voltou à identificação (vai na URL como `?motivo=`). */
export type ReturnReason = 'sessao-expirada' | 'identificacao-necessaria'

const RETURN_REASONS: readonly ReturnReason[] = ['sessao-expirada', 'identificacao-necessaria']

/** Aceita só motivos conhecidos; qualquer outro valor (ex.: vindo da URL) é descartado. */
export function parseReturnReason(value: unknown): ReturnReason | undefined {
  return RETURN_REASONS.find((reason) => reason === value)
}
