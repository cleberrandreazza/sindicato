// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import { hashRequestKey } from '../../convex/domain/idempotency'
import { hashAccessToken } from '../../convex/domain/privacy'
import {
  FIFTEEN_MINUTES,
  NOW,
  TEST_TOKEN_SECRET,
  USAGE_DATE,
  createBackend,
  errorData,
  expectConvexError,
  expireOperation,
  grantSession,
  loadEvents,
  loadOperation,
  loadPeople,
  publicCreate,
  seedFamily,
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

const newRequestId = () => crypto.randomUUID()
const operations = () => t.run((ctx) => ctx.db.query('paymentOperations').collect())

function getOperation(operationId: Parameters<typeof loadOperation>[1], accessToken: string) {
  return t.query(api.public.payments.getOperation, { operationId, accessToken })
}

describe('createOperation com requestId: criação', () => {
  it('cria a operação com total e prazo calculados pelo servidor, a partir da criação', async () => {
    const created = await publicCreate(t, family, token, { requestId: newRequestId() })

    expect(created).toMatchObject({
      reused: false,
      quantity: 2,
      unitAmountCents: 3000,
      totalAmountCents: 6000,
      usageDate: USAGE_DATE,
    })
    // O prazo começa no instante da criação, medido pelo relógio do servidor.
    expect(created.expiresAt).toBeGreaterThanOrEqual(NOW + FIFTEEN_MINUTES)
    expect(created.expiresAt).toBeLessThan(NOW + FIFTEEN_MINUTES + 1000)
    expect(created.accessToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('o prazo só começa na criação: a repetição minutos depois mantém o prazo original', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })

    vi.setSystemTime(NOW + 6 * 60 * 1000)
    const again = await publicCreate(t, family, token, { requestId })

    expect(again.reused).toBe(true)
    expect(again.expiresAt).toBe(created.expiresAt)
    // Continua sendo criação + 15 min, não "agora + 15 min" (a repetição foi 6 min depois).
    expect(again.expiresAt).toBeLessThan(NOW + FIFTEEN_MINUTES + 1000)
  })

  it('guarda só o hash da chave e o hash do token, nunca os valores em texto puro', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })
    const stored = await loadOperation(t, created.operationId)

    expect(stored?.requestKeyHash).toBe(await hashRequestKey(family.memberId, requestId))
    expect(stored?.requestKeyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.accessTokenHash).toBe(await hashAccessToken(created.accessToken))

    // Varre TODOS os dados persistidos: nem o requestId nem o token aparecem em claro.
    const everything = await t.run(async (ctx) => {
      const tables = ['paymentOperations', 'operationPeople', 'operationEvents'] as const
      const rows = await Promise.all(tables.map((table) => ctx.db.query(table).collect()))
      return JSON.stringify(rows)
    })
    expect(everything).not.toContain(requestId)
    expect(everything).not.toContain(requestId.replaceAll('-', ''))
    expect(everything).not.toContain(created.accessToken)
  })

  it('sem requestId o comportamento original é mantido (token aleatório, sem chave)', async () => {
    const first = await publicCreate(t, family, token)
    const stored = await loadOperation(t, first.operationId)

    expect(first.reused).toBe(false)
    expect(stored?.requestKeyHash).toBeUndefined()
    expect(first.accessToken).toMatch(/^[0-9a-f]{64}$/)
    // Sem chave, repetir não é idempotente: a própria operação pendente bloqueia a repetição.
    await expectConvexError(publicCreate(t, family, token), 'duplicate_usage')
    expect(await operations()).toHaveLength(1)
  })

  it('o token funciona em getOperation e a operação nasce pendente, com reservas ativas', async () => {
    const created = await publicCreate(t, family, token, { requestId: newRequestId() })
    const view = await getOperation(created.operationId, created.accessToken)

    expect(view).toMatchObject({
      operationId: created.operationId,
      financialStatus: 'unpaid',
      operationalStatus: 'awaiting_payment',
      totalAmountCents: 6000,
      expiresAt: created.expiresAt,
    })
    expect((await loadPeople(t, created.operationId)).map((p) => p.claim)).toEqual([
      'active',
      'active',
    ])
  })
})

