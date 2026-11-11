import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import {
  resolveSelection,
  type ResolvedPerson,
  type SelectionErrorCode,
  type SelectionLink,
} from '../domain/selection'

/** Limite defensivo de leitura; um titular não tem centenas de vínculos. */
export const MAX_LINKS = 200

export type LinkId = Id<'householdLinks'>

/** Vínculos do titular, com os dados da pessoa, no formato da seleção. */
export async function loadSelectionLinks(
  ctx: Pick<QueryCtx, 'db'>,
  memberId: Id<'members'>,
): Promise<SelectionLink<LinkId>[]> {
  const linkDocs = await ctx.db
    .query('householdLinks')
    .withIndex('by_member_and_external_link', (q) => q.eq('memberId', memberId))
    .take(MAX_LINKS)

  const links: SelectionLink<LinkId>[] = []
  for (const link of linkDocs) {
    const person = await ctx.db.get(link.personRef)
    if (!person) continue // vínculo sem pessoa não é selecionável
    links.push({
      id: link._id,
      personId: person.personId,
      name: person.name,
      role: link.role,
      status: link.status,
    })
  }
  return links
}

export type MemberSelection =
  | {
      readonly ok: true
      readonly member: Doc<'members'>
      readonly people: readonly ResolvedPerson<LinkId>[]
    }
  | {
      readonly ok: false
      readonly code: SelectionErrorCode | 'member_not_found' | 'invalid_selection'
    }

/**
 * ÚNICO ponto que valida uma seleção de pessoas contra o cadastro: usado pela validação pública,
 * pela consulta de duplicidade e pela criação da operação. O navegador só informa vínculos;
 * titularidade, situação cadastral e pertencimento ao grupo são lidos do banco.
 */
export async function resolveMemberSelection(
  ctx: Pick<QueryCtx, 'db'>,
  memberId: Id<'members'>,
  linkIds: readonly LinkId[],
): Promise<MemberSelection> {
  const member = await ctx.db.get(memberId)
  if (!member) return { ok: false, code: 'member_not_found' }
  // Uma seleção nunca pode ter mais itens do que o titular tem vínculos.
  if (linkIds.length > MAX_LINKS) return { ok: false, code: 'invalid_selection' }

  const links = await loadSelectionLinks(ctx, member._id)
  const selection = resolveSelection({ memberStatus: member.status, links, linkIds })
  if (!selection.ok) return { ok: false, code: selection.code }
  return { ok: true, member, people: selection.people }
}
