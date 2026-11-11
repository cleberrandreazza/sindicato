// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import {
  NOW,
  createBackend,
  createOperation,
  expireOperation,
  ingestEvent,
  loadOperation,
  loadReceipts,
  seedFamily,
  seedTransaction,
  stubPublicApiEnv,
  type Backend,
  type Fixture,
} from './helpers'

let t: Backend
let family: Fixture

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  stubPublicApiEnv()
  t = createBackend()
  family = await seedFamily(t)
  // E-mail do titular para o mock de notificação.
  await t.run(async (ctx) => {
    await ctx.db.patch(family.memberId, { email: 'ana.teste@example.com', phone: '+5511999990001' })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function confirmOnTime(providerTransactionId = 'tx-ok') {
  const created = await createOperation(t, family)
  await seedTransaction(t, created.operationId, {
    providerTransactionId,
    amountCents: created.totalAmountCents,
  })
  await ingestEvent(t, {
    eventId: `evt-${providerTransactionId}`,
    providerTransactionId,
    occurredAt: NOW + 1_000,
    amountCents: created.totalAmountCents,
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return created
}

describe('comprovante PDF + notificações', () => {
  it('pagamento confirmado emite comprovante único e gera PDF no storage', async () => {
    const created = await confirmOnTime()
    const receipts = await loadReceipts(t, created.operationId)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.receiptNumber).toMatch(/^SC-2026-\d{6}$/)
    expect(receipts[0]?.fileStorageId).toBeDefined()

    // Segunda confirmação do mesmo evento não duplica.
    await ingestEvent(t, {
      eventId: 'evt-tx-ok',
      providerTransactionId: 'tx-ok',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })

  it('pagamento pendente/recusado/expirado não gera comprovante', async () => {
    const created = await createOperation(t, family)
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-fail',
      amountCents: created.totalAmountCents,
    })
    await ingestEvent(t, {
      eventId: 'evt-fail',
      providerTransactionId: 'tx-fail',
      status: 'failed',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)

    // Operação ainda unpaid: sem comprovante.
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
    })
  })

  it('pagamento tardio: sem comprovante definitivo; WhatsApp not_configured; financeiro intacto', async () => {
    const created = await createOperation(t, family)
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-late',
      amountCents: created.totalAmountCents,
    })
    vi.setSystemTime(created.expiresAt + 60_000)
    await expireOperation(t, created.operationId)
    await ingestEvent(t, {
      eventId: 'evt-late',
      providerTransactionId: 'tx-late',
      occurredAt: created.expiresAt + 30_000,
      amountCents: created.totalAmountCents,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    const op = await loadOperation(t, created.operationId)
    expect(op).toMatchObject({ financialStatus: 'paid_late', operationalStatus: 'under_review' })

    const notifications = await t.run((ctx) => ctx.db.query('notifications').collect())
    expect(notifications.some((n) => n.kind === 'receipt')).toBe(false)
    const wa = notifications.find((n) => n.channel === 'whatsapp')
    expect(wa?.status).toBe('not_configured')
    expect(wa?.kind).toBe('payment_under_review')
  })

  it('após confirmação: e-mail enviado (mock) e WhatsApp not_configured; falha de e-mail não desfaz paid', async () => {
    const created = await confirmOnTime('tx-mail')
    const notifications = await t.run((ctx) => ctx.db.query('notifications').collect())
    const email = notifications.find((n) => n.channel === 'email' && n.kind === 'receipt')
    const wa = notifications.find((n) => n.channel === 'whatsapp' && n.kind === 'receipt')
    expect(email?.status).toBe('sent')
    expect(email?.recipientMasked).toMatch(/\*\*\*/)
    expect(wa?.status).toBe('not_configured')

    const op = await loadOperation(t, created.operationId)
    expect(op).toMatchObject({ financialStatus: 'paid', operationalStatus: 'confirmed' })
  })

  it('download autorizado só com accessToken; outro token é bloqueado', async () => {
    const created = await confirmOnTime('tx-dl')
    const ok = await t.action(api.public.payments.getReceiptDownloadUrl, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    expect(ok.receiptNumber).toMatch(/^SC-2026-/)
    expect(ok.url).toMatch(/^https?:\/\//)

    await expect(
      t.action(api.public.payments.getReceiptDownloadUrl, {
        operationId: created.operationId,
        accessToken: 'b'.repeat(64),
      }),
    ).rejects.toThrow()
  })

  it('reprocessamento não reenvia e-mail; retry controlado só após falha', async () => {
    const created = await confirmOnTime('tx-idem')
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const before = await t.run((ctx) => ctx.db.query('notifications').collect())
    const emailSent = before.filter((n) => n.channel === 'email' && n.status === 'sent')
    expect(emailSent).toHaveLength(1)

    await expect(
      t.action(api.public.payments.requestReceiptEmail, {
        operationId: created.operationId,
        accessToken: created.accessToken,
      }),
    ).rejects.toThrow()

    // Simula falha anterior e pede nova tentativa.
    await t.run(async (ctx) => {
      await ctx.db.patch(emailSent[0]!._id, { status: 'failed', failureReason: 'falha simulada' })
    })
    const retry = await t.action(api.public.payments.requestReceiptEmail, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    expect(retry.status).toBe('queued')
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const after = await t.run((ctx) => ctx.db.query('notifications').collect())
    expect(
      after.filter((n) => n.channel === 'email' && n.status === 'sent').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('getOperation expõe receipt.fileReady e notificações sem PII', async () => {
    const created = await confirmOnTime('tx-view')
    const view = await t.query(api.public.payments.getOperation, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    expect(view.receipt?.fileReady).toBe(true)
    expect(view.notifications.some((n) => n.channel === 'email' && n.status === 'sent')).toBe(true)
    expect(
      view.notifications.some((n) => n.channel === 'whatsapp' && n.status === 'not_configured'),
    ).toBe(true)
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('ana.teste@example.com')
    expect(serialized).not.toContain('+5511999990001')
  })

  it('ensureReceiptPdf é idempotente (mesmo storage)', async () => {
    const created = await confirmOnTime('tx-pdf')
    const [receipt] = await loadReceipts(t, created.operationId)
    const first = receipt!.fileStorageId
    await t.mutation(internal.notifications.outbox.afterConfirmed, {
      operationId: receipt!.operationId,
      receiptId: receipt!._id,
    })
    const again = (await loadReceipts(t, created.operationId))[0]
    expect(again?.fileStorageId).toBe(first)
  })
})
