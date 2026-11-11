// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../convex/_generated/api'
import {
  FIFTEEN_MINUTES,
  NOW,
  confirmPayment,
  createBackend,
  createOperation,
  expireOperation,
  loadEvents,
  loadOperation,
  loadPeople,
  loadReceipts,
  loadReviews,
  loadTransaction,
  seedFamily,
  seedTransaction,
  type Backend,
  type Fixture,
} from './helpers'

const TX = 'mock_pix_pending_tx1'
const DEADLINE = NOW + FIFTEEN_MINUTES

let t: Backend
let family: Fixture

/** Operação de 2 pessoas (R$ 60,00) com uma cobrança Pix pendente. */
async function startOperation() {
  const operation = await createOperation(t, family)
  const transactionId = await seedTransaction(t, operation.operationId, {
    providerTransactionId: TX,
    amountCents: operation.totalAmountCents,
  })
  return { ...operation, transactionId }
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  t = createBackend()
  family = await seedFamily(t)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('expiração após 15 minutos', () => {
  it('a operação nasce aguardando pagamento, não paga, com prazo de 15 minutos', async () => {
    const { operationId } = await startOperation()
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
      expiresAt: DEADLINE,
    })
  })

  it('não expira antes de 15 minutos', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE - 1)
    expect(await expireOperation(t, operationId)).toEqual({ expired: false })
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('awaiting_payment')
  })

  it('expira aos 15 minutos, libera as reservas e registra o histórico', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE)
    expect(await expireOperation(t, operationId)).toEqual({ expired: true })

    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'expired',
    })
    expect((await loadPeople(t, operationId)).every((person) => person.claim === 'released')).toBe(
      true,
    )
    expect((await loadEvents(t, operationId)).map((event) => event.type)).toEqual([
      'created',
      'expired',
    ])
  })

  it('a expiração agendada na criação é executada pelo scheduler', async () => {
    const { operationId } = await startOperation()
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('expired')
  })

  it('expirar é idempotente e não toca em operação paga', async () => {
    const { operationId } = await startOperation()
    await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 60_000,
      amountCents: 6000,
    })

    vi.setSystemTime(DEADLINE + 1)
    expect(await expireOperation(t, operationId)).toEqual({ expired: false })
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('confirmed')
  })
})

describe('pagamento confirmado dentro do prazo', () => {
  it('marca como paid/confirmed, emite um comprovante e registra o histórico', async () => {
    const { operationId, transactionId } = await startOperation()
    const occurredAt = NOW + 5 * 60_000
    vi.setSystemTime(occurredAt)

    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt,
      amountCents: 6000,
    })
    expect(result.outcome).toBe('confirmed')

    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
      paidAt: occurredAt,
    })
    expect((await loadTransaction(t, transactionId))?.status).toBe('succeeded')

    const receipts = await loadReceipts(t, operationId)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.receiptNumber).toBe('SC-2026-000001')
    expect(await loadReviews(t, operationId)).toHaveLength(0)
    expect((await loadEvents(t, operationId)).map((event) => event.type)).toEqual([
      'created',
      'payment_confirmed',
    ])
  })

  it('numera comprovantes de forma sequencial', async () => {
    const first = await startOperation()
    await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
    })

    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const second = await createOperation(t, other, { people: [{ linkId: other.holderLinkId }] })
    await seedTransaction(t, second.operationId, {
      providerTransactionId: 'mock_pix_pending_tx2',
      amountCents: 3000,
    })
    await confirmPayment(t, {
      providerTransactionId: 'mock_pix_pending_tx2',
      occurredAt: NOW + 2000,
      amountCents: 3000,
    })

    expect((await loadReceipts(t, first.operationId))[0]?.receiptNumber).toBe('SC-2026-000001')
    expect((await loadReceipts(t, second.operationId))[0]?.receiptNumber).toBe('SC-2026-000002')
  })

  it('pagamento feito no prazo, mas notificado depois da expiração, é confirmado', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE + 30_000)
    await expireOperation(t, operationId)

    // A notificação chegou atrasada, mas o recebimento ocorreu antes do prazo.
    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE - 10_000,
      amountCents: 6000,
    })

    expect(result.outcome).toBe('confirmed')
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
    })
    expect((await loadPeople(t, operationId)).every((person) => person.claim === 'active')).toBe(
      true,
    )
  })

  it('se a pessoa foi reservada por outra operação após a expiração, vai para análise', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE + 30_000)
    await expireOperation(t, operationId)
    await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }) // nova tentativa legítima

    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE - 10_000,
      amountCents: 6000,
    })

    expect(result).toMatchObject({ outcome: 'under_review', reason: 'claim_conflict' })
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'under_review',
    })
  })
})

