// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { MOCK_MEMBERS } from '../../convex/providers/mock/mockMembers'
import type { ProviderMember } from '../../convex/providers/memberProvider'
import { createBackend, expectConvexError, type Backend } from './helpers'

let t: Backend

beforeEach(() => {
  t = createBackend()
})

function sync(backend: Backend, member: ProviderMember) {
  return backend.mutation(internal.members.sync.upsertFromProvider, {
    membershipNumber: member.membershipNumber,
    cpfHash: `hash-${member.membershipNumber}`,
    cpfMasked: '***.***.***-00',
    status: member.status,
    phone: member.phone,
    email: member.email,
    holder: member.holder,
    dependents: member.dependents.map((dependent) => ({ ...dependent })),
  })
}

function mockMember(membershipNumber: string): ProviderMember {
  const found = MOCK_MEMBERS.find((fixture) => fixture.member.membershipNumber === membershipNumber)
  if (!found) throw new Error(`mock ${membershipNumber} inexistente`)
  return found.member
}

const countPeople = (backend: Backend) =>
  backend.run(async (ctx) => (await ctx.db.query('people').collect()).length)
const loadLinks = (backend: Backend) =>
  backend.run((ctx) => ctx.db.query('householdLinks').collect())

describe('dados fictícios do provedor mock', () => {
  const everyPerson = MOCK_MEMBERS.flatMap(({ member }) => [
    member.holder,
    ...member.dependents.map((dependent) => dependent.person),
  ])

  it('todas as pessoas têm personId estável, preenchido e no formato esperado', () => {
    for (const person of everyPerson) expect(person.personId).toMatch(/^mock-person-\d{4}$/)
  })

  it('o mesmo personId nunca é usado por pessoas com nomes diferentes', () => {
    const namesById = new Map<string, Set<string>>()
    for (const person of everyPerson) {
      namesById.set(person.personId, (namesById.get(person.personId) ?? new Set()).add(person.name))
    }
    for (const names of namesById.values()) expect(names.size).toBe(1)
  })

  it('o id do vínculo é distinto do personId', () => {
    const personIds = new Set(everyPerson.map((person) => person.personId))
    for (const { member } of MOCK_MEMBERS) {
      for (const dependent of member.dependents) expect(personIds.has(dependent.linkId)).toBe(false)
    }
  })

  it('uma pessoa (Clara) é dependente de dois titulares, com o mesmo personId e vínculos diferentes', () => {
    const appearances = MOCK_MEMBERS.flatMap(({ member }) =>
      member.dependents.filter((dependent) => dependent.person.name.startsWith('Clara')),
    )
    expect(appearances).toHaveLength(2)
    expect(new Set(appearances.map((item) => item.person.personId)).size).toBe(1)
    expect(new Set(appearances.map((item) => item.linkId)).size).toBe(2)
  })
})

describe('identidade da pessoa, vínculo e papel', () => {
  it('o titular também é uma pessoa, com vínculo de papel "holder"', async () => {
    const { memberId, links } = await sync(t, mockMember('100002'))

    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ role: 'holder', personId: 'mock-person-0004' })
    const stored = await loadLinks(t)
    expect(stored.map((link) => link.memberId)).toEqual([memberId])
  })

  it('sincronizar de novo mantém personId e ids de vínculo (nada é duplicado)', async () => {
    const first = await sync(t, mockMember('100001'))
    const second = await sync(t, mockMember('100001'))

    expect(second.memberId).toBe(first.memberId)
    expect(second.links.map((link) => link.linkId)).toEqual(first.links.map((link) => link.linkId))
    expect(second.links.map((link) => link.personId)).toEqual(
      first.links.map((link) => link.personId),
    )
    expect(await countPeople(t)).toBe(3)
    expect(await loadLinks(t)).toHaveLength(3)
  })

  it('a mesma pessoa em duas famílias é UMA pessoa e DOIS vínculos', async () => {
    const ana = await sync(t, mockMember('100001'))
    const daniela = await sync(t, mockMember('100003'))

    const claraInAna = ana.links.find((link) => link.name.startsWith('Clara'))
    const claraInDaniela = daniela.links.find((link) => link.name.startsWith('Clara'))
    expect(claraInAna?.personId).toBe(claraInDaniela?.personId)
    expect(claraInAna?.linkId).not.toBe(claraInDaniela?.linkId)
    // Ana, Bruno, Clara + Daniela, Eduardo, Fernanda, Gabriel, Helena (Clara não repete).
    expect(await countPeople(t)).toBe(8)
    expect(await loadLinks(t)).toHaveLength(3 + 6)
  })

  it('mudar o nome ou o papel não muda a identidade', async () => {
    const original = mockMember('100001')
    const first = await sync(t, original)
    const renamed: ProviderMember = {
      ...original,
      holder: { ...original.holder, name: 'Ana Teste Souza' },
      dependents: original.dependents.map((dependent) => ({
        ...dependent,
        role: 'other' as const,
      })),
    }
    const second = await sync(t, renamed)

    expect(second.links.map((link) => link.personId)).toEqual(
      first.links.map((link) => link.personId),
    )
    expect(second.links[0]?.name).toBe('Ana Teste Souza')
    expect(second.links.slice(1).map((link) => link.role)).toEqual(['other', 'other'])
  })

  it('vínculo que sumiu do cadastro fica inativo, sem ser apagado', async () => {
    const original = mockMember('100001')
    await sync(t, original)
    const [kept] = original.dependents
    if (!kept) throw new Error('fixture inválida')
    const { links } = await sync(t, { ...original, dependents: [kept] })

    expect(links).toHaveLength(2)
    const stored = await loadLinks(t)
    expect(stored).toHaveLength(3)
    expect(stored.filter((link) => link.status === 'inactive')).toHaveLength(1)
    expect(await countPeople(t)).toBe(3)
  })

  it('recusa personId vazio: sem identificador confiável não há prevenção global de duplicidade', async () => {
    const original = mockMember('100001')
    await expectConvexError(
      sync(t, { ...original, holder: { ...original.holder, personId: '  ' } }),
      'invalid_person_id',
    )
    expect(await countPeople(t)).toBe(0)
  })

  it('recusa vínculos repetidos ou usando o id reservado do titular', async () => {
    const original = mockMember('100001')
    const [first] = original.dependents
    if (!first) throw new Error('fixture inválida')
    await expectConvexError(
      sync(t, { ...original, dependents: [first, { ...first }] }),
      'invalid_link_id',
    )
    await expectConvexError(
      sync(t, { ...original, dependents: [{ ...first, linkId: 'holder' }] }),
      'invalid_link_id',
    )
  })

  it('não guarda o CPF completo nem o nome do titular na tabela de titulares', async () => {
    const { memberId } = await sync(t, mockMember('100001'))
    const member = await t.run((ctx) => ctx.db.get(memberId))
    expect(member).not.toBeNull()
    expect(Object.keys(member ?? {})).not.toContain('name')
    expect(JSON.stringify(member)).not.toContain('10000000108')
  })
})
