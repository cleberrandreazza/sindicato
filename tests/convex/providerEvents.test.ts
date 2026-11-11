// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../convex/_generated/api'
import {
  NOW,
  createBackend,
  createOperation,
  expectConvexError,
  expireOperation,
  ingestEvent,
  loadEvents,
  loadOperation,
  loadPeople,
  loadProviderEvents,
  loadReceipts,
  loadReviews,
  seedFamily,
  seedTransaction,
  type Backend,
  type Fixture,
} from './helpers'

let t: Backend
let family: Fixture

const TX = 'tx-known'

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  t = createBackend()
  family = await seedFamily(t)
})

afterEach(() => {
  vi.useRealTimers()
})

async function startOperation() {
  const created = await createOperation(t, family)
  await seedTransaction(t, created.operationId, {
    providerTransactionId: TX,
    amountCents: created.totalAmountCents,
  })
  return created
}

const loadNotifications = () => t.run((ctx) => ctx.db.query('notifications').collect())
const loadTransactions = () => t.run((ctx) => ctx.db.query('paymentTransactions').collect())

describe('registro de eventos recebidos do provedor', () => {
  it('registra a chegada com origem, id do evento e resultado', async () => {
    const { operationId, totalAmountCents } = await startOperation()
    const ingested = await ingestEvent(t, {
      eventId: 'evt-A',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: totalAmountCents,
    })

    expect(ingested).toMatchObject({ duplicate: false, outcome: 'confirmed', alertOpened: false })
    const [event, ...others] = await loadProviderEvents(t)
    expect(others).toHaveLength(0)
    expect(event).toMatchObject({
      provider: 'mock',
      eventId: 'evt-A',
      providerTransactionId: TX,
      status: 'succeeded',
      amountCents: totalAmountCents,
      occurredAt: NOW + 1000,
      occurrences: 1,
      outcome: 'confirmed',
      operationId,
    })
    expect(event?.alertStatus).toBeUndefined()
  })

  it('registra também eventos que não mudam nada (falha do provedor)', async () => {
    await startOperation()
    await ingestEvent(t, {
      eventId: 'evt-F',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
      status: 'failed',
    })
    const [event] = await loadProviderEvents(t)
    expect(event).toMatchObject({ eventId: 'evt-F', outcome: 'transaction_updated' })
  })

  it('o mesmo evento reenviado é detectado e não é reaplicado', async () => {
    const { operationId, totalAmountCents } = await startOperation()
    const payload = {
      eventId: 'evt-A',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: totalAmountCents,
    }

    const first = await ingestEvent(t, payload)
    const second = await ingestEvent(t, payload)
    const third = await ingestEvent(t, payload)

    expect(first.duplicate).toBe(false)
    expect(second).toEqual({
      duplicate: true,
      outcome: 'confirmed',
      result: null,
      alertOpened: false,
    })
    expect(third.duplicate).toBe(true)

    const events = await loadProviderEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0]?.occurrences).toBe(3)
    expect(await loadReceipts(t, operationId)).toHaveLength(1)
    expect((await loadEvents(t, operationId)).map((event) => event.type)).toEqual([
      'created',
      'payment_confirmed',
    ])
    expect(await loadNotifications()).toHaveLength(0)
  })

  it('chegadas simultâneas do mesmo evento geram um único registro e uma única confirmação', async () => {
    const { operationId, totalAmountCents } = await startOperation()
    const payload = {
      eventId: 'evt-A',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: totalAmountCents,
    }
    const results = await Promise.all(Array.from({ length: 5 }, () => ingestEvent(t, payload)))

    expect(results.filter((item) => item.duplicate)).toHaveLength(4)
    expect(results.filter((item) => item.result?.outcome === 'confirmed')).toHaveLength(1)
    expect(await loadProviderEvents(t)).toHaveLength(1)
    expect(await loadReceipts(t, operationId)).toHaveLength(1)
  })

  it('a identidade do evento é origem + id: o mesmo id em outra origem é outro evento', async () => {
    await startOperation()
    await ingestEvent(t, {
      eventId: 'evt-X',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: 6000,
    })
    const other = await t.mutation(internal.payments.providerEvents.ingest, {
      provider: 'stripe',
      eventId: 'evt-X',
      providerTransactionId: TX,
      status: 'succeeded',
      amountCents: 6000,
      occurredAt: NOW + 1000,
    })

    expect(other.duplicate).toBe(false)
    expect(await loadProviderEvents(t)).toHaveLength(2)
  })

  it('eventos diferentes da mesma cobrança são registrados separadamente', async () => {
    await startOperation()
    const base = { providerTransactionId: TX, occurredAt: NOW + 1000, amountCents: 6000 }
    expect((await ingestEvent(t, { ...base, eventId: 'evt-1' })).outcome).toBe('confirmed')
    expect((await ingestEvent(t, { ...base, eventId: 'evt-2' })).outcome).toBe('ignored')
    expect(await loadProviderEvents(t)).toHaveLength(2)
  })

  it('recusa evento malformado sem registrar nada', async () => {
    await startOperation()
    const base = { providerTransactionId: TX, occurredAt: NOW, amountCents: 6000 }
    await expectConvexError(ingestEvent(t, { ...base, eventId: '  ' }), 'invalid_provider_event')
    await expectConvexError(
      ingestEvent(t, { ...base, eventId: 'e', providerTransactionId: '' }),
      'invalid_provider_event',
    )
    await expectConvexError(
      ingestEvent(t, { ...base, eventId: 'e', amountCents: -1 }),
      'invalid_provider_event',
    )
    await expectConvexError(
      ingestEvent(t, { ...base, eventId: 'e', amountCents: 10.5 }),
      'invalid_provider_event',
    )
    expect(await loadProviderEvents(t)).toHaveLength(0)
  })
})

