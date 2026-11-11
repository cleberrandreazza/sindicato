// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { chargeIdempotencyKey } from '../../convex/domain/charges'
import {
  CARD_PENDING_MESSAGE,
  CHARGE_FAILED_MESSAGE,
  CONFIRMED_MESSAGE,
  LATE_PAYMENT_MESSAGE,
  PIX_PENDING_MESSAGE,
} from '../../convex/domain/messages'
import {
  MOCK_CARD_TOKEN_APPROVED,
  MOCK_CARD_TOKEN_DECLINED,
  MOCK_CARD_TOKEN_PENDING,
  MOCK_CARD_TOKEN_UNAVAILABLE,
  MOCK_PIX_CODE_PREFIX,
  MOCK_WEBHOOK_SIGNATURE,
  MockPaymentProvider,
} from '../../convex/providers/mock/mockPaymentProvider'
import {
  FIFTEEN_MINUTES,
  NOW,
  createBackend,
  errorData,
  expireOperation,
  getOperationView,
  grantSession,
  loadAttempts,
  loadEvents,
  loadOperation,
  loadPeople,
  loadProviderEvents,
  loadReceipts,
  loadReviews,
  loadTransactions,
  publicCreate,
  seedFamily,
  simulate,
  startPayment,
  stubPublicApiEnv,
  type Backend,
  type CreatedOperation,
  type Fixture,
} from './helpers'

let t: Backend
let family: Fixture
let token: string
let created: CreatedOperation

/** Duas pessoas (titular + Bruno): 2 × R$ 30,00. */
const TOTAL = 6_000

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  stubPublicApiEnv()
  t = createBackend()
  family = await seedFamily(t)
  token = await grantSession(t, family.memberId)
  created = await publicCreate(t, family, token)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const pixSpy = () => vi.spyOn(MockPaymentProvider.prototype, 'createPixCharge')
const cardSpy = () => vi.spyOn(MockPaymentProvider.prototype, 'createCardCharge')

async function newOperation(options: { linkIds?: Fixture['dependentLinkIds'][number][] } = {}) {
  return publicCreate(t, family, token, {
    usageDate: '2026-12-11',
    ...(options.linkIds ? { linkIds: options.linkIds } : {}),
  })
}

describe('public/payments:startPayment — cobrança Pix', () => {
  it('cria a cobrança com valor da operação, código copia-e-cola fictício e QR demonstrativo', async () => {
    const result = await startPayment(t, created, 'pix')

    expect(result.reused).toBe(false)
    expect(result.payment).toMatchObject({
      method: 'pix',
      status: 'pending',
      amountCents: TOTAL,
      message: PIX_PENDING_MESSAGE,
    })
    expect(result.payment.pix).not.toBeNull()
    expect(result.payment.pix?.copyPasteCode.startsWith(MOCK_PIX_CODE_PREFIX)).toBe(true)
    expect(result.payment.pix?.qrCode.kind).toBe('placeholder')
    expect(result.payment.pix?.qrCode.value.startsWith('data:image/svg+xml')).toBe(true)
    expect(result.payment.pix?.expiresAt).toBe(created.expiresAt)
    // Estado: aguardando; nada foi recebido.
    expect(result.operation).toMatchObject({
      operationalStatus: 'awaiting_payment',
      financialStatus: 'unpaid',
    })
  })

  it('o código fictício não pode ser confundido com um Pix real (payload EMV começa com 000201)', async () => {
    const { payment } = await startPayment(t, created, 'pix')
    const code = payment.pix?.copyPasteCode ?? ''
    expect(code).not.toMatch(/^000201/)
    expect(code).toMatch(/NAO-PAGAVEL/)
    // Um payload Pix real contém o identificador BR.GOV.BCB.PIX; o fictício, não.
    expect(code.toUpperCase()).not.toContain('BR.GOV.BCB.PIX')
    // O QR é um desenho estático: não carrega o código nem o id da operação.
    const svg = decodeURIComponent(payment.pix?.qrCode.value ?? '')
    expect(svg).toContain('DEMONSTRAÇÃO')
    expect(svg).not.toContain(code)
  })

  it('grava a transação local pendente, vinculada à operação e ao valor armazenado', async () => {
    const result = await startPayment(t, created, 'pix')
    const transactions = await loadTransactions(t, created.operationId)
    const attempts = await loadAttempts(t, created.operationId)

    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      provider: 'mock',
      method: 'pix',
      status: 'pending',
      amountCents: TOTAL,
      chargeExpiresAt: created.expiresAt,
    })
    expect(transactions[0]?._id).toBe(result.payment.paymentId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({
      state: 'created',
      method: 'pix',
      attempt: 1,
      idempotencyKey: chargeIdempotencyKey(created.operationId, 'pix', 1),
      transactionId: transactions[0]?._id,
    })
    // Criar a cobrança não é receber: a operação continua igual.
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('envia ao provedor o valor e o prazo da OPERAÇÃO, com chave de idempotência', async () => {
    const spy = pixSpy()
    await startPayment(t, created, 'pix')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      operationId: created.operationId,
      amountCents: TOTAL,
      expiresAt: created.expiresAt,
      idempotencyKey: chargeIdempotencyKey(created.operationId, 'pix', 1),
    })
    // A descrição não contém nomes nem dados pessoais.
    const { description } = spy.mock.calls[0]?.[0] ?? { description: '' }
    expect(description).not.toMatch(/Ana|Bruno|Clara/)
  })

  it('não expõe ao navegador id do provedor, chave de idempotência nem hashes', async () => {
    const result = await startPayment(t, created, 'pix')
    const json = JSON.stringify(result)
    for (const key of ['providerTransactionId', 'idempotencyKey', 'accessTokenHash', 'memberId']) {
      expect(json).not.toContain(key)
    }
    expect(json).not.toContain(chargeIdempotencyKey(created.operationId, 'pix', 1))
  })
})