describe('createOperation com requestId: idempotência', () => {
  it('a repetição devolve a operação original, com o mesmo token, sem criar outra', async () => {
    const requestId = newRequestId()
    const first = await publicCreate(t, family, token, { requestId })
    const second = await publicCreate(t, family, token, { requestId })

    expect(second.reused).toBe(true)
    expect(second.operationId).toBe(first.operationId)
    expect(second.accessToken).toBe(first.accessToken)
    expect(second).toMatchObject({
      quantity: first.quantity,
      unitAmountCents: first.unitAmountCents,
      totalAmountCents: first.totalAmountCents,
      expiresAt: first.expiresAt,
      people: first.people,
    })
    expect(await operations()).toHaveLength(1)
    expect(await loadPeople(t, first.operationId)).toHaveLength(2)
    expect((await loadEvents(t, first.operationId)).map((event) => event.type)).toEqual(['created'])
  })

  it('várias repetições seguidas continuam devolvendo a mesma operação', async () => {
    const requestId = newRequestId()
    const first = await publicCreate(t, family, token, { requestId })
    for (let i = 0; i < 12; i += 1) {
      const again = await publicCreate(t, family, token, { requestId })
      expect(again).toMatchObject({ reused: true, operationId: first.operationId })
    }
    expect(await operations()).toHaveLength(1)
  })

  it('clique duplo / chamadas simultâneas com o mesmo requestId resultam em UMA operação', async () => {
    const requestId = newRequestId()
    const results = await Promise.all(
      Array.from({ length: 8 }, () => publicCreate(t, family, token, { requestId })),
    )

    expect(new Set(results.map((r) => r.operationId)).size).toBe(1)
    expect(new Set(results.map((r) => r.accessToken)).size).toBe(1)
    expect(results.filter((r) => !r.reused)).toHaveLength(1)
    expect(await operations()).toHaveLength(1)
    expect(await loadPeople(t, results[0]!.operationId)).toHaveLength(2)
  })

  it('simultâneas com requestIds DIFERENTES para as mesmas pessoas e data: só uma é criada', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        publicCreate(t, family, token, { requestId: newRequestId() }),
      ),
    )

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(5)
    for (const result of rejected) {
      expect(JSON.stringify((result as PromiseRejectedResult).reason)).toContain('duplicate_usage')
    }
    expect(await operations()).toHaveLength(1)
  })

  it('resposta perdida: repetir com a MESMA chave recupera a operação sem duplicar', async () => {
    const requestId = newRequestId()
    // A primeira chamada executou no servidor, mas a resposta nunca chegou ao navegador.
    const lost = await publicCreate(t, family, token, { requestId })
    void lost

    const recovered = await publicCreate(t, family, token, { requestId })
    expect(recovered.reused).toBe(true)
    expect(recovered.accessToken).toBe(lost.accessToken)
    expect(await operations()).toHaveLength(1)
  })

  it('resposta perdida + chave NOVA não recupera nada: é recusada como duplicidade (por isso a chave se reutiliza)', async () => {
    await publicCreate(t, family, token, { requestId: newRequestId() })
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId() }),
      'duplicate_usage',
    )
    expect(await operations()).toHaveLength(1)
  })

  it('após atualizar a página (jornada nova, chave nova): informa duplicidade com os nomes e não cria outra', async () => {
    await publicCreate(t, family, token, { requestId: newRequestId() })

    // F5: a memória se perde, o associado se identifica de novo e refaz a solicitação.
    const newToken = await grantSession(t, family.memberId)
    const data = await errorData(publicCreate(t, family, newToken, { requestId: newRequestId() }))
    expect(data).toMatchObject({ code: 'duplicate_usage' })
    expect(data.names).toEqual(['Ana Teste', 'Bruno Teste'])
    expect(await operations()).toHaveLength(1)
  })

  it('o mesmo requestId com data diferente é recusado, sem criar nem alterar nada', async () => {
    const requestId = newRequestId()
    const first = await publicCreate(t, family, token, { requestId })

    await expectConvexError(
      publicCreate(t, family, token, { requestId, usageDate: '2026-12-11' }),
      'request_id_conflict',
    )
    expect(await operations()).toHaveLength(1)
    expect((await loadOperation(t, first.operationId))?.usageDate).toBe(USAGE_DATE)
  })

  it('o mesmo requestId com pessoas diferentes (outro conjunto, subconjunto ou ampliado) é recusado', async () => {
    const requestId = newRequestId()
    const [bruno, clara] = family.dependentLinkIds
    await publicCreate(t, family, token, {
      requestId,
      linkIds: [family.holderLinkId, bruno],
    })

    for (const linkIds of [[clara], [family.holderLinkId], [family.holderLinkId, bruno, clara]]) {
      await expectConvexError(
        publicCreate(t, family, token, { requestId, linkIds }),
        'request_id_conflict',
      )
    }
    expect(await operations()).toHaveLength(1)
  })

  it('a ordem das pessoas não importa para reconhecer a mesma solicitação', async () => {
    const requestId = newRequestId()
    const [bruno] = family.dependentLinkIds
    const first = await publicCreate(t, family, token, {
      requestId,
      linkIds: [family.holderLinkId, bruno],
    })
    const again = await publicCreate(t, family, token, {
      requestId,
      linkIds: [bruno, family.holderLinkId],
    })
    expect(again).toMatchObject({ reused: true, operationId: first.operationId })
  })

  it('recusa requestId fora do formato, sem criar nada', async () => {
    for (const requestId of ['', 'abc', 'x'.repeat(500), '1234', `${newRequestId()}0`]) {
      await expectConvexError(publicCreate(t, family, token, { requestId }), 'invalid_request_id')
    }
    expect(await operations()).toHaveLength(0)
  })

  it('a repetição não conta no limite de criações por associado', async () => {
    const requestId = newRequestId()
    await publicCreate(t, family, token, { requestId })
    for (let i = 0; i < 25; i += 1) {
      await expect(publicCreate(t, family, token, { requestId })).resolves.toMatchObject({
        reused: true,
      })
    }
  })
})

