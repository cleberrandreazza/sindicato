// @vitest-environment edge-runtime
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import { LATE_PAYMENT_MESSAGE } from '../../convex/domain/messages'
import {
  FIFTEEN_MINUTES,
  MOCK,
  NOW,
  USAGE_DATE,
  confirmPayment,
  createBackend,
  expectConvexError,
  expireOperation,
  grantSession,
  identify,
  loadEvents,
  loadOperation,
  loadPeople,
  publicCreate,
  seedFamily,
  seedTransaction,
  stubPublicApiEnv,
  type Backend,
  type Fixture,
} from './helpers'

let t: Backend
let family: Fixture
let token: string

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  stubPublicApiEnv()
  t = createBackend()
  family = await seedFamily(t)
  token = await grantSession(t, family.memberId)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const operationCount = () =>
  t.run(async (ctx) => (await ctx.db.query('paymentOperations').collect()).length)

function checkDuplicates(
  linkIds: Fixture['dependentLinkIds'][number][],
  options: { usageDate?: string; fixture?: Fixture; token?: string } = {},
) {
  const target = options.fixture ?? family
  return t.query(api.public.payments.checkDuplicates, {
    memberId: target.memberId,
    identificationToken: options.token ?? token,
    linkIds,
    usageDate: options.usageDate ?? USAGE_DATE,
  })
}

function getOperation(operationId: Parameters<typeof loadOperation>[1], accessToken: string) {
  return t.query(api.public.payments.getOperation, { operationId, accessToken })
}

async function errorData(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError) return error.data
    throw error
  }
  throw new Error('Esperava um ConvexError.')
}

