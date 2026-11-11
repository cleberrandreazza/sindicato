import { describe, expect, it } from 'vitest'
import { decideConfirmation, type ConfirmationInput } from '../../convex/domain/confirmation'

const EXPIRES_AT = Date.UTC(2026, 11, 1, 15, 15, 0)
const BEFORE_DEADLINE = EXPIRES_AT - 60_000
const AFTER_DEADLINE = EXPIRES_AT + 60_000

function input(overrides: {
  operation?: Partial<ConfirmationInput['operation']>
  transaction?: Partial<ConfirmationInput['transaction']>
  confirmation?: Partial<ConfirmationInput['confirmation']>
}): ConfirmationInput {
  return {
    operation: {
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
      expiresAt: EXPIRES_AT,
      totalAmountCents: 6000,
      ...overrides.operation,
    },
    transaction: { status: 'pending', ...overrides.transaction },
    confirmation: {
      status: 'succeeded',
      amountCents: 6000,
      occurredAt: BEFORE_DEADLINE,
      ...overrides.confirmation,
    },
  }
}

describe('pagamento confirmado dentro do prazo', () => {
  it('liquida a operação', () => {
    expect(decideConfirmation(input({}))).toEqual({ kind: 'settle', reclaimClaims: false })
  })

  it('usa o instante do recebimento, não o da chegada da notificação', () => {
    // Pago no prazo; a notificação só chega depois e a expiração já foi processada.
    const decision = decideConfirmation(
      input({
        operation: { operationalStatus: 'expired' },
        confirmation: { occurredAt: BEFORE_DEADLINE },
      }),
    )
    expect(decision).toEqual({ kind: 'settle', reclaimClaims: true })
  })
})

describe('pagamento confirmado depois do prazo', () => {
  it('registra como paid_late e envia para análise, sem liberar', () => {
    expect(decideConfirmation(input({ confirmation: { occurredAt: AFTER_DEADLINE } }))).toEqual({
      kind: 'review',
      reason: 'late_payment',
      financialStatus: 'paid_late',
      escalateOperation: true,
      reclaimClaims: false,
    })
  })

  it('considera atrasado o recebimento exatamente no instante de expiração', () => {
    const decision = decideConfirmation(input({ confirmation: { occurredAt: EXPIRES_AT } }))
    expect(decision).toMatchObject({ kind: 'review', reason: 'late_payment' })
  })

  it('não descarta o pagamento quando a operação já expirou: pede para retomar as reservas', () => {
    const decision = decideConfirmation(
      input({
        operation: { operationalStatus: 'expired' },
        confirmation: { occurredAt: AFTER_DEADLINE },
      }),
    )
    expect(decision).toEqual({
      kind: 'review',
      reason: 'late_payment',
      financialStatus: 'paid_late',
      escalateOperation: true,
      reclaimClaims: true,
    })
  })

  it('é atrasado mesmo que a expiração ainda não tenha sido processada', () => {
    const decision = decideConfirmation(
      input({
        operation: { operationalStatus: 'awaiting_payment' },
        confirmation: { occurredAt: AFTER_DEADLINE },
      }),
    )
    expect(decision).toMatchObject({ kind: 'review', reason: 'late_payment', reclaimClaims: false })
  })
})

describe('transição para análise administrativa', () => {
  it('valor recebido diferente do valor da operação vai para análise, sem alterar o financeiro', () => {
    expect(decideConfirmation(input({ confirmation: { amountCents: 3000 } }))).toEqual({
      kind: 'review',
      reason: 'amount_mismatch',
      financialStatus: null,
      escalateOperation: true,
      reclaimClaims: false,
    })
  })

  it('segundo recebimento em operação já paga abre análise sem mexer na operação', () => {
    const decision = decideConfirmation(
      input({ operation: { financialStatus: 'paid', operationalStatus: 'confirmed' } }),
    )
    expect(decision).toEqual({
      kind: 'review',
      reason: 'unexpected_payment',
      financialStatus: null,
      escalateOperation: false,
      reclaimClaims: false,
    })
  })

  it('operação já em análise nunca é liquidada automaticamente por novo pagamento', () => {
    const decision = decideConfirmation(
      input({ operation: { financialStatus: 'unpaid', operationalStatus: 'under_review' } }),
    )
    expect(decision).toMatchObject({
      kind: 'review',
      reason: 'unexpected_payment',
      escalateOperation: false,
    })
  })

  it('operação rejeitada que recebe pagamento vai para análise', () => {
    const decision = decideConfirmation(input({ operation: { operationalStatus: 'rejected' } }))
    expect(decision).toMatchObject({ kind: 'review', reason: 'unexpected_payment' })
  })
})

describe('notificações repetidas e confirmação duplicada', () => {
  it('ignora notificação de sucesso para transação já bem-sucedida', () => {
    const decision = decideConfirmation(input({ transaction: { status: 'succeeded' } }))
    expect(decision).toEqual({ kind: 'ignore' })
  })

  it('ignora a repetição mesmo se o recebimento original foi tardio', () => {
    const decision = decideConfirmation(
      input({
        operation: { financialStatus: 'paid_late', operationalStatus: 'under_review' },
        transaction: { status: 'succeeded' },
        confirmation: { occurredAt: AFTER_DEADLINE },
      }),
    )
    expect(decision).toEqual({ kind: 'ignore' })
  })

  it('não rebaixa uma transação bem-sucedida com evento de falha fora de ordem', () => {
    const decision = decideConfirmation(
      input({ transaction: { status: 'succeeded' }, confirmation: { status: 'failed' } }),
    )
    expect(decision).toEqual({ kind: 'ignore' })
  })

  it('ignora o mesmo evento sem recebimento repetido', () => {
    const decision = decideConfirmation(
      input({ transaction: { status: 'failed' }, confirmation: { status: 'failed' } }),
    )
    expect(decision).toEqual({ kind: 'ignore' })
  })

  it('atualiza a transação em eventos sem recebimento', () => {
    expect(decideConfirmation(input({ confirmation: { status: 'failed' } }))).toEqual({
      kind: 'update_transaction',
      status: 'failed',
    })
  })

  it('aceita sucesso mesmo depois de a transação ter sido marcada como expirada/falha', () => {
    for (const status of ['failed', 'expired', 'canceled'] as const) {
      const decision = decideConfirmation(input({ transaction: { status } }))
      expect(decision.kind).toBe('settle')
    }
  })
})
