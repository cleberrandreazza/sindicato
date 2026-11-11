import { describe, expect, it } from 'vitest'
import { resolveSelection, type SelectionLink } from '../../convex/domain/selection'
import type { MemberStatus } from '../../convex/domain/statuses'

// Ids de vínculo (`l*`) são distintos dos ids de pessoa (`p-*`) de propósito.
const links: SelectionLink<string>[] = [
  { id: 'l0', personId: 'p-ana', name: 'Ana Teste', role: 'holder', status: 'active' },
  { id: 'l1', personId: 'p-bruno', name: 'Bruno Teste', role: 'spouse', status: 'active' },
  { id: 'l2', personId: 'p-clara', name: 'Clara Teste', role: 'child', status: 'active' },
  { id: 'l3', personId: 'p-helena', name: 'Helena Teste', role: 'child', status: 'inactive' },
]

function select(
  linkIds: string[],
  overrides: { memberStatus?: MemberStatus; links?: SelectionLink<string>[] } = {},
) {
  return resolveSelection({
    memberStatus: overrides.memberStatus ?? 'active',
    links: overrides.links ?? links,
    linkIds,
  })
}

describe('seleção individual de titular e dependentes', () => {
  it('permite selecionar apenas o titular', () => {
    expect(select(['l0'])).toEqual({
      ok: true,
      people: [{ linkId: 'l0', personId: 'p-ana', name: 'Ana Teste', role: 'holder' }],
    })
  })

  it('não exige o titular: permite selecionar só dependentes', () => {
    const result = select(['l1', 'l2'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.people.map((person) => person.personId)).toEqual(['p-bruno', 'p-clara'])
    }
  })

  it('permite combinar titular e dependentes, cada um individualmente', () => {
    const result = select(['l0', 'l2'])
    expect(result.ok && result.people.map((person) => person.name)).toEqual([
      'Ana Teste',
      'Clara Teste',
    ])
  })

  it('usa nomes e papéis do cadastro, nunca informados pelo navegador', () => {
    const result = select(['l1'])
    expect(result.ok && result.people[0]).toMatchObject({ name: 'Bruno Teste', role: 'spouse' })
  })

  it('rejeita seleção vazia', () => {
    expect(select([])).toEqual({ ok: false, code: 'empty_selection' })
  })

  it('rejeita o mesmo vínculo duas vezes', () => {
    expect(select(['l0', 'l0'])).toEqual({ ok: false, code: 'duplicate_person' })
    expect(select(['l1', 'l1'])).toEqual({ ok: false, code: 'duplicate_person' })
  })

  it('rejeita a mesma PESSOA por dois vínculos diferentes (identidade é o personId)', () => {
    const twoLinksSamePerson: SelectionLink<string>[] = [
      ...links,
      { id: 'l9', personId: 'p-clara', name: 'Clara Teste', role: 'other', status: 'active' },
    ]
    expect(select(['l2', 'l9'], { links: twoLinksSamePerson })).toEqual({
      ok: false,
      code: 'duplicate_person',
    })
  })

  it('rejeita vínculo que não pertence ao titular (convidado ou de outro titular)', () => {
    expect(select(['outro-titular'])).toEqual({ ok: false, code: 'link_not_found' })
  })

  it('não confunde id de pessoa com id de vínculo', () => {
    // O navegador só conhece vínculos; um personId nunca é aceito como referência.
    expect(select(['p-bruno'])).toEqual({ ok: false, code: 'link_not_found' })
  })

  it('rejeita vínculo inativo', () => {
    expect(select(['l3'])).toEqual({ ok: false, code: 'link_inactive' })
  })

  it('rejeita toda a operação se o titular estiver inativo, mesmo só com dependentes', () => {
    expect(select(['l1'], { memberStatus: 'inactive' })).toEqual({
      ok: false,
      code: 'member_inactive',
    })
  })
})