describe('public/payments:createOperation', () => {
  it('cria a operação com quantidade, total e prazo calculados pelo servidor', async () => {
    const created = await publicCreate(t, family, token)

    expect(created).toMatchObject({
      usageDate: USAGE_DATE,
      quantity: 2,
      unitAmountCents: 3000,
      totalAmountCents: 6000,
    })
    expect(created.expiresAt).toBeGreaterThanOrEqual(NOW + FIFTEEN_MINUTES)
    expect(created.expiresAt).toBeLessThan(NOW + FIFTEEN_MINUTES + 1000)
    expect(created.people).toEqual([
      { name: 'Ana Teste', role: 'holder' },
      { name: 'Bruno Teste', role: 'spouse' },
    ])
    expect(created.accessToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('grava a operação aguardando pagamento, sem pagamento, com reservas ativas e histórico', async () => {
    const created = await publicCreate(t, family, token)
    const stored = await loadOperation(t, created.operationId)

    expect(stored).toMatchObject({
      memberId: family.memberId,
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
      expiresAt: created.expiresAt,
    })
    // Só o hash da credencial é guardado.
    expect(stored?.accessTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.accessTokenHash).not.toBe(created.accessToken)

    const people = await loadPeople(t, created.operationId)
    expect(people.map((person) => person.claim)).toEqual(['active', 'active'])
    expect(people.map((person) => person.personId)).toEqual([
      family.personIds.holder,
      family.personIds.bruno,
    ])
    expect((await loadEvents(t, created.operationId)).map((event) => event.type)).toEqual([
      'created',
    ])
  })

  it('calcula R$ 30,00 por pessoa para 1, 2, 3 pessoas, com ou sem titular', async () => {
    const [bruno, clara] = family.dependentLinkIds
    const cases = [
      { linkIds: [family.holderLinkId], usageDate: '2026-12-10', total: 3000, quantity: 1 },
      { linkIds: [bruno, clara], usageDate: '2026-12-11', total: 6000, quantity: 2 },
      {
        linkIds: [family.holderLinkId, bruno, clara],
        usageDate: '2026-12-12',
        total: 9000,
        quantity: 3,
      },
    ]
    for (const { linkIds, usageDate, total, quantity } of cases) {
      const created = await publicCreate(t, family, token, { linkIds, usageDate })
      expect(created).toMatchObject({ quantity, unitAmountCents: 3000, totalAmountCents: total })
      expect(Number.isInteger(created.totalAmountCents)).toBe(true)
    }
  })

  it('o total vem sempre do servidor: argumentos financeiros do navegador são recusados', async () => {
    const base = {
      memberId: family.memberId,
      identificationToken: token,
      usageDate: USAGE_DATE,
      linkIds: [family.holderLinkId],
    }
    const forbiddenExtras = [
      { totalAmountCents: 1 },
      { unitAmountCents: 1 },
      { quantity: 99 },
      { amountCents: 1 },
      { financialStatus: 'paid' },
      { operationalStatus: 'confirmed' },
      { expiresAt: NOW + 24 * 3600 * 1000 },
      { names: ['Convidado'] },
    ]
    for (const extra of forbiddenExtras) {
      await expect(
        // Campos que o navegador não pode enviar: recusados pelo validador de argumentos.
        t.mutation(api.public.payments.createOperation, { ...base, ...extra }),
      ).rejects.toThrow(/Unexpected field/i)
    }
    expect(await operationCount()).toBe(0)
  })

  it('recusa data passada, inválida e vazia, sem criar nada', async () => {
    await expectConvexError(
      publicCreate(t, family, token, { usageDate: '2026-11-30' }),
      'past_usage_date',
    )
    await expectConvexError(
      publicCreate(t, family, token, { usageDate: '2026-02-30' }),
      'invalid_usage_date',
    )
    await expectConvexError(publicCreate(t, family, token, { usageDate: '' }), 'invalid_usage_date')
    await expectConvexError(
      publicCreate(t, family, token, { usageDate: '2026-12-10T00:00:00Z' }),
      'invalid_usage_date',
    )
    expect(await operationCount()).toBe(0)
  })

  it('a data de hoje é aceita', async () => {
    const created = await publicCreate(t, family, token, { usageDate: '2026-12-01' })
    expect(created.usageDate).toBe('2026-12-01')
  })

  it('o argumento de data é obrigatório', async () => {
    await expect(
      // @ts-expect-error sem usageDate
      t.mutation(api.public.payments.createOperation, {
        memberId: family.memberId,
        identificationToken: token,
        linkIds: [family.holderLinkId],
      }),
    ).rejects.toThrow()
  })

  it('recusa seleção sem pessoas', async () => {
    await expectConvexError(publicCreate(t, family, token, { linkIds: [] }), 'empty_selection')
    expect(await operationCount()).toBe(0)
  })

  it('recusa dependente inativo e pessoa repetida', async () => {
    await expectConvexError(
      publicCreate(t, family, token, { linkIds: [family.inactiveLinkId] }),
      'link_inactive',
    )
    await expectConvexError(
      publicCreate(t, family, token, { linkIds: [family.holderLinkId, family.holderLinkId] }),
      'duplicate_person',
    )
    expect(await operationCount()).toBe(0)
  })

  it('recusa pessoa de outro titular, sem criar nada e sem revelar dados dela', async () => {
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const data = await errorData(
      publicCreate(t, family, token, { linkIds: [other.holderLinkId, family.holderLinkId] }),
    )
    expect(data).toMatchObject({ code: 'link_not_found' })
    expect(JSON.stringify(data)).not.toContain('Ana Teste') // nome de ninguém
    expect(await operationCount()).toBe(0)
  })

  it('recusa titular inativo', async () => {
    const inactive = await seedFamily(t, { membershipNumber: 'T-0009', status: 'inactive' })
    const inactiveToken = await grantSession(t, inactive.memberId)
    await expectConvexError(
      publicCreate(t, inactive, inactiveToken, { linkIds: [inactive.holderLinkId] }),
      'member_inactive',
    )
  })

  it('exige prova de identificação do PRÓPRIO titular', async () => {
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const otherToken = await grantSession(t, other.memberId)

    // Prova de outro titular, token inventado, vazio ou expirado.
    await expectConvexError(publicCreate(t, family, otherToken), 'session_invalid')
    await expectConvexError(publicCreate(t, family, 'inventado'), 'session_invalid')
    await expectConvexError(publicCreate(t, family, ''), 'session_invalid')
    vi.setSystemTime(NOW + 31 * 60 * 1000)
    await expectConvexError(publicCreate(t, family, token), 'session_invalid')
    expect(await operationCount()).toBe(0)
  })

  it('funciona de ponta a ponta a partir da consulta cadastral do mock', async () => {
    const ana = await identify(t, MOCK.ana)
    const created = await t.mutation(api.public.payments.createOperation, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      usageDate: USAGE_DATE,
      linkIds: [ana.holder.linkId, ...ana.dependents.map((person) => person.linkId)],
    })
    expect(created).toMatchObject({ quantity: 3, totalAmountCents: 9000 })
  })

  it('a expiração é agendada e libera as reservas depois de 15 minutos', async () => {
    const created = await publicCreate(t, family, token)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await loadOperation(t, created.operationId))?.operationalStatus).toBe('expired')
  })

  describe('proteção contra abuso', () => {
    it('limita a 10 operações criadas por titular em 15 minutos', async () => {
      for (let day = 10; day < 20; day += 1) {
        await publicCreate(t, family, token, {
          usageDate: `2026-12-${day}`,
          linkIds: [family.holderLinkId],
        })
      }
      const blocked = await errorData(
        publicCreate(t, family, token, { usageDate: '2026-12-25', linkIds: [family.holderLinkId] }),
      )
      expect(blocked).toMatchObject({ code: 'too_many_requests' })

      vi.setSystemTime(NOW + FIFTEEN_MINUTES + 5000)
      const freshToken = await grantSession(t, family.memberId)
      await publicCreate(t, family, freshToken, {
        usageDate: '2026-12-25',
        linkIds: [family.holderLinkId],
      })
    })

    it('tentativas recusadas (duplicidade, data passada) não consomem a cota', async () => {
      await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await errorData(publicCreate(t, family, token, { linkIds: [family.holderLinkId] }))
        await errorData(publicCreate(t, family, token, { usageDate: '2020-01-01' }))
      }
      await publicCreate(t, family, token, {
        usageDate: '2026-12-11',
        linkIds: [family.holderLinkId],
      })
    })
  })
})

