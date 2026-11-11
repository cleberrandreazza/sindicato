import { describe, expect, it } from 'vitest'
import {
  canTransitionFinancial,
  canTransitionOperational,
  canTransitionTransaction,
} from '../../convex/domain/statuses'

describe('estado operacional', () => {
  it('permite os caminhos previstos', () => {
    expect(canTransitionOperational('awaiting_payment', 'confirmed')).toBe(true)
    expect(canTransitionOperational('awaiting_payment', 'expired')).toBe(true)
    expect(canTransitionOperational('awaiting_payment', 'under_review')).toBe(true)
    expect(canTransitionOperational('expired', 'under_review')).toBe(true)
    expect(canTransitionOperational('under_review', 'confirmed')).toBe(true)
    expect(canTransitionOperational('under_review', 'rejected')).toBe(true)
  })

  it('operação expirada só volta por confirmação no prazo ou por análise, nunca reabre nem é rejeitada direto', () => {
    expect(canTransitionOperational('expired', 'rejected')).toBe(false)
    expect(canTransitionOperational('expired', 'awaiting_payment')).toBe(false)
  })

  it('estados finais não têm saída', () => {
    for (const to of [
      'awaiting_payment',
      'expired',
      'under_review',
      'rejected',
      'confirmed',
    ] as const) {
      expect(canTransitionOperational('confirmed', to)).toBe(false)
      expect(canTransitionOperational('rejected', to)).toBe(false)
    }
  })
})

describe('estado financeiro', () => {
  it('só sai de unpaid e nunca volta', () => {
    expect(canTransitionFinancial('unpaid', 'paid')).toBe(true)
    expect(canTransitionFinancial('unpaid', 'paid_late')).toBe(true)
    expect(canTransitionFinancial('paid', 'unpaid')).toBe(false)
    expect(canTransitionFinancial('paid_late', 'paid')).toBe(false)
  })
})

describe('estado da transação', () => {
  it('succeeded é terminal', () => {
    for (const to of ['pending', 'failed', 'canceled', 'expired', 'succeeded'] as const) {
      expect(canTransitionTransaction('succeeded', to)).toBe(false)
    }
  })

  it('qualquer estado pode evoluir para succeeded (recebimento efetivo não é descartado)', () => {
    for (const from of ['pending', 'failed', 'canceled', 'expired'] as const) {
      expect(canTransitionTransaction(from, 'succeeded')).toBe(true)
    }
  })

  it('só pending evolui para os demais estados', () => {
    expect(canTransitionTransaction('pending', 'failed')).toBe(true)
    expect(canTransitionTransaction('failed', 'expired')).toBe(false)
  })
})
