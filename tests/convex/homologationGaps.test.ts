// @vitest-environment edge-runtime
/**
 * Lacunas da auditoria PROMPT 13: cenários 34–35, 45, 47 (proteção), 50 e isolamento
 * financeiro quando a notificação falha no primeiro envio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import {
  NOW,
  createBackend,
  createOperation,
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
  await t.run(async (ctx) => {
    await ctx.db.patch(family.memberId, { email: 'ana.teste@example.com', phone: '+5511999990001' })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function openCharge(txId: string) {
  const created = await createOperation(t, family)
  await seedTransaction(t, created.operationId, {
    providerTransactionId: txId,
    amountCents: created.totalAmountCents,
  })
  return created
}

describe('homologação — cobrança cancelada / expirada (34–35)', () => {
  it('evento canceled atualiza a cobrança e não confirma financeiro/operacional', async () => {
    const created = await openCharge('tx-cancel')
    const result = await ingestEvent(t, {
      eventId: 'evt-cancel',
      providerTransactionId: 'tx-cancel',
      status: 'canceled',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    expect(result.result).toMatchObject({ outcome: 'transaction_updated' })
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('evento expired da cobrança não trata como pagamento aprovado', async () => {
    const created = await openCharge('tx-charge-exp')
    await ingestEvent(t, {
      eventId: 'evt-charge-exp',
      providerTransactionId: 'tx-charge-exp',
      status: 'expired',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })
})

describe('homologação — download repetido e falha de PDF (45, 47)', () => {
  it('download repetido devolve o mesmo número e não gera segundo comprovante', async () => {
    const created = await openCharge('tx-dl2')
    await ingestEvent(t, {
      eventId: 'evt-dl2',
      providerTransactionId: 'tx-dl2',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const first = await t.action(api.public.payments.getReceiptDownloadUrl, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    const second = await t.action(api.public.payments.getReceiptDownloadUrl, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    expect(first.receiptNumber).toBe(second.receiptNumber)
    expect(first.url).toBeTruthy()
    expect(second.url).toBeTruthy()
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })

  it('operação não confirmada não gera PDF definitivo (proteção da geração)', async () => {
    const created = await openCharge('tx-nopdf')
    // Cobrança ainda pending: sem confirmação.
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    await expect(
      t.action(api.public.payments.getReceiptDownloadUrl, {
        operationId: created.operationId,
        accessToken: created.accessToken,
      }),
    ).rejects.toThrow()
  })
})

describe('homologação — e-mail falha no primeiro envio sem alterar financeiro (50, 53)', () => {
  it('associado sem e-mail: notificação falha e operação permanece paid/confirmed', async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch(family.memberId, { email: undefined })
    })
    const created = await openCharge('tx-noemail')
    await ingestEvent(t, {
      eventId: 'evt-noemail',
      providerTransactionId: 'tx-noemail',
      occurredAt: NOW + 1_000,
      amountCents: created.totalAmountCents,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)

    const notifications = await t.run((ctx) => ctx.db.query('notifications').collect())
    const email = notifications.find((n) => n.channel === 'email' && n.kind === 'receipt')
    expect(email?.status).toBe('failed')
    expect(email?.failureReason).toMatch(/Destinatario|e-mail/i)
    expect(notifications.find((n) => n.channel === 'whatsapp')?.status).toBe('not_configured')
  })
})