describe('transação desconhecida: alerta, nunca confirmação', () => {
  it('registra o evento e abre alerta administrativo', async () => {
    const result = await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 3000,
    })

    expect(result).toEqual({
      duplicate: false,
      outcome: 'unknown_transaction',
      result: { outcome: 'unknown_transaction' },
      alertOpened: true,
    })
    const [event] = await loadProviderEvents(t)
    expect(event).toMatchObject({
      eventId: 'evt-U',
      outcome: 'unknown_transaction',
      alertReason: 'unknown_transaction',
      alertStatus: 'open',
    })
    const alerts = await t.query(internal.payments.providerEvents.listOpenAlerts, {})
    expect(alerts.map((alert) => alert.eventId)).toEqual(['evt-U'])
  })

  it('não cria transação, operação, comprovante, análise nem notificação', async () => {
    await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 3000,
    })

    const counts = await t.run(async (ctx) => ({
      transactions: (await ctx.db.query('paymentTransactions').collect()).length,
      operations: (await ctx.db.query('paymentOperations').collect()).length,
      receipts: (await ctx.db.query('receipts').collect()).length,
      reviews: (await ctx.db.query('paymentReviews').collect()).length,
      notifications: (await ctx.db.query('notifications').collect()).length,
    }))
    expect(counts).toEqual({
      transactions: 0,
      operations: 0,
      receipts: 0,
      reviews: 0,
      notifications: 0,
    })
  })

  it('não confirma uma operação existente só porque o valor "bate": é preciso transação validada', async () => {
    const { operationId, totalAmountCents } = await startOperation()
    const result = await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'outra-cobranca',
      occurredAt: NOW + 1000,
      amountCents: totalAmountCents,
    })

    expect(result.outcome).toBe('unknown_transaction')
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(await loadReceipts(t, operationId)).toHaveLength(0)
    expect((await loadTransactions())[0]?.status).toBe('pending')
  })

  it('a origem faz parte da validação: mesmo id de cobrança em outra origem é desconhecido', async () => {
    const { operationId } = await startOperation()
    const result = await t.mutation(internal.payments.providerEvents.ingest, {
      provider: 'stripe',
      eventId: 'evt-S',
      providerTransactionId: TX,
      status: 'succeeded',
      amountCents: 6000,
      occurredAt: NOW + 1000,
    })
    expect(result.outcome).toBe('unknown_transaction')
    expect((await loadOperation(t, operationId))?.operationalStatus).toBe('awaiting_payment')
  })

  it('nunca libera nem altera reservas automaticamente, mesmo com a operação expirada', async () => {
    const { operationId } = await startOperation()
    vi.setSystemTime(NOW + 15 * 60 * 1000 + 1)
    await expireOperation(t, operationId)
    const before = await loadPeople(t, operationId)

    await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW + 60_000,
      amountCents: 6000,
    })

    expect(await loadPeople(t, operationId)).toEqual(before)
    expect(before.every((person) => person.claim === 'released')).toBe(true)
    expect(await loadReviews(t, operationId)).toHaveLength(0)
  })

  it('mantém ativas as reservas de uma operação pendente (não libera a data)', async () => {
    const { operationId } = await startOperation()
    await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW + 60_000,
      amountCents: 6000,
    })
    expect((await loadPeople(t, operationId)).every((person) => person.claim === 'active')).toBe(
      true,
    )
  })

  it('reenvio do mesmo evento desconhecido não duplica registro nem alerta', async () => {
    const payload = {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 3000,
    }
    await ingestEvent(t, payload)
    const again = await ingestEvent(t, payload)

    expect(again).toMatchObject({
      duplicate: true,
      outcome: 'unknown_transaction',
      alertOpened: false,
    })
    const events = await loadProviderEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0]?.occurrences).toBe(2)
    expect(await t.query(internal.payments.providerEvents.listOpenAlerts, {})).toHaveLength(1)
  })

  it('qualquer status de cobrança desconhecida gera alerta (inclusive falha)', async () => {
    const result = await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 3000,
      status: 'failed',
    })
    expect(result.alertOpened).toBe(true)
  })

  it('evento que chega antes da transação local é reprocessado no reenvio e o alerta é encerrado', async () => {
    const created = await createOperation(t, family)
    const payload = {
      eventId: 'evt-E',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: created.totalAmountCents,
    }
    // O webhook chega antes de a transação ser gravada.
    expect((await ingestEvent(t, payload)).outcome).toBe('unknown_transaction')
    expect(await t.query(internal.payments.providerEvents.listOpenAlerts, {})).toHaveLength(1)

    await seedTransaction(t, created.operationId, {
      providerTransactionId: TX,
      amountCents: created.totalAmountCents,
    })
    const retry = await ingestEvent(t, payload)

    expect(retry).toMatchObject({ duplicate: true, outcome: 'confirmed' })
    expect(retry.result?.outcome).toBe('confirmed')
    const [event] = await loadProviderEvents(t)
    expect(event).toMatchObject({
      outcome: 'confirmed',
      occurrences: 2,
      alertStatus: 'resolved',
      resolvedBy: 'system',
      operationId: created.operationId,
    })
    expect(await t.query(internal.payments.providerEvents.listOpenAlerts, {})).toHaveLength(0)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })
})

