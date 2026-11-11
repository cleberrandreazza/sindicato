import { describe, expect, it } from 'vitest'
import {
  chargeIdempotencyKey,
  checkOperationPayable,
  planCharge,
  type ChargeAttemptSummary,
  type ChargeTransactionSummary,
  type PayableOperation,
} from '../../convex/domain/charges'
import { describeChargeForMember } from '../../convex/domain/chargeMessages'
import {
  CARD_PENDING_MESSAGE,
  CHARGE_CANCELED_MESSAGE,
  CHARGE_FAILED_MESSAGE,
  CONFIRMED_MESSAGE,
  EXPIRED_MESSAGE,
  LATE_PAYMENT_MESSAGE,
  PIX_PENDING_MESSAGE,
} from '../../convex/domain/messages'

const NOW = Date.UTC(2026, 11, 1, 15, 0, 0)
const STALE = 60_000

const open: PayableOperation = {
  financialStatus: 'unpaid',
  operationalStatus: 'awaiting_payment',
  expiresAt: NOW + 10 * 60_000,
  quantity: 2,
  unitAmountCents: 3_000,
  totalAmountCents: 6_000,
}

describe('checkOperationPayable', () => {
  it('aceita operação pendente, no prazo, com valor consistente', () => {
    expect(checkOperationPayable(open, 2, NOW)).toEqual({ ok: true })
  })

  it('recusa operação já paga (financeiro ou operacional)', () => {
    expect(checkOperationPayable({ ...open, financialStatus: 'paid' }, 2, NOW)).toEqual({
      ok: false,
      code: 'operation_already_paid',
    })
    expect(checkOperationPayable({ ...open, operationalStatus: 'confirmed' }, 2, NOW)).toEqual({
      ok: false,
      code: 'operation_already_paid',
    })
  })

  it('recebimento tardio/em análise prevalece sobre "expirada": não orienta a pagar de novo', () => {
    const late = {
      ...open,
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
      expiresAt: NOW - 1,
    } as const
    expect(checkOperationPayable(late, 2, NOW)).toEqual({
      ok: false,
      code: 'operation_under_review',
    })
  })

  it('recusa operação rejeitada pela análise', () => {
    expect(checkOperationPayable({ ...open, operationalStatus: 'rejected' }, 2, NOW)).toEqual({
      ok: false,
      code: 'operation_closed',
    })
  })

  it('recusa operação expirada, por status ou pelo relógio (mesmo sem a expiração agendada)', () => {
    expect(checkOperationPayable({ ...open, operationalStatus: 'expired' }, 2, NOW)).toEqual({
      ok: false,
      code: 'operation_expired',
    })
    expect(checkOperationPayable(open, 2, open.expiresAt)).toEqual({
      ok: false,
      code: 'operation_expired',
    })
    expect(checkOperationPayable(open, 2, open.expiresAt - 1)).toEqual({ ok: true })
  })

  it.each([
    ['sem pessoas selecionadas', open, 0],
    ['pessoas diferentes da quantidade', open, 1],
    ['total diferente de quantidade × unitário', { ...open, totalAmountCents: 1 }, 2],
    ['total zero', { ...open, totalAmountCents: 0 }, 2],
    ['total negativo', { ...open, totalAmountCents: -6_000 }, 2],
    ['total fracionário', { ...open, totalAmountCents: 6_000.5 }, 2],
    ['total não finito', { ...open, totalAmountCents: Number.POSITIVE_INFINITY }, 2],
    ['unitário zero', { ...open, unitAmountCents: 0, totalAmountCents: 0 }, 2],
    ['quantidade zero', { ...open, quantity: 0, totalAmountCents: 0 }, 0],
  ] as const)('fail closed: %s', (_label, operation, people) => {
    expect(checkOperationPayable(operation, people, NOW)).toEqual({
      ok: false,
      code: 'invalid_operation_amount',
    })
  })
})

