import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import { DEMO_SIMULATION_MAX_PER_OPERATION } from '../../convex/domain/limits'
import {
  createBackend,
  errorData,
  getOperationView,
  grantSession,
  loadReceipts,
  NOW,
  publicCreate,
  seedFamily,
  simulateDemo,
  startPayment,
  stubPublicApiEnv,
  type Backend,
  type CreatedOperation,
  type Fixture,
} from './helpers'

describe('simulação pública de demonstração (simulateDemoPayment)', () => {
  let t: Backend
  let family: Fixture
  let token: string
  let created: CreatedOperation

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    stubPublicApiEnv()
    vi.stubEnv('APP_ENV', 'demonstration')
    t = createBackend()
    family = await seedFamily(t)
    token = await grantSession(t, family.memberId)
    created = await publicCreate(t, family, token)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('getOperation sinaliza demoSimulationAllowed só em demonstration + mock', async () => {
    expect((await getOperationView(t, created)).demoSimulationAllowed).toBe(true)
    vi.stubEnv('APP_ENV', 'development')
    expect((await getOperationView(t, created)).demoSimulationAllowed).toBe(false)
    vi.stubEnv('APP_ENV', 'demonstration')
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
    expect((await getOperationView(t, created)).demoSimulationAllowed).toBe(false)
  })

  it('aprovado atualiza estados, emite comprovante e nega download a outro token', async () => {
    await startPayment(t, created, 'pix')
    const result = await simulateDemo(t, created, 'approved')
    expect(result.outcome).toBe('approved')
    expect(result.operation).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
      demoSimulationAllowed: true,
    })
    expect(result.operation.receiptNumber).toMatch(/^SC-/)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
    const view = await getOperationView(t, created)
    expect(view.receipt?.fileReady).toBe(true)

    const download = await t.action(api.public.payments.getReceiptDownloadUrl, {
      operationId: created.operationId,
      accessToken: created.accessToken,
    })
    expect(download.receiptNumber).toBe(result.operation.receiptNumber)
    expect(typeof download.url).toBe('string')
    expect(download.url.length).toBeGreaterThan(0)

    const otherFamily = await seedFamily(t, { membershipNumber: 'T-OTHER' })
    const otherToken = await grantSession(t, otherFamily.memberId)
    const other = await publicCreate(t, otherFamily, otherToken, { usageDate: '2026-12-12' })
    const denied = await errorData(
      t.action(api.public.payments.getReceiptDownloadUrl, {
        operationId: created.operationId,
        accessToken: other.accessToken,
      }),
    )
    expect(denied.code).toBe('operation_not_found')
  })

  it('recusado não gera comprovante definitivo', async () => {
    await startPayment(t, created, 'pix')
    const result = await simulateDemo(t, created, 'declined')
    expect(result.operation.financialStatus).toBe('unpaid')
    expect(result.operation.operationalStatus).toBe('awaiting_payment')
    expect(result.operation.receipt).toBeNull()
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('recusa token inválido e token de outra operação', async () => {
    await startPayment(t, created, 'pix')
    expect((await errorData(simulateDemo(t, created, 'approved', 'x'.repeat(64)))).code).toBe(
      'operation_not_found',
    )

    const otherFamily = await seedFamily(t, { membershipNumber: 'T-OTHER-2' })
    const otherToken = await grantSession(t, otherFamily.memberId)
    const other = await publicCreate(t, otherFamily, otherToken, { usageDate: '2026-12-13' })
    await startPayment(t, other, 'pix')
    expect((await errorData(simulateDemo(t, created, 'approved', other.accessToken))).code).toBe(
      'operation_not_found',
    )
  })

  it('exige cobrança iniciada antes da simulação', async () => {
    const data = await errorData(simulateDemo(t, created, 'approved'))
    expect(data.code).toBe('demo_payment_required')
  })

  it('não funciona em APP_ENV=production nem com provider ≠ mock', async () => {
    await startPayment(t, created, 'pix')
    vi.stubEnv('APP_ENV', 'production')
    expect((await errorData(simulateDemo(t, created, 'approved'))).code).toBe(
      'demo_simulation_disabled',
    )
    vi.stubEnv('APP_ENV', 'demonstration')
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
    expect((await errorData(simulateDemo(t, created, 'approved'))).code).toBe(
      'demo_simulation_disabled',
    )
  })

  it('não funciona só com APP_ENV=development (público é exclusivo de demonstration)', async () => {
    await startPayment(t, created, 'pix')
    vi.stubEnv('APP_ENV', 'development')
    expect((await errorData(simulateDemo(t, created, 'approved'))).code).toBe(
      'demo_simulation_disabled',
    )
  })

  it('confirmação repetida na operação já confirmada permanece estável', async () => {
    await startPayment(t, created, 'pix')
    const first = await simulateDemo(t, created, 'approved')
    expect(first.operation.financialStatus).toBe('paid')
    const second = await simulateDemo(t, created, 'approved')
    expect(second.operation.financialStatus).toBe('paid')
    expect(second.operation.receiptNumber).toBe(first.operation.receiptNumber)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })

  it('duas confirmações simultâneas não corrompem o estado', async () => {
    await startPayment(t, created, 'pix')
    const results = await Promise.all([
      simulateDemo(t, created, 'approved'),
      simulateDemo(t, created, 'approved'),
    ])
    for (const result of results) {
      expect(result.operation.financialStatus).toBe('paid')
    }
    expect(results[0]?.operation.receiptNumber).toBe(results[1]?.operation.receiptNumber)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })

  it('aprovação após o prazo vira pagamento tardio em análise', async () => {
    await startPayment(t, created, 'pix')
    vi.setSystemTime(created.expiresAt + 60_000)
    const result = await simulateDemo(t, created, 'approved')
    expect(result.operation.financialStatus).toBe('paid_late')
    expect(result.operation.operationalStatus).toBe('under_review')
    expect(result.operation.receipt).toBeNull()
  })

  it('aplica rate limit por operação', async () => {
    await startPayment(t, created, 'pix')
    for (let i = 0; i < DEMO_SIMULATION_MAX_PER_OPERATION; i++) {
      await simulateDemo(t, created, 'declined')
    }
    const limited = await errorData(simulateDemo(t, created, 'declined'))
    expect(limited.code).toBe('too_many_requests')
  })

  it('argumentos extras de status financeiro não são aceitos pelo contrato', async () => {
    await startPayment(t, created, 'pix')
    await expect(
      t.action(api.public.payments.simulateDemoPayment, {
        operationId: created.operationId,
        accessToken: created.accessToken,
        outcome: 'approved',
        financialStatus: 'paid',
      } as never),
    ).rejects.toThrow()
  })
})