describe('pagamento confirmado depois do prazo', () => {
  it('registra paid_late, abre análise e NÃO libera a utilização nem emite comprovante', async () => {
    const { operationId, transactionId } = await startOperation()
    vi.setSystemTime(DEADLINE + 120_000)
    await expireOperation(t, operationId)

    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE + 60_000,
      amountCents: 6000,
    })

    expect(result).toMatchObject({ outcome: 'under_review', reason: 'late_payment' })
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
    })
    // O dinheiro recebido não é descartado.
    expect((await loadTransaction(t, transactionId))?.status).toBe('succeeded')
    // Nada é liberado automaticamente.
    expect(await loadReceipts(t, operationId)).toHaveLength(0)

    const reviews = await loadReviews(t, operationId)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ reason: 'late_payment', status: 'open', transactionId })

    const events = await loadEvents(t, operationId)
    expect(events.map((event) => event.type)).toEqual(['created', 'expired', 'review_opened'])
    expect(events[2]).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
    })
  })

  it('mantém as reservas ativas enquanto a análise estiver aberta', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE + 120_000)
    await expireOperation(t, operationId)
    await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE + 60_000,
      amountCents: 6000,
    })
    expect((await loadPeople(t, operationId)).every((person) => person.claim === 'active')).toBe(
      true,
    )
  })

  it('é tardio mesmo se a expiração ainda não tinha sido processada', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE + 5_000)

    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE + 1_000,
      amountCents: 6000,
    })

    expect(result).toMatchObject({ outcome: 'under_review', reason: 'late_payment' })
    // O agendamento de expiração posterior não altera uma operação em análise.
    expect(await expireOperation(t, operationId)).toEqual({ expired: false })
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('under_review')
  })
})

describe('análise administrativa', () => {
  async function lateReview() {
    const operation = await startOperation()
    vi.setSystemTime(DEADLINE + 120_000)
    await expireOperation(t, operation.operationId)
    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: DEADLINE + 60_000,
      amountCents: 6000,
    })
    if (result.outcome !== 'under_review') throw new Error('Esperava análise.')
    return { ...operation, reviewId: result.reviewId }
  }

  it('aprovar libera a utilização e emite o comprovante', async () => {
    const { operationId, reviewId } = await lateReview()
    await t.mutation(internal.payments.reviews.resolve, {
      reviewId,
      decision: 'approved',
      resolvedBy: 'admin-de-teste',
      note: 'Conferido no extrato.',
    })

    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'confirmed',
    })
    expect(await loadReceipts(t, operationId)).toHaveLength(1)
    const [review] = await loadReviews(t, operationId)
    expect(review).toMatchObject({ status: 'approved', resolvedBy: 'admin-de-teste' })
    expect((await loadEvents(t, operationId)).at(-1)).toMatchObject({
      type: 'review_resolved',
      actor: 'admin',
    })
  })

  it('rejeitar não libera a utilização, não gera comprovante e não inicia reembolso', async () => {
    const { operationId, transactionId, reviewId } = await lateReview()
    await t.mutation(internal.payments.reviews.resolve, {
      reviewId,
      decision: 'rejected',
      resolvedBy: 'admin-de-teste',
    })

    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'rejected',
    })
    expect(await loadReceipts(t, operationId)).toHaveLength(0)
    // O registro do recebimento permanece; nenhuma devolução é feita pelo sistema.
    expect((await loadTransaction(t, transactionId))?.status).toBe('succeeded')
  })

  it('uma análise já concluída não pode ser decidida de novo', async () => {
    const { reviewId } = await lateReview()
    await t.mutation(internal.payments.reviews.resolve, {
      reviewId,
      decision: 'rejected',
      resolvedBy: 'admin-de-teste',
    })
    await expect(
      t.mutation(internal.payments.reviews.resolve, {
        reviewId,
        decision: 'approved',
        resolvedBy: 'admin-de-teste',
      }),
    ).rejects.toThrow()
  })
})

