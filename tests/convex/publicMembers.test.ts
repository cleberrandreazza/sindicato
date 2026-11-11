// @vitest-environment edge-runtime
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'
import {
  MOCK,
  NOW,
  createBackend,
  expectConvexError,
  grantSession,
  identify,
  lookup,
  seedFamily,
  stubPublicApiEnv,
  type Backend,
} from './helpers'

let t: Backend

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  stubPublicApiEnv()
  t = createBackend()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function errorData(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError) return error.data
    throw error
  }
  throw new Error('Esperava um ConvexError.')
}

describe('public/members:lookup (consulta cadastral)', () => {
  it('identifica um associado ativo e devolve titular, situação e dependentes', async () => {
    const result = await lookup(t, MOCK.ana)

    expect(result.member).toMatchObject({
      membershipNumber: '100001',
      status: 'active',
      cpfMasked: '***.***.***-08',
    })
    expect(result.holder).toMatchObject({
      name: 'Ana Teste Almeida',
      role: 'holder',
      status: 'active',
      selectable: true,
    })
    expect(
      result.dependents.map((person) => [person.name, person.role, person.selectable]),
    ).toEqual([
      ['Bruno Teste Almeida', 'spouse', true],
      ['Clara Teste Almeida', 'child', true],
    ])
    expect(result.session?.token).toMatch(/^[0-9a-f]{64}$/)
    // Validade de 30 minutos (o relógio simulado avança poucos ms por operação).
    const expiresAt = result.session?.expiresAt ?? 0
    expect(expiresAt).toBeGreaterThanOrEqual(NOW + 30 * 60 * 1000)
    expect(expiresAt).toBeLessThan(NOW + 30 * 60 * 1000 + 1000)
    expect(result.message).toBeUndefined()
  })

  it('mostra a situação individual de cada dependente (inativo não é selecionável)', async () => {
    const result = await lookup(t, MOCK.daniela)

    expect(result.dependents).toHaveLength(5)
    const helena = result.dependents.find((person) => person.name.startsWith('Helena'))
    expect(helena).toMatchObject({ status: 'inactive', selectable: false })
    expect(result.dependents.filter((person) => person.selectable)).toHaveLength(4)
  })

  it('titular sem dependentes retorna lista vazia', async () => {
    const result = await lookup(t, MOCK.carlos)
    expect(result.dependents).toEqual([])
    expect(result.holder.selectable).toBe(true)
  })

  it('NÃO expõe CPF completo, contato, nem identificadores internos', async () => {
    const serialized = JSON.stringify(await lookup(t, MOCK.ana))

    for (const forbidden of [
      '10000000108', // CPF sem pontuação
      '100.000.001-08', // CPF com pontuação
      'ana.teste@example.com', // e-mail
      '+5511900000001', // telefone
      'mock-person-', // personId
      'mock-link-', // id de vínculo na origem
      'cpfHash',
      'personId',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('persiste o CPF apenas como hash e máscara', async () => {
    const { member } = await lookup(t, MOCK.ana)
    const stored = await t.run((ctx) => ctx.db.get(member.id))
    expect(stored?.cpfHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.cpfMasked).toBe('***.***.***-08')
    expect(JSON.stringify(stored)).not.toContain('10000000108')
  })

  it('consultar de novo reaproveita o titular e as pessoas (sem duplicar cadastro)', async () => {
    const first = await lookup(t, MOCK.ana)
    const second = await lookup(t, MOCK.ana)
    expect(second.member.id).toBe(first.member.id)
    expect(second.holder.linkId).toBe(first.holder.linkId)
    expect(await t.run(async (ctx) => (await ctx.db.query('members').collect()).length)).toBe(1)
  })

  it('titular INATIVO: informa a situação, sem prova de identificação e sem nada selecionável', async () => {
    const result = await lookup(t, MOCK.igor)

    expect(result.member.status).toBe('inactive')
    expect(result.session).toBeNull()
    expect(result.message).toMatch(/não está ativo/)
    expect([result.holder, ...result.dependents].every((person) => !person.selectable)).toBe(true)
  })

  it('associado inexistente e CPF incompatível recebem EXATAMENTE a mesma resposta', async () => {
    // Carteirinha que não existe, com CPF válido.
    const unknownCard = await errorData(
      lookup(t, { membershipNumber: '777777', cpf: MOCK.ana.cpf }),
    )
    // Carteirinha existente, com o CPF (válido) de outra pessoa.
    const wrongCpf = await errorData(
      lookup(t, { membershipNumber: MOCK.ana.membershipNumber, cpf: MOCK.carlos.cpf }),
    )

    expect(unknownCard).toMatchObject({ code: 'identification_failed' })
    expect(wrongCpf).toEqual(unknownCard)
  })

  it('a mensagem de falha não menciona carteirinha inexistente nem CPF específico', async () => {
    const data = await errorData(lookup(t, { membershipNumber: '777777', cpf: MOCK.ana.cpf }))
    const message = (data as { message: string }).message.toLowerCase()
    expect(message).not.toMatch(/não existe|inexistente|não encontrad|cpf incorreto|cpf não/)
  })

  it('recusa CPF com dígitos inválidos antes de consultar o cadastro', async () => {
    await expectConvexError(
      lookup(t, { membershipNumber: MOCK.ana.membershipNumber, cpf: '10000000109' }),
      'invalid_cpf',
    )
    await expectConvexError(
      lookup(t, { membershipNumber: MOCK.ana.membershipNumber, cpf: '111.111.111-11' }),
      'invalid_cpf',
    )
    await expectConvexError(
      lookup(t, { membershipNumber: MOCK.ana.membershipNumber, cpf: '' }),
      'invalid_cpf',
    )
  })

  it('recusa número de carteirinha em formato inválido', async () => {
    for (const membershipNumber of [
      '',
      '   ',
      '10 0001',
      '100001; drop',
      'a'.repeat(21),
      'x'.repeat(500),
    ]) {
      await expectConvexError(
        lookup(t, { membershipNumber, cpf: MOCK.ana.cpf }),
        'invalid_membership_number',
      )
    }
  })

  it('aceita CPF com pontuação e carteirinha com espaços nas pontas', async () => {
    const result = await lookup(t, { membershipNumber: ' 100001 ', cpf: '100.000.001-08' })
    expect(result.member.membershipNumber).toBe('100001')
  })

  it('falha de configuração vira erro genérico, sem vazar detalhes', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('APP_ENV', '') // mocks recusados fora de desenvolvimento
    const data = await errorData(lookup(t, MOCK.ana))
    expect(data).toMatchObject({ code: 'service_unavailable' })
    expect(JSON.stringify(data)).not.toMatch(/MEMBER_PROVIDER|APP_ENV|mock/)
  })

  it('sem CPF_HASH_SECRET não há consulta (e o erro é genérico)', async () => {
    vi.stubEnv('CPF_HASH_SECRET', '')
    await expectConvexError(lookup(t, MOCK.ana), 'service_unavailable')
    expect(await t.run(async (ctx) => (await ctx.db.query('members').collect()).length)).toBe(0)
  })
})

describe('proteção contra chamadas abusivas na consulta cadastral', () => {
  const wrong = { membershipNumber: MOCK.ana.membershipNumber, cpf: MOCK.carlos.cpf }

  it('bloqueia a carteirinha após 5 falhas, mesmo com o CPF correto', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectConvexError(lookup(t, wrong), 'identification_failed')
    }
    const blocked = await errorData(lookup(t, MOCK.ana))
    expect(blocked).toMatchObject({ code: 'too_many_attempts' })
    expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0)
  })

  it('o bloqueio é por carteirinha: outras carteirinhas continuam funcionando', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await errorData(lookup(t, wrong))
    expect((await lookup(t, MOCK.carlos)).member.membershipNumber).toBe('100002')
  })

  it('o bloqueio termina depois de 15 minutos', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await errorData(lookup(t, wrong))
    await expectConvexError(lookup(t, MOCK.ana), 'too_many_attempts')

    vi.setSystemTime(NOW + 15 * 60 * 1000 + 1000)
    expect((await lookup(t, MOCK.ana)).member.status).toBe('active')
  })

  it('uma identificação bem-sucedida zera as falhas anteriores', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await errorData(lookup(t, wrong))
    await lookup(t, MOCK.ana)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expectConvexError(lookup(t, wrong), 'identification_failed')
    }
  })

  it('formato inválido não conta como tentativa contra a carteirinha', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expectConvexError(
        lookup(t, { membershipNumber: MOCK.ana.membershipNumber, cpf: '123' }),
        'invalid_cpf',
      )
    }
    expect((await lookup(t, MOCK.ana)).member.status).toBe('active')
  })

  it('limita o volume global de consultas por minuto (varredura em massa)', async () => {
    for (let index = 0; index < 120; index += 1) {
      await errorData(lookup(t, { membershipNumber: `9${index}`, cpf: MOCK.ana.cpf }))
    }
    await expectConvexError(lookup(t, MOCK.ana), 'too_many_attempts')

    vi.setSystemTime(NOW + 61_000)
    expect((await lookup(t, MOCK.ana)).member.status).toBe('active')
  })

  it('contadores e provas expiradas são removidos pelas funções agendadas', async () => {
    await errorData(lookup(t, wrong))
    await lookup(t, MOCK.carlos)
    expect(
      await t.run(async (ctx) => (await ctx.db.query('rateLimits').collect()).length),
    ).toBeGreaterThan(0)
    expect(
      await t.run(async (ctx) => (await ctx.db.query('identificationSessions').collect()).length),
    ).toBe(1)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await t.run(async (ctx) => (await ctx.db.query('rateLimits').collect()).length)).toBe(0)
    expect(
      await t.run(async (ctx) => (await ctx.db.query('identificationSessions').collect()).length),
    ).toBe(0)
  })
})

