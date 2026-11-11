/**
 * Regras financeiras. Todos os valores são inteiros em centavos (BRL).
 * Este módulo roda apenas no backend; o frontend nunca informa valores de cobrança.
 */

/** Taxa médica inicial por pessoa: R$ 30,00. */
export const POOL_MEDICAL_FEE_CENTS = 3_000

/** Prazo para conclusão do pagamento: 15 minutos. */
export const PAYMENT_WINDOW_MS = 15 * 60 * 1000

export interface OperationAmounts {
  readonly quantity: number
  readonly unitAmountCents: number
  readonly totalAmountCents: number
}

export function calculateOperationAmounts(
  quantity: number,
  unitAmountCents: number = POOL_MEDICAL_FEE_CENTS,
): OperationAmounts {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError('A quantidade de pessoas deve ser um inteiro maior ou igual a 1.')
  }
  if (!Number.isSafeInteger(unitAmountCents) || unitAmountCents < 1) {
    throw new RangeError('O valor unitário deve ser um inteiro positivo em centavos.')
  }
  return { quantity, unitAmountCents, totalAmountCents: quantity * unitAmountCents }
}

export function calculateExpiresAt(createdAtMs: number): number {
  return createdAtMs + PAYMENT_WINDOW_MS
}

export function isExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs
}