describe('public/payments:checkDuplicates', () => {
  it('sem operações anteriores, nenhuma pessoa está em conflito', async () => {
    const result = await checkDuplicates([family.holderLinkId, ...family.dependentLinkIds])
    expect(result).toEqual({ ok: true, usageDate: USAGE_DATE, hasConflicts: false, conflicts: [] })
  })

  it('operação PENDENTE bloqueia apenas as pessoas já cobradas', async () => {
    await publicCreate(t, family, token, { linkIds: [family.dependentLinkIds[0]] })

    const result = await checkDuplicates([family.dependentLinkIds[0], family.dependentLinkIds[1]])
    expect(result).toMatchObject({
      ok: true,
      hasConflicts: true,
      conflicts: [{ linkId: family.dependentLinkIds[0], name: 'Bruno Teste' }],
    })
  })

  it('pagamento já RECEBIDO no prazo bloqueia', async () => {
    const created = await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-paid',
      amountCents: created.totalAmountCents,
    })
    await confirmPayment(t, {
      providerTransactionId: 'tx-paid',
      occurredAt: NOW + 1000,
      amountCents: created.totalAmountCents,
    })

    const result = await checkDuplicates([family.holderLinkId])
    expect(result).toMatchObject({ ok: true, hasConflicts: true })
  })

  it('pagamento TARDIO em análise bloqueia', async () => {
    const created = await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-late',
      amountCents: created.totalAmountCents,
    })
    vi.setSystemTime(created.expiresAt + 120_000)
    await expireOperation(t, created.operationId)
    expect(await checkDuplicates([family.holderLinkId], { usageDate: '2026-12-10' })).toMatchObject(
      {
        hasConflicts: false, // expirada sem recebimento: não bloqueia
      },
    )

    await confirmPayment(t, {
      providerTransactionId: 'tx-late',
      occurredAt: created.expiresAt + 60_000,
      amountCents: created.totalAmountCents,
    })
    expect((await loadOperation(t, created.operationId))?.operationalStatus).toBe('under_review')
    expect(await checkDuplicates([family.holderLinkId])).toMatchObject({ hasConflicts: true })
  })

  it('operação EXPIRADA sem recebimento não bloqueia nova tentativa', async () => {
    const created = await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    expect(await checkDuplicates([family.holderLinkId])).toMatchObject({ hasConflicts: true })

    vi.setSystemTime(created.expiresAt)
    await expireOperation(t, created.operationId)

    expect(await checkDuplicates([family.holderLinkId])).toMatchObject({ hasConflicts: false })
    const again = await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    expect(again.operationId).not.toBe(created.operationId)
  })

  it('outra data não conflita', async () => {
    await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    const result = await checkDuplicates([family.holderLinkId], { usageDate: '2026-12-11' })
    expect(result).toMatchObject({ ok: true, hasConflicts: false })
  })

  it('detecta a MESMA pessoa já cobrada por outro titular, sem revelar o outro titular', async () => {
    const mother = await seedFamily(t, { membershipNumber: 'T-0100', sharedPersonId: 'p-clara' })
    const father = await seedFamily(t, { membershipNumber: 'T-0200', sharedPersonId: 'p-clara' })
    const motherToken = await grantSession(t, mother.memberId)
    const fatherToken = await grantSession(t, father.memberId)
    await publicCreate(t, mother, motherToken, { linkIds: [mother.dependentLinkIds[1]] })

    const result = await checkDuplicates([father.dependentLinkIds[1]], {
      fixture: father,
      token: fatherToken,
    })

    expect(result).toEqual({
      ok: true,
      usageDate: USAGE_DATE,
      hasConflicts: true,
      conflicts: [{ linkId: father.dependentLinkIds[1], name: 'Clara Teste' }],
    })
    const serialized = JSON.stringify(result)
    for (const leaked of ['T-0100', mother.memberId, mother.dependentLinkIds[1]]) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it('valida data e seleção antes de responder', async () => {
    expect(await checkDuplicates([family.holderLinkId], { usageDate: '2026-11-30' })).toMatchObject(
      {
        ok: false,
        code: 'past_usage_date',
      },
    )
    expect(await checkDuplicates([family.holderLinkId], { usageDate: '2026-02-30' })).toMatchObject(
      {
        ok: false,
        code: 'invalid_usage_date',
      },
    )
    expect(await checkDuplicates([])).toMatchObject({ ok: false, code: 'empty_selection' })
    expect(await checkDuplicates([family.inactiveLinkId])).toMatchObject({
      ok: false,
      code: 'link_inactive',
    })
  })

  it('não permite sondar pessoas de terceiros: vínculo alheio é "não encontrado"', async () => {
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const otherToken = await grantSession(t, other.memberId)
    await publicCreate(t, other, otherToken, { linkIds: [other.holderLinkId] })

    const probe = await checkDuplicates([other.holderLinkId])
    expect(probe).toMatchObject({ ok: false, code: 'link_not_found' })
  })

  it('exige prova de identificação', async () => {
    await expectConvexError(
      Promise.resolve(checkDuplicates([family.holderLinkId], { token: 'inventado' })),
      'session_invalid',
    )
  })

  it('é apenas informativa: não cria nem altera nada', async () => {
    await checkDuplicates([family.holderLinkId])
    expect(await operationCount()).toBe(0)
  })

  it('operações simultâneas: no máximo uma passa, mesmo que todas "vejam" a data livre', async () => {
    expect(await checkDuplicates([family.holderLinkId])).toMatchObject({ hasConflicts: false })

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        publicCreate(t, family, token, { linkIds: [family.holderLinkId] }),
      ),
    )

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(rejected).toHaveLength(4)
    for (const attempt of rejected) {
      expect(attempt.reason).toBeInstanceOf(ConvexError)
      expect((attempt.reason as ConvexError<{ code: string }>).data.code).toBe('duplicate_usage')
    }
    expect(await operationCount()).toBe(1)
  })
})

