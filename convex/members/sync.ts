import { ConvexError, v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../_generated/server'
import { dependentRole, linkStatus, memberStatus } from '../domain/statuses'

/** Id de vínculo reservado para o próprio titular. Provedores não podem usá-lo. */
const HOLDER_LINK_ID = 'holder'
/** Limite defensivo de leitura; uma família não tem centenas de vínculos. */
const MAX_LINKS = 200

const personArg = v.object({ personId: v.string(), name: v.string() })

async function upsertPerson(
  ctx: MutationCtx,
  person: { personId: string; name: string },
  now: number,
): Promise<Id<'people'>> {
  const existing = await ctx.db
    .query('people')
    .withIndex('by_person_id', (q) => q.eq('personId', person.personId))
    .unique()
  if (existing) {
    await ctx.db.patch(existing._id, { name: person.name, updatedAt: now })
    return existing._id
  }
  return await ctx.db.insert('people', {
    personId: person.personId,
    name: person.name,
    updatedAt: now,
  })
}

/**
 * Sincroniza no banco o resultado de `MemberProvider.lookupMember` (já autenticado pela action
 * de identificação, que também calcula `cpfHash`/`cpfMasked`).
 *
 * - PESSOA: uma linha por `personId`, compartilhada por todos os titulares que a incluem.
 * - VÍNCULO: uma linha por (titular, vínculo de origem), com papel e situação próprios.
 * - Vínculos que deixaram de existir no cadastro são marcados `inactive` (nada é apagado).
 *
 * É `internal`: o navegador nunca fornece esses dados.
 */
export const upsertFromProvider = internalMutation({
  args: {
    membershipNumber: v.string(),
    cpfHash: v.string(),
    cpfMasked: v.string(),
    status: memberStatus,
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    holder: personArg,
    dependents: v.array(
      v.object({
        linkId: v.string(),
        person: personArg,
        role: dependentRole,
        status: linkStatus,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    const people = [args.holder, ...args.dependents.map((dependent) => dependent.person)]
    if (people.some((person) => person.personId.trim() === '')) {
      throw new ConvexError({ code: 'invalid_person_id' })
    }
    const externalIds = args.dependents.map((dependent) => dependent.linkId)
    if (externalIds.includes(HOLDER_LINK_ID) || new Set(externalIds).size !== externalIds.length) {
      throw new ConvexError({ code: 'invalid_link_id' })
    }

    const memberFields = {
      cpfHash: args.cpfHash,
      cpfMasked: args.cpfMasked,
      status: args.status,
      phone: args.phone,
      email: args.email,
      updatedAt: now,
    }
    const existingMember = await ctx.db
      .query('members')
      .withIndex('by_membership_number', (q) => q.eq('membershipNumber', args.membershipNumber))
      .unique()
    let memberId: Id<'members'>
    if (existingMember) {
      memberId = existingMember._id
      await ctx.db.patch(memberId, memberFields)
    } else {
      memberId = await ctx.db.insert('members', {
        membershipNumber: args.membershipNumber,
        ...memberFields,
      })
    }

    const existingLinks = await ctx.db
      .query('householdLinks')
      .withIndex('by_member_and_external_link', (q) => q.eq('memberId', memberId))
      .take(MAX_LINKS)
    const byExternalId = new Map(existingLinks.map((link) => [link.externalLinkId, link]))

    const desired = [
      {
        externalLinkId: HOLDER_LINK_ID,
        person: args.holder,
        role: 'holder' as const,
        status: 'active' as const,
      },
      ...args.dependents.map((dependent) => ({
        externalLinkId: dependent.linkId,
        person: dependent.person,
        role: dependent.role,
        status: dependent.status,
      })),
    ]

    const links = []
    for (const item of desired) {
      const personRef = await upsertPerson(ctx, item.person, now)
      const fields = { personRef, role: item.role, status: item.status, updatedAt: now }
      const existing = byExternalId.get(item.externalLinkId)
      let linkId: Id<'householdLinks'>
      if (existing) {
        linkId = existing._id
        await ctx.db.patch(linkId, fields)
      } else {
        linkId = await ctx.db.insert('householdLinks', {
          memberId,
          externalLinkId: item.externalLinkId,
          ...fields,
        })
      }
      byExternalId.delete(item.externalLinkId)
      links.push({
        linkId,
        externalLinkId: item.externalLinkId,
        personId: item.person.personId,
        name: item.person.name,
        role: item.role,
        status: item.status,
      })
    }

    // Vínculos ausentes do cadastro atual deixam de ser selecionáveis.
    for (const stale of byExternalId.values()) {
      if (stale.status === 'active') {
        await ctx.db.patch(stale._id, { status: 'inactive', updatedAt: now })
      }
    }

    return { memberId, links }
  },
})