describe('planCharge', () => {
  const base = { nowMs: NOW, staleAfterMs: STALE, maxAttempts: 3 }
  const attempt = (
    n: number,
    state: ChargeAttemptSummary['state'],
    method: ChargeAttemptSummary['method'] = 'pix',
    startedAt = NOW,
  ): ChargeAttemptSummary => ({ attempt: n, method, state, startedAt })
  const tx = (
    status: ChargeTransactionSummary['status'],
    method: ChargeTransactionSummary['method'] = 'pix',
  ): ChargeTransactionSummary => ({ method, status })

  it('primeira cobrança: cria a tentativa 1', () => {
    expect(planCharge({ ...base, method: 'pix', attempts: [], transactions: [] })).toEqual({
      kind: 'create',
      attempt: 1,
      resume: false,
    })
  })

  it('cobrança pendente da mesma forma de pagamento: reaproveita (idempotência)', () => {
    expect(
      planCharge({
        ...base,
        method: 'pix',
        attempts: [attempt(1, 'created')],
        transactions: [tx('pending')],
      }),
    ).toEqual({ kind: 'reuse_existing' })
  })

  it('cobrança pendente de OUTRA forma de pagamento: conflito', () => {
    expect(
      planCharge({
        ...base,
        method: 'card',
        attempts: [attempt(1, 'created')],
        transactions: [tx('pending', 'pix')],
      }),
    ).toEqual({ kind: 'conflict' })
  })

  it('tentativa em andamento recente: in_progress; antiga (interrompida): retoma a MESMA', () => {
    expect(
      planCharge({ ...base, method: 'pix', attempts: [attempt(1, 'creating')], transactions: [] }),
    ).toEqual({ kind: 'in_progress' })
    expect(
      planCharge({
        ...base,
        method: 'pix',
        attempts: [attempt(1, 'creating', 'pix', NOW - STALE)],
        transactions: [],
      }),
    ).toEqual({ kind: 'create', attempt: 1, resume: true })
  })

  it('tentativa que terminou em erro: retoma a mesma (mesma chave) se for a mesma forma', () => {
    expect(
      planCharge({
        ...base,
        method: 'card',
        attempts: [attempt(1, 'error', 'card')],
        transactions: [],
      }),
    ).toEqual({ kind: 'create', attempt: 1, resume: true })
  })

  it('erro em outra forma de pagamento: abre nova tentativa', () => {
    expect(
      planCharge({
        ...base,
        method: 'pix',
        attempts: [attempt(1, 'error', 'card')],
        transactions: [],
      }),
    ).toEqual({ kind: 'create', attempt: 2, resume: false })
  })

  it('cobrança recusada/cancelada/expirada não bloqueia: nova tentativa, até o limite', () => {
    for (const status of ['failed', 'canceled', 'expired'] as const) {
      expect(
        planCharge({
          ...base,
          method: 'card',
          attempts: [attempt(1, 'created', 'card')],
          transactions: [tx(status, 'card')],
        }),
      ).toEqual({ kind: 'create', attempt: 2, resume: false })
    }
    expect(
      planCharge({
        ...base,
        method: 'card',
        attempts: [
          attempt(1, 'created', 'card'),
          attempt(2, 'created', 'card'),
          attempt(3, 'created', 'card'),
        ],
        transactions: [tx('failed', 'card'), tx('failed', 'card'), tx('failed', 'card')],
      }),
    ).toEqual({ kind: 'too_many_attempts' })
  })
})

describe('chargeIdempotencyKey', () => {
  it('é estável para a mesma operação, forma e tentativa, e distinta nas demais', () => {
    const key = chargeIdempotencyKey('op1', 'pix', 1)
    expect(chargeIdempotencyKey('op1', 'pix', 1)).toBe(key)
    expect(chargeIdempotencyKey('op1', 'card', 1)).not.toBe(key)
    expect(chargeIdempotencyKey('op1', 'pix', 2)).not.toBe(key)
    expect(chargeIdempotencyKey('op2', 'pix', 1)).not.toBe(key)
  })
})

describe('describeChargeForMember', () => {
  const awaiting = { code: 'awaiting_payment', message: 'x' } as const
  it('pendente nunca é apresentada como recebida', () => {
    expect(describeChargeForMember({ method: 'pix', status: 'pending', operation: awaiting })).toBe(
      PIX_PENDING_MESSAGE,
    )
    expect(
      describeChargeForMember({ method: 'card', status: 'pending', operation: awaiting }),
    ).toBe(CARD_PENDING_MESSAGE)
  })

  it('aprovada usa a mensagem da OPERAÇÃO (confirmada ou em análise por atraso)', () => {
    expect(
      describeChargeForMember({
        method: 'card',
        status: 'succeeded',
        operation: { code: 'confirmed', message: CONFIRMED_MESSAGE },
      }),
    ).toBe(CONFIRMED_MESSAGE)
    expect(
      describeChargeForMember({
        method: 'card',
        status: 'succeeded',
        operation: { code: 'under_review_late_payment', message: LATE_PAYMENT_MESSAGE },
      }),
    ).toBe(LATE_PAYMENT_MESSAGE)
  })

  it('recusa, cancelamento e expiração deixam explícito que NÃO houve recebimento', () => {
    expect(describeChargeForMember({ method: 'card', status: 'failed', operation: awaiting })).toBe(
      CHARGE_FAILED_MESSAGE,
    )
    expect(CHARGE_FAILED_MESSAGE).toMatch(/nenhum recebimento/i)
    expect(
      describeChargeForMember({ method: 'pix', status: 'canceled', operation: awaiting }),
    ).toBe(CHARGE_CANCELED_MESSAGE)
    expect(CHARGE_CANCELED_MESSAGE).toMatch(/nenhum recebimento/i)
    expect(describeChargeForMember({ method: 'pix', status: 'expired', operation: awaiting })).toBe(
      EXPIRED_MESSAGE,
    )
  })
})