describe('createOperation com requestId: isolamento e autorização', () => {
  it('outro associado com o MESMO requestId não acessa a operação alheia: cria a sua, com outro token', async () => {
    const requestId = newRequestId()
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const otherToken = await grantSession(t, other.memberId)

    const mine = await publicCreate(t, family, token, { requestId })
    const theirs = await publicCreate(t, other, otherToken, { requestId })

    expect(theirs.reused).toBe(false)
    expect(theirs.operationId).not.toBe(mine.operationId)
    expect(theirs.accessToken).not.toBe(mine.accessToken)
    expect(await operations()).toHaveLength(2)

    // As chaves guardadas são diferentes: o associado faz parte da chave.
    const [a, b] = await Promise.all([
      loadOperation(t, mine.operationId),
      loadOperation(t, theirs.operationId),
    ])
    expect(a?.requestKeyHash).not.toBe(b?.requestKeyHash)

    // Cada token só abre a própria operação.
    await expect(getOperation(mine.operationId, theirs.accessToken)).rejects.toThrow(
      /operation_not_found/,
    )
    await expect(getOperation(theirs.operationId, mine.accessToken)).rejects.toThrow(
      /operation_not_found/,
    )
  })

  it('usar a prova de outro associado para repetir a solicitação é recusado', async () => {
    const requestId = newRequestId()
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    const otherToken = await grantSession(t, other.memberId)
    await publicCreate(t, family, token, { requestId })

    await expectConvexError(
      t.mutation(api.public.payments.createOperation, {
        memberId: family.memberId,
        identificationToken: otherToken,
        usageDate: USAGE_DATE,
        linkIds: [family.holderLinkId],
        requestId,
      }),
      'session_invalid',
    )
    expect(await operations()).toHaveLength(1)
  })

  it('a repetição também exige prova de identificação válida: expirada, não devolve token', async () => {
    const requestId = newRequestId()
    await publicCreate(t, family, token, { requestId })

    vi.setSystemTime(NOW + 31 * 60 * 1000)
    await expectConvexError(publicCreate(t, family, token, { requestId }), 'session_invalid')
    await expectConvexError(
      publicCreate(t, family, 'prova-inventada', { requestId }),
      'session_invalid',
    )
  })

  it('o isolamento vale também para o mesmo conjunto de dados e a mesma pessoa compartilhada', async () => {
    const shared = 'pessoa-compartilhada'
    const a = await seedFamily(t, { membershipNumber: 'T-0003', sharedPersonId: shared })
    const b = await seedFamily(t, { membershipNumber: 'T-0004', sharedPersonId: shared })
    const tokenA = await grantSession(t, a.memberId)
    const tokenB = await grantSession(t, b.memberId)
    const requestId = newRequestId()

    const first = await publicCreate(t, a, tokenA, { requestId, linkIds: [a.dependentLinkIds[1]] })
    // B tenta a mesma pessoa e a mesma chave: não recupera a operação de A; recebe duplicidade.
    await expectConvexError(
      publicCreate(t, b, tokenB, { requestId, linkIds: [b.dependentLinkIds[1]] }),
      'duplicate_usage',
    )
    expect(await operations()).toHaveLength(1)
    expect((await operations())[0]?._id).toBe(first.operationId)
  })
})