describe('public/payments:startPayment — cobrança por cartão', () => {
  it('cartão aprovado: cobrança aprovada e operação confirmada pela porta única de eventos', async () => {
    const result = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED)

    expect(result.payment).toMatchObject({
      method: 'card',
      status: 'succeeded',
      amountCents: TOTAL,
      message: CONFIRMED_MESSAGE,
      pix: null,
    })
    expect(result.operation).toMatchObject({
      operationalStatus: 'confirmed',
      financialStatus: 'paid',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
    // O resultado imediato foi registrado como evento do provedor (mesma porta do webhook).
    const events = await loadProviderEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ outcome: 'confirmed', amountCents: TOTAL })
  })

  it('cartão recusado: nenhum recebimento; operação segue pendente e a reserva é mantida', async () => {
    const result = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_DECLINED)

    expect(result.payment).toMatchObject({
      status: 'failed',
      message: CHARGE_FAILED_MESSAGE,
      amountCents: TOTAL,
    })
    // Recusa NÃO é recebimento.
    expect(result.operation).toMatchObject({
      operationalStatus: 'awaiting_payment',
      financialStatus: 'unpaid',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    expect(await loadReviews(t, created.operationId)).toHaveLength(0)
    const people = await loadPeople(t, created.operationId)
    expect(people.every((person) => person.claim === 'active')).toBe(true)
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(operation?.paidAt).toBeUndefined()
  })

  it('cartão pendente (ex.: 3-D Secure): cobrança pendente, sem confirmar nada', async () => {
    const result = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING)
    expect(result.payment).toMatchObject({
      status: 'pending',
      message: CARD_PENDING_MESSAGE,
      pix: null,
    })
    expect(result.operation).toMatchObject({
      operationalStatus: 'awaiting_payment',
      financialStatus: 'unpaid',
    })
  })

  it('recusado: permite nova tentativa dentro do prazo (nova cobrança, nova chave)', async () => {
    const first = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_DECLINED)
    const second = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED)

    expect(second.reused).toBe(false)
    expect(second.payment.paymentId).not.toBe(first.payment.paymentId)
    expect(second.operation).toMatchObject({
      operationalStatus: 'confirmed',
      financialStatus: 'paid',
    })
    const attempts = await loadAttempts(t, created.operationId)
    expect(attempts.map((attempt) => attempt.attempt).sort()).toEqual([1, 2])
    expect(new Set(attempts.map((attempt) => attempt.idempotencyKey)).size).toBe(2)
  })

  it('limita as tentativas por operação (3) e informa o motivo', async () => {
    for (let i = 0; i < 3; i += 1) {
      await startPayment(t, created, 'card', MOCK_CARD_TOKEN_DECLINED)
    }
    const spy = cardSpy()
    const data = await errorData(startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED))
    expect(data.code).toBe('payment_attempts_exceeded')
    expect(spy).not.toHaveBeenCalled()
    expect(await loadAttempts(t, created.operationId)).toHaveLength(3)
  })

  it('o token do cartão não é gravado em nenhuma tabela nem devolvido', async () => {
    const result = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING)
    expect(JSON.stringify(result)).not.toContain(MOCK_CARD_TOKEN_PENDING)
    const everything = await t.run(async (ctx) => {
      const tables = [
        'paymentOperations',
        'paymentTransactions',
        'chargeAttempts',
        'providerEvents',
        'operationEvents',
        'rateLimits',
      ] as const
      const rows = await Promise.all(tables.map((table) => ctx.db.query(table).collect()))
      return JSON.stringify(rows)
    })
    expect(everything).not.toContain(MOCK_CARD_TOKEN_PENDING)
    expect(everything).not.toContain('tok_')
  })

  it('token inválido para o provedor: erro específico, sem cobrança, sem vazar o token', async () => {
    const data = await errorData(startPayment(t, created, 'card', 'tok_desconhecido_123'))
    expect(data.code).toBe('invalid_payment_token')
    expect(JSON.stringify(data)).not.toContain('tok_desconhecido_123')
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
  })
})