describe('public/members:validateSelection (validação das pessoas)', () => {
  it('aceita titular e dependentes vinculados e ativos, devolvendo nomes do cadastro', async () => {
    const ana = await identify(t, MOCK.ana)
    const result = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: [ana.holder.linkId, ...ana.dependents.map((person) => person.linkId)],
    })

    expect(result).toMatchObject({ ok: true, quantity: 3 })
    expect(result.ok && result.people.map((person) => person.name)).toEqual([
      'Ana Teste Almeida',
      'Bruno Teste Almeida',
      'Clara Teste Almeida',
    ])
  })

  it('o titular é opcional: só dependentes também é válido', async () => {
    const ana = await identify(t, MOCK.ana)
    const [bruno] = ana.dependents
    const result = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: bruno ? [bruno.linkId] : [],
    })
    expect(result).toMatchObject({ ok: true, quantity: 1 })
  })

  it('recusa seleção sem pessoas', async () => {
    const ana = await identify(t, MOCK.ana)
    const result = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: [],
    })
    expect(result).toMatchObject({ ok: false, code: 'empty_selection' })
  })

  it('recusa dependente inativo', async () => {
    const daniela = await identify(t, MOCK.daniela)
    const helena = daniela.dependents.find((person) => person.name.startsWith('Helena'))
    const result = await t.query(api.public.members.validateSelection, {
      memberId: daniela.member.id,
      identificationToken: daniela.token,
      linkIds: helena ? [helena.linkId] : [],
    })
    expect(result).toMatchObject({ ok: false, code: 'link_inactive' })
  })

  it('recusa pessoa não vinculada ao titular, inclusive a MESMA pessoa por outro titular', async () => {
    const ana = await identify(t, MOCK.ana)
    const daniela = await identify(t, MOCK.daniela)
    // Clara é dependente de Ana E de Daniela (mesmo personId, vínculos diferentes).
    const claraOfDaniela = daniela.dependents.find((person) => person.name.startsWith('Clara'))
    const carlos = await identify(t, MOCK.carlos)

    const viaOtherFamily = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: claraOfDaniela ? [claraOfDaniela.linkId] : [],
    })
    expect(viaOtherFamily).toMatchObject({ ok: false, code: 'link_not_found' })

    const viaStranger = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: [carlos.holder.linkId],
    })
    expect(viaStranger).toMatchObject({ ok: false, code: 'link_not_found' })
  })

  it('recusa a mesma pessoa informada duas vezes', async () => {
    const ana = await identify(t, MOCK.ana)
    const result = await t.query(api.public.members.validateSelection, {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: [ana.holder.linkId, ana.holder.linkId],
    })
    expect(result).toMatchObject({ ok: false, code: 'duplicate_person' })
  })

  it('recusa identificadores que não são vínculos (convidados não existem)', async () => {
    const ana = await identify(t, MOCK.ana)
    // Um id de outra tabela é rejeitado já na validação de argumentos.
    await expect(
      t.query(api.public.members.validateSelection, {
        memberId: ana.member.id,
        identificationToken: ana.token,
        // @ts-expect-error id de titular no lugar de id de vínculo
        linkIds: [ana.member.id],
      }),
    ).rejects.toThrow()
    // Texto livre (como um nome de convidado) também.
    await expect(
      t.query(api.public.members.validateSelection, {
        memberId: ana.member.id,
        identificationToken: ana.token,
        // @ts-expect-error nome no lugar de id
        linkIds: ['Convidado Fulano'],
      }),
    ).rejects.toThrow()
  })

  it('recusa titular inativo mesmo com prova de identificação (não confia no cadastro do navegador)', async () => {
    const family = await seedFamily(t, { status: 'inactive' })
    const token = await grantSession(t, family.memberId)
    const result = await t.query(api.public.members.validateSelection, {
      memberId: family.memberId,
      identificationToken: token,
      linkIds: [family.holderLinkId],
    })
    expect(result).toMatchObject({ ok: false, code: 'member_inactive' })
  })

  it('exige prova de identificação válida: todas as falhas têm a mesma resposta', async () => {
    const ana = await identify(t, MOCK.ana)
    const carlos = await identify(t, MOCK.carlos)
    const base = { linkIds: [ana.holder.linkId] }

    const attempts = [
      { memberId: ana.member.id, identificationToken: 'token-qualquer' }, // token inventado
      { memberId: ana.member.id, identificationToken: '' }, // vazio
      { memberId: ana.member.id, identificationToken: carlos.token }, // token de OUTRO titular
      { memberId: carlos.member.id, identificationToken: ana.token }, // id de outro titular
      { memberId: ana.member.id, identificationToken: 'x'.repeat(5000) }, // absurdo
    ]
    const results = []
    for (const attempt of attempts) {
      results.push(
        await errorData(t.query(api.public.members.validateSelection, { ...attempt, ...base })),
      )
    }
    for (const data of results) expect(data).toMatchObject({ code: 'session_invalid' })
    expect(new Set(results.map((data) => JSON.stringify(data))).size).toBe(1)
  })

  it('a prova de identificação expira em 30 minutos', async () => {
    const ana = await identify(t, MOCK.ana)
    const args = {
      memberId: ana.member.id,
      identificationToken: ana.token,
      linkIds: [ana.holder.linkId],
    }
    vi.setSystemTime(NOW + 29 * 60 * 1000)
    expect((await t.query(api.public.members.validateSelection, args)).ok).toBe(true)

    vi.setSystemTime(NOW + 30 * 60 * 1000 + 1000)
    await expectConvexError(t.query(api.public.members.validateSelection, args), 'session_invalid')
  })
})