describe('createOperation com requestId: revalidação no servidor', () => {
  it('revalida a seleção: vínculo que ficou inativo depois da identificação é recusado', async () => {
    await t.run((ctx) => ctx.db.patch(family.dependentLinkIds[0], { status: 'inactive' }))
    await expectConvexError(
      publicCreate(t, family, token, {
        requestId: newRequestId(),
        linkIds: [family.holderLinkId, family.dependentLinkIds[0]],
      }),
      'link_inactive',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('revalida a seleção: dependente inelegível e titular inativo', async () => {
    await expectConvexError(
      publicCreate(t, family, token, {
        requestId: newRequestId(),
        linkIds: [family.inactiveLinkId],
      }),
      'link_inactive',
    )
    await t.run((ctx) => ctx.db.patch(family.memberId, { status: 'inactive' }))
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId() }),
      'member_inactive',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('revalida a seleção: vazia e vínculo de outra família', async () => {
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId(), linkIds: [] }),
      'empty_selection',
    )
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId(), linkIds: [other.holderLinkId] }),
      'link_not_found',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('revalida a data: passada, inválida e vazia', async () => {
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId(), usageDate: '2026-11-30' }),
      'past_usage_date',
    )
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId(), usageDate: '2026-02-30' }),
      'invalid_usage_date',
    )
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId(), usageDate: '' }),
      'invalid_usage_date',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('revalida a duplicidade: pessoa já reservada na data por outro titular', async () => {
    const shared = 'pessoa-compartilhada'
    const a = await seedFamily(t, { membershipNumber: 'T-0003', sharedPersonId: shared })
    const b = await seedFamily(t, { membershipNumber: 'T-0004', sharedPersonId: shared })
    const tokenA = await grantSession(t, a.memberId)
    const tokenB = await grantSession(t, b.memberId)
    await publicCreate(t, a, tokenA, {
      requestId: newRequestId(),
      linkIds: [a.dependentLinkIds[1]],
    })

    const data = await errorData(
      publicCreate(t, b, tokenB, { requestId: newRequestId(), linkIds: [b.dependentLinkIds[1]] }),
    )
    expect(data).toMatchObject({ code: 'duplicate_usage' })
    expect(await operations()).toHaveLength(1)
  })

  it('uma recusa não consome a chave: depois de corrigir os dados, a mesma chave cria a operação', async () => {
    const requestId = newRequestId()
    await expectConvexError(
      publicCreate(t, family, token, { requestId, usageDate: '2026-11-30' }),
      'past_usage_date',
    )
    expect(await operations()).toHaveLength(0)

    const created = await publicCreate(t, family, token, { requestId })
    expect(created.reused).toBe(false)
    expect(await operations()).toHaveLength(1)
  })

  it('prova de identificação inválida ou ausente não cria nada', async () => {
    await expectConvexError(
      publicCreate(t, family, 'prova-inventada', { requestId: newRequestId() }),
      'session_invalid',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('o navegador não consegue enviar valores nem prazo (argumentos extras recusados)', async () => {
    await expect(
      t.mutation(api.public.payments.createOperation, {
        memberId: family.memberId,
        identificationToken: token,
        usageDate: USAGE_DATE,
        linkIds: [family.holderLinkId],
        requestId: newRequestId(),
        // @ts-expect-error campo que o navegador não pode enviar
        totalAmountCents: 1,
      }),
    ).rejects.toThrow(/Unexpected field/i)
    expect(await operations()).toHaveLength(0)
  })
})

describe('createOperation com requestId: operação recuperada', () => {
  it('expirada: a repetição devolve a original e o estado oficial (getOperation) mostra "expirada"', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })

    vi.setSystemTime(NOW + FIFTEEN_MINUTES + 1000)
    await expireOperation(t, created.operationId)
    // A prova (30 min) continua válida; a repetição recupera a operação expirada.
    const recovered = await publicCreate(t, family, token, { requestId })

    expect(recovered).toMatchObject({ reused: true, operationId: created.operationId })
    expect(recovered.expiresAt).toBe(created.expiresAt)
    const view = await getOperation(recovered.operationId, recovered.accessToken)
    expect(view.operationalStatus).toBe('expired')
    expect(view.presentation.code).toBe('expired')
    // Recuperar não recria reservas nem outra operação.
    expect(await operations()).toHaveLength(1)
    expect((await loadPeople(t, created.operationId)).map((p) => p.claim)).toEqual([
      'released',
      'released',
    ])
  })

  it('expirada e já exibida como expirada mesmo antes da rotina agendada rodar', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })
    vi.setSystemTime(NOW + FIFTEEN_MINUTES + 1000)

    const recovered = await publicCreate(t, family, token, { requestId })
    const view = await getOperation(recovered.operationId, recovered.accessToken)
    expect(view.operationalStatus).toBe('expired')
    expect(recovered.operationId).toBe(created.operationId)
  })

  it('depois de expirada, uma NOVA solicitação (chave nova) pode criar outra operação', async () => {
    const created = await publicCreate(t, family, token, { requestId: newRequestId() })
    vi.setSystemTime(NOW + FIFTEEN_MINUTES + 1000)
    await expireOperation(t, created.operationId)

    const next = await publicCreate(t, family, token, { requestId: newRequestId() })
    expect(next.reused).toBe(false)
    expect(next.operationId).not.toBe(created.operationId)
    expect(next.expiresAt).toBeGreaterThanOrEqual(NOW + 1000 + 2 * FIFTEEN_MINUTES)
    expect(next.expiresAt).toBeLessThan(NOW + 2000 + 2 * FIFTEEN_MINUTES)
  })
})