describe('public/payments:startPayment — validações da operação', () => {
  it('operação inexistente: mesma resposta que credencial incorreta (não revela existência)', async () => {
    const other = await newOperation()
    await t.run((ctx) => ctx.db.delete(other.operationId))
    const missing = await errorData(startPayment(t, other, 'pix'))
    const wrongToken = await errorData(
      startPayment(t, { ...created, accessToken: 'x'.repeat(64) }, 'pix'),
    )
    const emptyToken = await errorData(startPayment(t, { ...created, accessToken: '' }, 'pix'))
    const hugeToken = await errorData(
      startPayment(t, { ...created, accessToken: 'x'.repeat(500) }, 'pix'),
    )

    expect(missing.code).toBe('operation_not_found')
    expect(wrongToken).toEqual(missing)
    expect(emptyToken).toEqual(missing)
    expect(hugeToken).toEqual(missing)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(0)
  })

  it('não permite cobrar operação de terceiros usando a credencial de outra operação', async () => {
    const mine = await newOperation()
    const data = await errorData(
      startPayment(t, { ...created, accessToken: mine.accessToken }, 'pix'),
    )
    expect(data.code).toBe('operation_not_found')
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
  })

  it('operação expirada pelo relógio (antes da expiração agendada): recusa e não chama o provedor', async () => {
    const spy = pixSpy()
    vi.setSystemTime(created.expiresAt)
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('operation_expired')
    expect(spy).not.toHaveBeenCalled()
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(0)
  })

  it('operação expirada e já processada pela expiração agendada: recusa', async () => {
    vi.setSystemTime(created.expiresAt + 1_000)
    await expireOperation(t, created.operationId)
    const data = await errorData(startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED))
    expect(data.code).toBe('operation_expired')
  })

  it('1 ms antes do prazo ainda cobra', async () => {
    vi.setSystemTime(created.expiresAt - 1)
    const result = await startPayment(t, created, 'pix')
    expect(result.payment.status).toBe('pending')
  })

  it('operação já paga: recusa (e não cria segunda cobrança)', async () => {
    await startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED)
    const spy = pixSpy()
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('operation_already_paid')
    expect(spy).not.toHaveBeenCalled()
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
  })

  it('pagamento tardio em análise: recusa nova cobrança e orienta a não pagar de novo', async () => {
    await startPayment(t, created, 'pix')
    await simulate(t, created.operationId, 'approved_after_expiry')
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('operation_under_review')
    expect(data.message).toMatch(/não realize um novo pagamento/i)
  })

  it('operação encerrada pela análise (rejected): recusa', async () => {
    await t.run((ctx) => ctx.db.patch(created.operationId, { operationalStatus: 'rejected' }))
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('operation_closed')
  })

  it('fail closed: operação sem pessoas ou com total inconsistente não é cobrada', async () => {
    const spy = pixSpy()
    // Total divergente de quantidade × unitário.
    await t.run((ctx) => ctx.db.patch(created.operationId, { totalAmountCents: 1 }))
    expect((await errorData(startPayment(t, created, 'pix'))).code).toBe('invalid_operation_amount')

    // Total correto, mas sem pessoas gravadas.
    await t.run((ctx) => ctx.db.patch(created.operationId, { totalAmountCents: TOTAL }))
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('operationPeople')
        .withIndex('by_operation', (q) => q.eq('operationId', created.operationId))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
    })
    expect((await errorData(startPayment(t, created, 'pix'))).code).toBe('invalid_operation_amount')

    expect(spy).not.toHaveBeenCalled()
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(0)
  })

  it('a cobrança compatível com outra forma de pagamento em aberto é recusada', async () => {
    await startPayment(t, created, 'pix')
    const spy = cardSpy()
    const data = await errorData(startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED))
    expect(data.code).toBe('payment_method_conflict')
    expect(spy).not.toHaveBeenCalled()
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
  })
})

