import { describe, expect, it } from 'vitest'
import {
  PAYMENT_WINDOW_MS,
  POOL_MEDICAL_FEE_CENTS,
  calculateExpiresAt,
  calculateOperationAmounts,
  isExpired,
} from '../../convex/domain/pricing'

describe('cálculo da taxa médica', () => {
  it('cobra R$ 30,00 (3000 centavos) por pessoa', () => {
    expect(POOL_MEDICAL_FEE_CENTS).toBe(3000)
    expect(calculateOperationAmounts(1)).toEqual({
      quantity: 1,
      unitAmountCents: 3000,
      totalAmountCents: 3000,
    })
  })

  it('multiplica o valor unitário pela quantidade de pessoas', () => {
    expect(calculateOperationAmounts(3).totalAmountCents).toBe(9000)
    expect(calculateOperationAmounts(5).totalAmountCents).toBe(15000)
  })

  it('trabalha apenas com inteiros em centavos', () => {
    const { unitAmountCents, totalAmountCents } = calculateOperationAmounts(7)
    expect(Number.isInteger(unitAmountCents)).toBe(true)
    expect(Number.isInteger(totalAmountCents)).toBe(true)
  })

  it('rejeita quantidade inválida', () => {
    expect(() => calculateOperationAmounts(0)).toThrow(RangeError)
    expect(() => calculateOperationAmounts(-1)).toThrow(RangeError)
    expect(() => calculateOperationAmounts(1.5)).toThrow(RangeError)
    expect(() => calculateOperationAmounts(Number.NaN)).toThrow(RangeError)
  })

  it('rejeita valor unitário inválido', () => {
    expect(() => calculateOperationAmounts(1, 0)).toThrow(RangeError)
    expect(() => calculateOperationAmounts(1, 10.5)).toThrow(RangeError)
  })
})

describe('prazo de 15 minutos', () => {
  const createdAt = Date.UTC(2026, 11, 1, 15, 0, 0)

  it('define a janela de pagamento em 15 minutos', () => {
    expect(PAYMENT_WINDOW_MS).toBe(15 * 60 * 1000)
    expect(calculateExpiresAt(createdAt)).toBe(createdAt + 900_000)
  })

  it('não expira antes de 15 minutos e expira exatamente em 15 minutos', () => {
    const expiresAt = calculateExpiresAt(createdAt)
    expect(isExpired(expiresAt, createdAt)).toBe(false)
    expect(isExpired(expiresAt, expiresAt - 1)).toBe(false)
    expect(isExpired(expiresAt, expiresAt)).toBe(true)
    expect(isExpired(expiresAt, expiresAt + 1)).toBe(true)
  })
})