describe('public/payments:getOperation', () => {
  it('devolve ao dono apenas os dados do fluxo do associado', async () => {
    const created = await publicCreate(t, family, token)
    const view = await getOperation(created.operationId, created.accessToken)

    expect(view).toMatchObject({
      operationId: created.operationId,
      usageDate: USAGE_DATE,
      quantity: 2,
      unitAmountCents: 3000,
      totalAmountCents: 6000,
      expiresAt: created.expiresAt,
      operationalStatus: 'awaiting_payment',
      financialStatus: 'unpaid',
      receiptNumber: null,
      presentation: { code: 'awaiting_payment' },
      people: [
        { name: 'Ana Teste', role: 'holder' },
        { name: 'Bruno Teste', role: 'spouse' },
      ],
    })
  })

  it('não expõe identificadores internos, hashes nem dados de terceiros', async () => {
    const created = await publicCreate(t, family, token)
    const serialized = JSON.stringify(await getOperation(created.operationId, created.accessToken))

    for (const leaked of [
      family.memberId,
      family.personIds.holder,
      family.holderLinkId,
      'accessTokenHash',
      'memberId',
      'personId',
      'cpf',
      created.accessToken,
    ]) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it('credencial incorreta, vazia ou de outra operação: mesma resposta de "não encontrada"', async () => {
    const mine = await publicCreate(t, family, token, { linkIds: [family.holderLinkId] })
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const otherToken = await grantSession(t, other.memberId)
    const theirs = await publicCreate(t, other, otherToken, { linkIds: [other.holderLinkId] })

    // Terceiro tentando ler a operação de outro titular.
    const stolenId = await errorData(getOperation(theirs.operationId, mine.accessToken))
    const wrong = await errorData(getOperation(mine.operationId, 'x'.repeat(64)))
    const empty = await errorData(getOperation(mine.operationId, ''))
    const huge = await errorData(getOperation(mine.operationId, 'x'.repeat(5000)))
    // Operação inexistente (apagada), com credencial qualquer.
    await t.run((ctx) => ctx.db.delete(mine.operationId))
    const missing = await errorData(getOperation(mine.operationId, mine.accessToken))

    for (const data of [stolenId, wrong, empty, huge, missing]) {
      expect(data).toMatchObject({ code: 'operation_not_found' })
    }
    expect(
      new Set([stolenId, wrong, empty, huge, missing].map((data) => JSON.stringify(data))).size,
    ).toBe(1)
  })

  it('a prova de identificação NÃO dá acesso à operação (credenciais distintas)', async () => {
    const created = await publicCreate(t, family, token)
    await expectConvexError(
      Promise.resolve(getOperation(created.operationId, token)),
      'operation_not_found',
    )
  })

  it('mostra "expirada" quando o prazo passa, mesmo antes da execução agendada', async () => {
    const created = await publicCreate(t, family, token)
    vi.setSystemTime(created.expiresAt)

    const view = await getOperation(created.operationId, created.accessToken)
    expect(view.operationalStatus).toBe('expired')
    expect(view.presentation.code).toBe('expired')
  })

  it('pagamento no prazo: confirmada, com número do comprovante', async () => {
    const created = await publicCreate(t, family, token)
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-ok',
      amountCents: created.totalAmountCents,
    })
    await confirmPayment(t, {
      providerTransactionId: 'tx-ok',
      occurredAt: NOW + 1000,
      amountCents: created.totalAmountCents,
    })

    expect(await getOperation(created.operationId, created.accessToken)).toMatchObject({
      operationalStatus: 'confirmed',
      financialStatus: 'paid',
      presentation: { code: 'confirmed' },
      receiptNumber: 'SC-2026-000001',
    })
  })

  it('pagamento tardio: separa financeiro (recebido) de operacional (em análise), com a mensagem oficial', async () => {
    const created = await publicCreate(t, family, token)
    await seedTransaction(t, created.operationId, {
      providerTransactionId: 'tx-late',
      amountCents: created.totalAmountCents,
    })
    vi.setSystemTime(created.expiresAt + 120_000)
    await expireOperation(t, created.operationId)
    await confirmPayment(t, {
      providerTransactionId: 'tx-late',
      occurredAt: created.expiresAt + 60_000,
      amountCents: created.totalAmountCents,
    })

    const view = await getOperation(created.operationId, created.accessToken)
    expect(view).toMatchObject({
      financialStatus: 'paid_late',
      operationalStatus: 'under_review',
      receiptNumber: null,
      presentation: { code: 'under_review_late_payment', message: LATE_PAYMENT_MESSAGE },
    })
  })

  it('o navegador só consulta: não existe função pública que altere a operação', async () => {
    const created = await publicCreate(t, family, token)
    // `getOperation` é uma query; chamar com argumentos de estado é recusado pelo validador.
    await expect(
      t.query(api.public.payments.getOperation, {
        operationId: created.operationId,
        accessToken: created.accessToken,
        // @ts-expect-error o navegador não pode enviar estados
        operationalStatus: 'confirmed',
      }),
    ).rejects.toThrow()
    expect((await loadOperation(t, created.operationId))?.operationalStatus).toBe(
      'awaiting_payment',
    )
  })
})