describe('public/payments:startPayment — valores enviados pelo navegador', () => {
  it.each([
    ['amountCents', 1],
    ['totalAmountCents', 1],
    ['unitAmountCents', 1],
    ['quantity', 1],
    ['status', 'succeeded'],
    ['financialStatus', 'paid'],
    ['operationalStatus', 'confirmed'],
    ['expiresAt', 9_999_999_999_999],
    ['idempotencyKey', 'forjada'],
    ['provider', 'stripe'],
    ['cardNumber', '4242424242424242'],
    ['cvv', '123'],
  ])('recusa o campo extra "%s" e não cria nada', async (field, value) => {
    const spy = pixSpy()
    const attempt = t.action(api.public.payments.startPayment, {
      operationId: created.operationId,
      accessToken: created.accessToken,
      paymentMethod: 'pix',
      [field]: value,
    } as never)
    const message = await attempt.then(
      () => 'aceito',
      (error: unknown) => String(error),
    )
    expect(message).toMatch(/Unexpected field/i)
    expect(spy).not.toHaveBeenCalled()
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(0)
  })

  it('o valor cobrado é sempre o armazenado: nem alterando a operação depois o navegador influencia', async () => {
    const spy = pixSpy()
    const result = await startPayment(t, created, 'pix')
    expect(spy.mock.calls[0]?.[0].amountCents).toBe(TOTAL)
    expect(result.payment.amountCents).toBe(TOTAL)
    const view = await getOperationView(t, created)
    expect(view.payment?.amountCents).toBe(view.totalAmountCents)
  })

  it('forma de pagamento desconhecida é recusada pelo validador', async () => {
    const message = await t
      .action(api.public.payments.startPayment, {
        operationId: created.operationId,
        accessToken: created.accessToken,
        paymentMethod: 'boleto',
      } as never)
      .then(
        () => 'aceito',
        (error: unknown) => String(error),
      )
    expect(message).toMatch(/Validator error|paymentMethod/i)
  })

  it('Pix não aceita token; cartão exige token com tamanho válido', async () => {
    expect((await errorData(startPayment(t, created, 'pix', MOCK_CARD_TOKEN_APPROVED))).code).toBe(
      'invalid_payment_method',
    )
    expect((await errorData(startPayment(t, created, 'card'))).code).toBe('invalid_payment_method')
    expect((await errorData(startPayment(t, created, 'card', ''))).code).toBe(
      'invalid_payment_method',
    )
    expect((await errorData(startPayment(t, created, 'card', 'x'.repeat(500)))).code).toBe(
      'invalid_payment_method',
    )
    expect(await loadAttempts(t, created.operationId)).toHaveLength(0)
  })
})