describe('valor divergente e recebimento em duplicidade', () => {
  it('valor diferente do esperado vai para análise e não liquida a operação', async () => {
    const { operationId } = await startOperation()
    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 3000,
    })

    expect(result).toMatchObject({ outcome: 'under_review', reason: 'amount_mismatch' })
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'under_review',
    })
    expect(await loadReceipts(t, operationId)).toHaveLength(0)
  })

  it('segundo recebimento em operação já paga abre análise sem alterar a operação', async () => {
    const { operationId } = await startOperation()
    await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
    })
    await seedTransaction(t, operationId, {
      providerTransactionId: 'mock_card_succeeded_x',
      amountCents: 6000,
    })

    const result = await confirmPayment(t, {
      providerTransactionId: 'mock_card_succeeded_x',
      occurredAt: NOW + 2000,
      amountCents: 6000,
    })

    expect(result).toMatchObject({ outcome: 'under_review', reason: 'unexpected_payment' })
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
    })
    expect(await loadReceipts(t, operationId)).toHaveLength(1)
    expect(await loadReviews(t, operationId)).toHaveLength(1)
  })
})

describe('notificações repetidas e confirmação duplicada', () => {
  it('repetir a confirmação no prazo não duplica comprovante, histórico nem análise', async () => {
    const { operationId } = await startOperation()
    const payload = { providerTransactionId: TX, occurredAt: NOW + 1000, amountCents: 6000 }

    expect((await confirmPayment(t, payload)).outcome).toBe('confirmed')
    expect((await confirmPayment(t, payload)).outcome).toBe('ignored')
    expect((await confirmPayment(t, payload)).outcome).toBe('ignored')

    expect(await loadReceipts(t, operationId)).toHaveLength(1)
    expect(await loadReviews(t, operationId)).toHaveLength(0)
    expect((await loadEvents(t, operationId)).map((event) => event.type)).toEqual([
      'created',
      'payment_confirmed',
    ])
  })

  it('repetir a confirmação tardia não abre uma segunda análise', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(DEADLINE + 120_000)
    await expireOperation(t, operationId)
    const payload = { providerTransactionId: TX, occurredAt: DEADLINE + 60_000, amountCents: 6000 }

    expect((await confirmPayment(t, payload)).outcome).toBe('under_review')
    expect((await confirmPayment(t, payload)).outcome).toBe('ignored')

    expect(await loadReviews(t, operationId)).toHaveLength(1)
    expect((await loadEvents(t, operationId)).map((event) => event.type)).toEqual([
      'created',
      'expired',
      'review_opened',
    ])
  })

  it('notificações simultâneas da mesma cobrança são aplicadas uma única vez', async () => {
    const { operationId } = await startOperation()
    const payload = { providerTransactionId: TX, occurredAt: NOW + 1000, amountCents: 6000 }

    const results = await Promise.all(Array.from({ length: 5 }, () => confirmPayment(t, payload)))

    expect(results.filter((result) => result.outcome === 'confirmed')).toHaveLength(1)
    expect(results.filter((result) => result.outcome === 'ignored')).toHaveLength(4)
    expect(await loadReceipts(t, operationId)).toHaveLength(1)
  })

  it('evento de falha chegando depois do sucesso não desfaz o pagamento', async () => {
    const { operationId, transactionId } = await startOperation()
    await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
    })

    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 2000,
      amountCents: 6000,
      status: 'failed',
    })

    expect(result.outcome).toBe('ignored')
    expect((await loadTransaction(t, transactionId))?.status).toBe('succeeded')
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('confirmed')
  })

  it('falha do provedor atualiza só a transação e mantém a operação aberta', async () => {
    const { operationId, transactionId } = await startOperation()
    const result = await confirmPayment(t, {
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
      status: 'failed',
    })

    expect(result.outcome).toBe('transaction_updated')
    expect((await loadTransaction(t, transactionId))?.status).toBe('failed')
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('awaiting_payment')
  })

  it('transação desconhecida não gera erro nem altera dados', async () => {
    const result = await confirmPayment(t, {
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 3000,
    })
    expect(result).toEqual({ outcome: 'unknown_transaction' })
  })
})
