import type { HouseholdRole, LinkStatus, MemberStatus } from './statuses'

/**
 * Seleção individual de pessoas. Função pura: recebe os dados já carregados do banco, de modo
 * que o navegador só informa *qual vínculo* foi escolhido, nunca nomes, papéis ou valores.
 *
 * Todas as pessoas da família do titular (inclusive o próprio titular, com papel `holder`) são
 * vínculos. O titular não é obrigatório e convidados não existem: só há vínculos cadastrados.
 *
 * Duplicidade DENTRO de uma seleção é detectada por `personId` (a pessoa), não pelo id do
 * vínculo: assim a mesma pessoa não pode ser cobrada duas vezes mesmo que apareça em dois
 * vínculos.
 */

export interface SelectionLink<TLinkId extends string> {
  readonly id: TLinkId
  /** Identificador estável da pessoa (ver `people.personId`). */
  readonly personId: string
  readonly name: string
  readonly role: HouseholdRole
  readonly status: LinkStatus
}

export interface ResolvedPerson<TLinkId extends string> {
  readonly linkId: TLinkId
  readonly personId: string
  readonly name: string
  readonly role: HouseholdRole
}

export type SelectionErrorCode =
  'empty_selection' | 'duplicate_person' | 'member_inactive' | 'link_not_found' | 'link_inactive'

export type SelectionResult<TLinkId extends string> =
  | { readonly ok: true; readonly people: readonly ResolvedPerson<TLinkId>[] }
  | { readonly ok: false; readonly code: SelectionErrorCode }

export function resolveSelection<TLinkId extends string>(input: {
  memberStatus: MemberStatus
  /** Somente vínculos do titular da operação. */
  links: readonly SelectionLink<TLinkId>[]
  linkIds: readonly TLinkId[]
}): SelectionResult<TLinkId> {
  const { memberStatus, links, linkIds } = input

  // A situação cadastral do titular vale para toda a operação, inclusive só com dependentes.
  if (memberStatus !== 'active') return { ok: false, code: 'member_inactive' }
  if (linkIds.length === 0) return { ok: false, code: 'empty_selection' }

  const people: ResolvedPerson<TLinkId>[] = []
  const seenPeople = new Set<string>()

  for (const linkId of linkIds) {
    const link = links.find((candidate) => candidate.id === linkId)
    if (!link) return { ok: false, code: 'link_not_found' }
    if (link.status !== 'active') return { ok: false, code: 'link_inactive' }

    if (seenPeople.has(link.personId)) return { ok: false, code: 'duplicate_person' }
    seenPeople.add(link.personId)

    people.push({ linkId: link.id, personId: link.personId, name: link.name, role: link.role })
  }

  return { ok: true, people }
}