describe('tratamento administrativo do alerta', () => {
  it('encerrar o alerta registra quem decidiu e não altera nenhuma operação', async () => {
    const { operationId } = await startOperation()
    await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 6000,
    })
    const [alert] = await t.query(internal.payments.providerEvents.listOpenAlerts, {})
    if (!alert) throw new Error('alerta esperado')

    await t.mutation(internal.payments.providerEvents.resolveAlert, {
      providerEventId: alert._id,
      resolvedBy: 'admin-teste',
      note: 'Pagamento de outro sistema; tratado fora.',
    })

    const [event] = await loadProviderEvents(t)
    expect(event).toMatchObject({
      alertStatus: 'resolved',
      resolvedBy: 'admin-teste',
      resolutionNote: 'Pagamento de outro sistema; tratado fora.',
    })
    expect(await loadOperation(t, operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect((await loadPeople(t, operationId)).every((person) => person.claim === 'active')).toBe(
      true,
    )
  })

  it('não permite encerrar duas vezes nem um evento sem alerta', async () => {
    const { totalAmountCents } = await startOperation()
    await ingestEvent(t, {
      eventId: 'evt-ok',
      providerTransactionId: TX,
      occurredAt: NOW + 1000,
      amountCents: totalAmountCents,
    })
    await ingestEvent(t, {
      eventId: 'evt-U',
      providerTransactionId: 'nao-existe',
      occurredAt: NOW,
      amountCents: 6000,
    })
    const events = await loadProviderEvents(t)
    const normal = events.find((event) => event.eventId === 'evt-ok')
    const alerted = events.find((event) => event.eventId === 'evt-U')
    if (!normal || !alerted) throw new Error('eventos esperados')

    await expectConvexError(
      t.mutation(internal.payments.providerEvents.resolveAlert, {
        providerEventId: normal._id,
        resolvedBy: 'admin-teste',
      }),
      'alert_not_open',
    )
    await t.mutation(internal.payments.providerEvents.resolveAlert, {
      providerEventId: alerted._id,
      resolvedBy: 'admin-teste',
    })
    await expectConvexError(
      t.mutation(internal.payments.providerEvents.resolveAlert, {
        providerEventId: alerted._id,
        resolvedBy: 'admin-teste',
      }),
      'alert_not_open',
    )
  })
})