describe('public/payments:startPayment — idempotência', () => {
  it('chamadas repetidas devolvem a mesma cobrança, sem nova chamada ao provedor', async () => {
    const spy = pixSpy()
    const first = await startPayment(t, created, 'pix')
    const second = await startPayment(t, created, 'pix')
    const third = await startPayment(t, created, 'pix')

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(third.reused).toBe(true)
    expect(second.payment).toEqual(first.payment)
    expect(third.payment).toEqual(first.payment)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(1)
  })

  it('cartão pendente repetido também reaproveita a cobrança (o token enviado de novo é ignorado)', async () => {
    const spy = cardSpy()
    const first = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING)
    const second = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED)
    expect(second.reused).toBe(true)
    expect(second.payment.paymentId).toBe(first.payment.paymentId)
    expect(second.payment.status).toBe('pending')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('chamadas SIMULTÂNEAS: uma única cobrança é criada no provedor e gravada', async () => {
    const spy = pixSpy()
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => startPayment(t, created, 'pix')),
    )

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof startPayment>>> =>
        r.status === 'fulfilled',
    )
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)
    // As demais só podem ter sido recusadas por "em andamento" (basta repetir).
    for (const failure of rejected) {
      expect((failure.reason as { data?: { code?: string } }).data?.code).toBe(
        'payment_in_progress',
      )
    }
    // Todas as bem-sucedidas descrevem a MESMA cobrança.
    expect(new Set(fulfilled.map((r) => r.value.payment.paymentId)).size).toBe(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(1)

    // Repetir depois que a criação terminou devolve a mesma cobrança.
    const again = await startPayment(t, created, 'pix')
    expect(again.payment.paymentId).toBe(fulfilled[0]?.value.payment.paymentId)
  })

  /**
   * O `convex-test` não simula concorrência real: sem controle, as chamadas acabam serializadas e
   * o teste acima passaria mesmo sem nenhuma exclusão. Aqui a PRIMEIRA chamada fica suspensa
   * dentro do provedor (a janela exata da corrida) enquanto as outras chegam.
   */
  function holdFirstProviderCall() {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = MockPaymentProvider.prototype.createPixCharge
    let calls = 0
    const spy = vi
      .spyOn(MockPaymentProvider.prototype, 'createPixCharge')
      .mockImplementation(async function (this: MockPaymentProvider, input) {
        calls += 1
        if (calls === 1) await gate
        return original.call(this, input)
      })
    return { spy, release }
  }

  it('com a 1ª chamada suspensa no provedor, as demais NÃO criam outra cobrança', async () => {
    const { spy, release } = holdFirstProviderCall()
    const first = startPayment(t, created, 'pix')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    const others = await Promise.allSettled(
      Array.from({ length: 5 }, () => startPayment(t, created, 'pix')),
    )
    for (const outcome of others) {
      expect(outcome.status).toBe('rejected')
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({
        data: { code: 'payment_in_progress' },
      })
    }
    expect(spy).toHaveBeenCalledTimes(1)

    release()
    const result = await first
    expect(result.payment.status).toBe('pending')
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(1)

    // Concluída a criação, repetir devolve a mesma cobrança.
    const again = await startPayment(t, created, 'pix')
    expect(again).toMatchObject({ reused: true })
    expect(again.payment.paymentId).toBe(result.payment.paymentId)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('com a 1ª chamada suspensa, outra forma de pagamento também é recusada (uma cobrança por vez)', async () => {
    const { spy, release } = holdFirstProviderCall()
    const card = cardSpy()
    const first = startPayment(t, created, 'pix')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    const data = await errorData(startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED))
    expect(data.code).toBe('payment_in_progress')
    expect(card).not.toHaveBeenCalled()

    release()
    await first
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
  })

  it('retomada de tentativa interrompida enquanto a original ainda termina: uma só cobrança, mesma chave', async () => {
    const { spy, release } = holdFirstProviderCall()
    const original = startPayment(t, created, 'pix')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    // A tentativa fica "velha" (considerada interrompida): a retomada reaproveita a MESMA chave.
    vi.setSystemTime(NOW + 120_000)
    const resumed = await startPayment(t, created, 'pix')
    expect(resumed.reused).toBe(false)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1]?.[0].idempotencyKey).toBe(spy.mock.calls[0]?.[0].idempotencyKey)

    // A original termina depois: devolve a cobrança já registrada, sem duplicar.
    release()
    const late = await original
    expect(late.reused).toBe(true)
    expect(late.payment.paymentId).toBe(resumed.payment.paymentId)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(1)
  })

  it('chamadas simultâneas com formas de pagamento diferentes: só uma cobrança existe', async () => {
    const pix = pixSpy()
    const card = cardSpy()
    await Promise.allSettled([
      startPayment(t, created, 'pix'),
      startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING),
      startPayment(t, created, 'pix'),
      startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING),
    ])
    expect(pix.mock.calls.length + card.mock.calls.length).toBe(1)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(1)
    expect(await loadAttempts(t, created.operationId)).toHaveLength(1)
  })

  it('tentativa recém-iniciada por outra chamada: responde "em andamento" sem chamar o provedor', async () => {
    await t.run((ctx) =>
      ctx.db.insert('chargeAttempts', {
        operationId: created.operationId,
        method: 'pix',
        attempt: 1,
        idempotencyKey: chargeIdempotencyKey(created.operationId, 'pix', 1),
        state: 'creating',
        startedAt: Date.now(),
      }),
    )
    const spy = pixSpy()
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('payment_in_progress')
    expect(spy).not.toHaveBeenCalled()
  })

  it('tentativa interrompida (action que caiu): retoma com a MESMA chave de idempotência', async () => {
    const key = chargeIdempotencyKey(created.operationId, 'pix', 1)
    await t.run((ctx) =>
      ctx.db.insert('chargeAttempts', {
        operationId: created.operationId,
        method: 'pix',
        attempt: 1,
        idempotencyKey: key,
        state: 'creating',
        startedAt: Date.now() - 120_000,
      }),
    )
    const spy = pixSpy()
    const result = await startPayment(t, created, 'pix')
    expect(result.payment.status).toBe('pending')
    expect(spy.mock.calls[0]?.[0].idempotencyKey).toBe(key)
    const attempts = await loadAttempts(t, created.operationId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.state).toBe('created')
  })

  it('falha do provedor: erro genérico, tentativa em erro; a retomada reaproveita a chave', async () => {
    const data = await errorData(startPayment(t, created, 'card', MOCK_CARD_TOKEN_UNAVAILABLE))
    expect(data.code).toBe('service_unavailable')
    expect(JSON.stringify(data)).not.toMatch(/mock|provider/i)
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
    const [failed] = await loadAttempts(t, created.operationId)
    expect(failed).toMatchObject({ state: 'error', errorCode: 'unavailable', attempt: 1 })

    const spy = cardSpy()
    const retry = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING)
    expect(retry.payment.status).toBe('pending')
    expect(spy.mock.calls[0]?.[0].idempotencyKey).toBe(failed?.idempotencyKey)
    const attempts = await loadAttempts(t, created.operationId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.state).toBe('created')
  })

  it('valor devolvido pelo provedor diferente do pedido: não registra a cobrança', async () => {
    vi.spyOn(MockPaymentProvider.prototype, 'createPixCharge').mockImplementationOnce(
      async (input) => ({
        providerTransactionId: 'mock_pix_pending_divergente',
        status: 'pending',
        amountCents: input.amountCents + 1,
        pixCopyPasteCode: 'x',
        qrCode: { kind: 'placeholder', value: 'x' },
        expiresAt: input.expiresAt,
      }),
    )
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('service_unavailable')
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
  })

  it('segurança por padrão: sem APP_ENV=development o mock é recusado e nada é cobrado', async () => {
    vi.stubEnv('APP_ENV', 'production')
    const data = await errorData(startPayment(t, created, 'pix'))
    expect(data.code).toBe('service_unavailable')
    expect(await loadTransactions(t, created.operationId)).toHaveLength(0)
  })
})