describe('createOperation com requestId: segredo do token e rotação', () => {
  it('sem OPERATION_TOKEN_SECRET falha fechada: nada é criado', async () => {
    vi.stubEnv('OPERATION_TOKEN_SECRET', '')
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId() }),
      'service_unavailable',
    )
    expect(await operations()).toHaveLength(0)
  })

  it('segredo curto demais também falha fechada', async () => {
    vi.stubEnv('OPERATION_TOKEN_SECRET', 'curto')
    await expectConvexError(
      publicCreate(t, family, token, { requestId: newRequestId() }),
      'service_unavailable',
    )
  })

  it('sem requestId a criação não depende do segredo', async () => {
    vi.stubEnv('OPERATION_TOKEN_SECRET', '')
    await expect(publicCreate(t, family, token)).resolves.toMatchObject({ reused: false })
  })

  it('rotação com o segredo anterior configurado: a repetição devolve o mesmo token', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })

    vi.stubEnv('OPERATION_TOKEN_SECRET_PREVIOUS', TEST_TOKEN_SECRET)
    vi.stubEnv('OPERATION_TOKEN_SECRET', 'segredo-novo-depois-da-rotacao-com-32-chars!!')
    const recovered = await publicCreate(t, family, token, { requestId })

    expect(recovered).toMatchObject({ reused: true, operationId: created.operationId })
    expect(recovered.accessToken).toBe(created.accessToken)
  })

  it('rotação SEM o segredo anterior: não devolve token errado (operation_not_recoverable)', async () => {
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })

    vi.stubEnv('OPERATION_TOKEN_SECRET', 'segredo-novo-depois-da-rotacao-com-32-chars!!')
    await expectConvexError(
      publicCreate(t, family, token, { requestId }),
      'operation_not_recoverable',
    )
    // O token já entregue segue válido: o banco guarda o hash dele.
    await expect(getOperation(created.operationId, created.accessToken)).resolves.toMatchObject({
      operationId: created.operationId,
    })
    expect(await operations()).toHaveLength(1)
  })

  it('operações novas depois da rotação usam o segredo novo', async () => {
    vi.stubEnv('OPERATION_TOKEN_SECRET', 'segredo-novo-depois-da-rotacao-com-32-chars!!')
    const requestId = newRequestId()
    const created = await publicCreate(t, family, token, { requestId })

    vi.stubEnv('OPERATION_TOKEN_SECRET_PREVIOUS', TEST_TOKEN_SECRET)
    const again = await publicCreate(t, family, token, { requestId })
    expect(again.accessToken).toBe(created.accessToken)
  })
})
