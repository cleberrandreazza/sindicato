import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  isDeadlinePassed,
  remainingMs,
} from '../../src/features/payment/lib/countdown'
import {
  MOCK_CARD_TOKEN_APPROVED,
  MOCK_CARD_TOKEN_DECLINED,
  MOCK_CARD_SCENARIOS,
} from '../../src/features/payment/lib/mock-card-tokens'
import {
  canAttemptPayment,
  interpretGetError,
  interpretStartError,
  interpretStartResult,
} from '../../src/features/payment/lib/payment-outcome'
import type { StartPaymentResult } from '../../src/features/payment/api/start-payment'
import type { Id } from '../../convex/_generated/dataModel'

describe('countdown (expiresAt oficial do backend)', () => {
  const expiresAt = 1_000_000

  it('não reinicia: o restante depende só do expiresAt e do agora', () => {
    expect(remainingMs(expiresAt, expiresAt - 90_000)).toBe(90_000)
    expect(remainingMs(expiresAt, expiresAt - 90_000)).toBe(90_000) // idempotente
    expect(formatCountdown(90_000)).toBe('01:30')
    expect(formatCountdown(5_000)).toBe('00:05')
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('zera no instante oficial, sem valores negativos', () => {
    expect(remainingMs(expiresAt, expiresAt)).toBe(0)
    expect(remainingMs(expiresAt, expiresAt + 10_000)).toBe(0)
    expect(isDeadlinePassed(expiresAt, expiresAt)).toBe(true)
    expect(isDeadlinePassed(expiresAt, expiresAt - 1)).toBe(false)
  })
})

describe('tokens de cartão mock', () => {
  it('expõe só tokens fictícios, nunca dados de cartão', () => {
    expect(MOCK_CARD_TOKEN_APPROVED).toBe('tok_mock_approved')
    expect(MOCK_CARD_TOKEN_DECLINED).toBe('tok_mock_declined')
    for (const item of MOCK_CARD_SCENARIOS) {
      expect(item.token.startsWith('tok_mock_')).toBe(true)
      expect(item.label.toLowerCase()).toContain('simular')
      expect(item.token).not.toMatch(/\d{13,19}/)
    }
  })
})

describe('interpretStartError / interpretGetError', () => {
  it('operation_not_found pede nova identificação', () => {
    expect(
      interpretStartError(new ConvexError({ code: 'operation_not_found', message: 'x' })),
    ).toEqual({ kind: 'operation_gone' })
    expect(
      interpretGetError(new ConvexError({ code: 'operation_not_found', message: 'x' })),
    ).toEqual({ kind: 'operation_gone' })
  })

  it('operação fechada/expirada/em análise vira closed com a mensagem do backend', () => {
    const outcome = interpretStartError(
      new ConvexError({
        code: 'operation_expired',
        message: 'O prazo de 15 minutos para o pagamento terminou.',
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'operation_closed',
      code: 'operation_expired',
    })
  })

  it('conflito de método / token inválido vira rejected', () => {
    expect(
      interpretStartError(
        new ConvexError({ code: 'payment_method_conflict', message: 'Já existe Pix.' }),
      ),
    ).toMatchObject({ kind: 'rejected', code: 'payment_method_conflict' })
  })

  it('falha de rede é unavailable: resultado desconhecido', () => {
    expect(interpretStartError(new Error('network'))).toEqual({ kind: 'unavailable' })
    expect(interpretGetError('x')).toEqual({ kind: 'unavailable' })
  })

  it('start bem-sucedido devolve ready', () => {
    const result = {
      reused: false,
      payment: {
        paymentId: 'p1' as Id<'paymentTransactions'>,
        method: 'pix' as const,
        status: 'pending' as const,
        amountCents: 6000,
        message: 'Pix gerado.',
        pix: null,
      },
      operation: {
        operationalStatus: 'awaiting_payment' as const,
        financialStatus: 'unpaid' as const,
        presentation: { code: 'awaiting_payment' as const, message: 'Aguardando.' },
      },
    } satisfies StartPaymentResult
    expect(interpretStartResult(result)).toEqual({ kind: 'ready', result })
  })
})

describe('canAttemptPayment', () => {
  it('só unpaid + awaiting_payment', () => {
    expect(
      canAttemptPayment({ financialStatus: 'unpaid', operationalStatus: 'awaiting_payment' }),
    ).toBe(true)
    expect(canAttemptPayment({ financialStatus: 'paid', operationalStatus: 'confirmed' })).toBe(
      false,
    )
    expect(
      canAttemptPayment({ financialStatus: 'paid_late', operationalStatus: 'under_review' }),
    ).toBe(false)
    expect(canAttemptPayment({ financialStatus: 'unpaid', operationalStatus: 'expired' })).toBe(
      false,
    )
  })
})