describe('simulação de desenvolvimento e confirmação', () => {
  it('pagamento APROVADO no prazo: paid + confirmed, comprovante emitido, evento registrado', async () => {
    const { payment } = await startPayment(t, created, 'pix')
    vi.setSystemTime(NOW + 60_000)
    const run = await simulate(t, created.operationId, 'approved')

    expect(run.notification).toMatchObject({
      status: 'accepted',
      duplicate: false,
      outcome: 'confirmed',
      alertOpened: false,
    })
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({ financialStatus: 'paid', operationalStatus: 'confirmed' })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
    expect(await loadReviews(t, created.operationId)).toHaveLength(0)
    const [transaction] = await loadTransactions(t, created.operationId)
    expect(transaction).toMatchObject({ status: 'succeeded' })

    const view = await getOperationView(t, created)
    expect(view.presentation.code).toBe('confirmed')
    expect(view.receiptNumber).toMatch(/^SC-2026-/)
    expect(view.payment).toMatchObject({
      paymentId: payment.paymentId,
      status: 'succeeded',
      message: CONFIRMED_MESSAGE,
      pix: null, // não reexibe um código já pago
    })
  })

  it('pagamento RECUSADO: cobrança falha, nada recebido, operação continua pendente e pode tentar de novo', async () => {
    const first = await startPayment(t, created, 'pix')
    const run = await simulate(t, created.operationId, 'declined')

    expect(run.notification).toMatchObject({ status: 'accepted', outcome: 'transaction_updated' })
    const [transaction] = await loadTransactions(t, created.operationId)
    expect(transaction?.status).toBe('failed')
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(operation?.paidAt).toBeUndefined()
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    expect(await loadReviews(t, created.operationId)).toHaveLength(0)
    const view = await getOperationView(t, created)
    expect(view.payment).toMatchObject({
      status: 'failed',
      message: CHARGE_FAILED_MESSAGE,
      pix: null,
    })

    // Dentro do prazo, uma nova cobrança é aceita (nova tentativa, nova cobrança).
    const retry = await startPayment(t, created, 'pix')
    expect(retry.reused).toBe(false)
    expect(retry.payment.paymentId).not.toBe(first.payment.paymentId)
    expect(retry.payment.status).toBe('pending')
  })

  it('pagamento PENDENTE: confirma que segue pendente e não muda nada', async () => {
    await startPayment(t, created, 'pix')
    const before = await loadOperation(t, created.operationId)
    const run = await simulate(t, created.operationId, 'pending')

    expect(run.notification).toMatchObject({ status: 'accepted', outcome: 'ignored' })
    expect(await loadOperation(t, created.operationId)).toEqual(before)
    const [transaction] = await loadTransactions(t, created.operationId)
    expect(transaction?.status).toBe('pending')
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('pagamento CONFIRMADO APÓS A EXPIRAÇÃO: paid_late + análise, nada liberado, sem reembolso', async () => {
    await startPayment(t, created, 'pix')
    const run = await simulate(t, created.operationId, 'approved_after_expiry')

    expect(run.notification).toMatchObject({ status: 'accepted', outcome: 'under_review' })
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
    })
    // Nada liberado: sem comprovante; análise administrativa aberta pelo motivo certo.
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
    const reviews = await loadReviews(t, created.operationId)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ reason: 'late_payment', status: 'open' })
    // O dinheiro NÃO é descartado: a transação fica `succeeded`.
    const [transaction] = await loadTransactions(t, created.operationId)
    expect(transaction?.status).toBe('succeeded')
    // Histórico: criada → análise aberta. Nada de reembolso nem de confirmação.
    const types = (await loadEvents(t, created.operationId)).map((event) => event.type)
    expect(types).toEqual(['created', 'review_opened'])

    const view = await getOperationView(t, created)
    expect(view.financialStatus).toBe('paid_late')
    expect(view.operationalStatus).toBe('under_review')
    expect(view.presentation.message).toBe(LATE_PAYMENT_MESSAGE)
    expect(view.payment?.message).toBe(LATE_PAYMENT_MESSAGE)
  })

  it('confirmação tardia depois de a expiração ter liberado as reservas: retoma a reserva e segue em análise', async () => {
    await startPayment(t, created, 'pix')
    vi.setSystemTime(created.expiresAt + 5_000)
    await expireOperation(t, created.operationId)
    expect((await loadPeople(t, created.operationId)).every((p) => p.claim === 'released')).toBe(
      true,
    )

    const run = await simulate(t, created.operationId, 'approved')

    expect(run.notification).toMatchObject({ outcome: 'under_review' })
    const operation = await loadOperation(t, created.operationId)
    expect(operation).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
    })
    expect((await loadPeople(t, created.operationId)).every((p) => p.claim === 'active')).toBe(true)
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('aprovar com o relógio depois do prazo também é tardio (a regra usa o instante do recebimento)', async () => {
    await startPayment(t, created, 'pix')
    vi.setSystemTime(created.expiresAt + 1)
    const run = await simulate(t, created.operationId, 'approved')
    expect(run.notification).toMatchObject({ outcome: 'under_review' })
    expect((await loadOperation(t, created.operationId))?.financialStatus).toBe('paid_late')
  })

  it('confirmação REPETIDA (mesmo evento): não reaplica, não duplica comprovante', async () => {
    await startPayment(t, created, 'pix')
    const first = await simulate(t, created.operationId, 'approved', 'evt-repetido')
    const second = await simulate(t, created.operationId, 'approved', 'evt-repetido')
    const third = await simulate(t, created.operationId, 'approved', 'evt-repetido')

    expect(first.notification).toMatchObject({ duplicate: false, outcome: 'confirmed' })
    expect(second.notification).toMatchObject({ duplicate: true, outcome: 'confirmed' })
    expect(third.notification).toMatchObject({ duplicate: true })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
    const events = await loadProviderEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0]?.occurrences).toBe(3)
    expect(await loadEvents(t, created.operationId).then((e) => e.map((x) => x.type))).toEqual([
      'created',
      'payment_confirmed',
    ])
  })

  it('outro evento para a mesma cobrança já paga: ignorado (sem segunda confirmação)', async () => {
    await startPayment(t, created, 'pix')
    await simulate(t, created.operationId, 'approved')
    const again = await simulate(t, created.operationId, 'approved')
    expect(again.notification).toMatchObject({ duplicate: false, outcome: 'ignored' })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
    expect(await loadReviews(t, created.operationId)).toHaveLength(0)
  })

  it('evento fora de ordem: recusa/expiração depois de aprovada não rebaixa o pagamento', async () => {
    await startPayment(t, created, 'pix')
    await simulate(t, created.operationId, 'approved')
    const late = await simulate(t, created.operationId, 'declined')
    expect(late.notification).toMatchObject({ outcome: 'ignored' })
    const [transaction] = await loadTransactions(t, created.operationId)
    expect(transaction?.status).toBe('succeeded')
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
    })
  })

  it('cartão aprovado na criação + aviso posterior do provedor: não duplica', async () => {
    await startPayment(t, created, 'card', MOCK_CARD_TOKEN_APPROVED)
    const run = await simulate(t, created.operationId, 'approved')
    expect(run.notification).toMatchObject({ outcome: 'ignored' })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(1)
  })

  it('cartão aprovado DEPOIS do prazo (operação já expirada e cobrança iniciada antes): vira análise, não liberação', async () => {
    const pendingCard = await startPayment(t, created, 'card', MOCK_CARD_TOKEN_PENDING)
    expect(pendingCard.payment.status).toBe('pending')
    vi.setSystemTime(created.expiresAt + 10_000)
    const run = await simulate(t, created.operationId, 'approved')
    expect(run.notification).toMatchObject({ outcome: 'under_review' })
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
    })
  })

  it('simulação sem cobrança criada: recusa', async () => {
    const data = await errorData(simulate(t, created.operationId, 'approved'))
    expect(data.code).toBe('no_charge_for_operation')
  })

  it('o prazo continua de 15 minutos', async () => {
    expect(created.expiresAt - NOW).toBeGreaterThanOrEqual(FIFTEEN_MINUTES)
    expect(created.expiresAt - NOW).toBeLessThan(FIFTEEN_MINUTES + 1_000)
  })
})

describe('proteção contra confirmação não autorizada', () => {
  it('a simulação recusa rodar fora de APP_ENV=development, sem alterar nada', async () => {
    await startPayment(t, created, 'pix')
    const before = await loadOperation(t, created.operationId)
    vi.stubEnv('APP_ENV', 'production')
    const data = await errorData(simulate(t, created.operationId, 'approved'))
    expect(data.code).toBe('simulation_disabled')
    expect(await loadOperation(t, created.operationId)).toEqual(before)
    expect(await loadProviderEvents(t)).toHaveLength(0)
  })

  it('a simulação recusa rodar com provider diferente do mock', async () => {
    await startPayment(t, created, 'pix')
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
    const data = await errorData(simulate(t, created.operationId, 'approved'))
    expect(data.code).toBe('simulation_disabled')
    expect(await loadProviderEvents(t)).toHaveLength(0)
  })

  it('o navegador não consegue enviar estado, valor nem confirmação a startPayment', async () => {
    await startPayment(t, created, 'pix')
    const message = await t
      .action(api.public.payments.startPayment, {
        operationId: created.operationId,
        accessToken: created.accessToken,
        paymentMethod: 'pix',
        status: 'succeeded',
        providerTransactionId: 'mock_pix_pending_x',
      } as never)
      .then(
        () => 'aceito',
        (error: unknown) => String(error),
      )
    expect(message).toMatch(/Unexpected field/i)
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
  })

  it('webhook com assinatura inválida ou ausente é rejeitado e não registra nem altera nada', async () => {
    const { payment } = await startPayment(t, created, 'pix')
    const [transaction] = await loadTransactions(t, created.operationId)
    const body = JSON.stringify({
      eventId: 'evt-forjado',
      providerTransactionId: transaction?.providerTransactionId,
      status: 'succeeded',
      amountCents: TOTAL,
      occurredAt: NOW,
    })
    const wrong = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: body,
      headers: { 'x-mock-signature': 'assinatura-errada' },
    })
    const missing = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: body,
      headers: {},
    })

    expect(wrong).toEqual({ status: 'rejected', reason: 'invalid_signature' })
    expect(missing).toEqual({ status: 'rejected', reason: 'invalid_signature' })
    expect(await loadProviderEvents(t)).toHaveLength(0)
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    const view = await getOperationView(t, created)
    expect(view.payment?.paymentId).toBe(payment.paymentId)
    expect(view.payment?.status).toBe('pending')
  })

  it('webhook com corpo malformado ou valores inválidos é rejeitado', async () => {
    const headers = { 'X-Mock-Signature': MOCK_WEBHOOK_SIGNATURE }
    const notJson = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: 'não é json',
      headers,
    })
    const missingFields = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: JSON.stringify({ eventId: 'e' }),
      headers,
    })
    const negative = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: JSON.stringify({
        eventId: 'e2',
        providerTransactionId: 'x',
        status: 'succeeded',
        amountCents: -1,
        occurredAt: NOW,
      }),
      headers,
    })
    expect(notJson).toEqual({ status: 'rejected', reason: 'invalid_request' })
    expect(missingFields).toEqual({ status: 'rejected', reason: 'invalid_request' })
    expect(negative).toEqual({ status: 'rejected', reason: 'invalid_request' })
    expect(await loadProviderEvents(t)).toHaveLength(0)
  })

  it('webhook autêntico de cobrança DESCONHECIDA: registra, alerta e não confirma nada', async () => {
    await startPayment(t, created, 'pix')
    const result = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: JSON.stringify({
        eventId: 'evt-desconhecido',
        providerTransactionId: 'mock_pix_pending_inexistente',
        status: 'succeeded',
        amountCents: TOTAL,
        occurredAt: NOW,
      }),
      headers: { 'x-mock-signature': MOCK_WEBHOOK_SIGNATURE },
    })

    expect(result).toEqual({
      status: 'accepted',
      duplicate: false,
      outcome: 'unknown_transaction',
      alertOpened: true,
    })
    const [event] = await loadProviderEvents(t)
    expect(event).toMatchObject({ alertStatus: 'open', alertReason: 'unknown_transaction' })
    expect(await loadOperation(t, created.operationId)).toMatchObject({
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
    })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })

  it('webhook com valor diferente do da operação: análise por divergência, nada liberado', async () => {
    await startPayment(t, created, 'pix')
    const [transaction] = await loadTransactions(t, created.operationId)
    const result = await t.action(internal.payments.webhookProcessor.processNotification, {
      rawBody: JSON.stringify({
        eventId: 'evt-valor',
        providerTransactionId: transaction?.providerTransactionId,
        status: 'succeeded',
        amountCents: TOTAL - 1,
        occurredAt: NOW,
      }),
      headers: { 'x-mock-signature': MOCK_WEBHOOK_SIGNATURE },
    })
    expect(result).toMatchObject({ status: 'accepted', outcome: 'under_review' })
    const [review] = await loadReviews(t, created.operationId)
    expect(review).toMatchObject({ reason: 'amount_mismatch', status: 'open' })
    expect(await loadReceipts(t, created.operationId)).toHaveLength(0)
  })
})

describe('public/payments:getOperation — cobrança', () => {
  it('sem cobrança: payment é null; com Pix pendente, reexibe o código após recarregar', async () => {
    expect((await getOperationView(t, created)).payment).toBeNull()
    const { payment } = await startPayment(t, created, 'pix')
    const view = await getOperationView(t, created)
    expect(view.payment).toEqual(payment)
    expect(view.payment?.pix?.copyPasteCode).toBe(payment.pix?.copyPasteCode)
  })

  it('o Pix deixa de ser oferecido depois que a operação expira', async () => {
    await startPayment(t, created, 'pix')
    vi.setSystemTime(created.expiresAt + 1_000)
    await expireOperation(t, created.operationId)
    const view = await getOperationView(t, created)
    expect(view.operationalStatus).toBe('expired')
    expect(view.financialStatus).toBe('unpaid')
  })

  it('a cobrança de uma operação não aparece na consulta de outra', async () => {
    await startPayment(t, created, 'pix')
    const other = await newOperation({ linkIds: [family.dependentLinkIds[1]] })
    expect((await getOperationView(t, other)).payment).toBeNull()
  })
})
