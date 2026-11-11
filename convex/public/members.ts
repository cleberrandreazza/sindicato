import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { action, query } from '../_generated/server'
import { isValidCpf, maskCpf, normalizeCpf } from '../domain/cpf'
import { buildFamilyView, parseMembershipNumber, type FamilyView } from '../domain/identification'
import { MAX_RAW_INPUT_LENGTH } from '../domain/limits'
import { hashCpf } from '../domain/privacy'
import { publicError, publicMessage, type PublicErrorCode } from '../domain/publicErrors'
import type { MemberStatus } from '../domain/statuses'
import { resolveMemberSelection } from '../members/family'
import { requireSession } from '../members/sessions'
import { ProviderError } from '../providers/errors'
import { getProviders } from '../providers/registry'

/**
 * FUNÇÕES PÚBLICAS: consulta cadastral e validação de seleção.
 * Tudo em `convex/public/` é alcançável pelo navegador; nada fora desta pasta é. Cada função
 * valida seus argumentos e nunca confia em titularidade ou situação enviadas pelo cliente.
 */

export interface LookupResult {
  member: {
    /** Identificador do associado, para as chamadas seguintes (junto com a prova). */
    id: Id<'members'>
    membershipNumber: string
    status: MemberStatus
    /** CPF mascarado (`***.***.***-09`). O CPF completo nunca é devolvido. */
    cpfMasked: string
  }
  holder: FamilyView<Id<'householdLinks'>>['holder']
  dependents: FamilyView<Id<'householdLinks'>>['dependents']
  /** Prova de identificação (vida curta). `null` quando o cadastro não está ativo. */
  session: { token: string; expiresAt: number } | null
  /** Texto para exibir quando o cadastro não permite prosseguir. */
  message?: string
}

/**
 * Consulta cadastral. O associado informa carteirinha e CPF.
 *
 * - Carteirinha inexistente e CPF divergente produzem a MESMA resposta (`identification_failed`).
 * - Formato inválido (CPF com dígitos errados etc.) é recusado antes de qualquer consulta; isso
 *   não revela nada sobre o cadastro.
 * - Falhas por carteirinha e volume global são limitados (ver `domain/limits.ts`).
 * - Titular inativo: como carteirinha + CPF conferiram, a situação é informada, sem prova de
 *   identificação (nada mais pode ser feito).
 * - Não devolve CPF completo, telefone, e-mail nem dados internos (`personId`, ids de vínculo da
 *   origem). Dependentes inativos aparecem com `selectable: false`.
 */
export const lookup = action({
  args: { membershipNumber: v.string(), cpf: v.string() },
  handler: async (ctx, args): Promise<LookupResult> => {
    const membershipNumber = parseMembershipNumber(args.membershipNumber)
    if (membershipNumber === null) throw publicError('invalid_membership_number')
    if (args.cpf.length > MAX_RAW_INPUT_LENGTH || !isValidCpf(args.cpf)) {
      throw publicError('invalid_cpf')
    }
    const cpf = normalizeCpf(args.cpf)

    const gate = await ctx.runMutation(internal.members.lookupGate.enter, { membershipNumber })
    if (!gate.allowed) {
      throw publicError('too_many_attempts', {
        retryAfterSeconds: Math.ceil(gate.retryAfterMs / 1000),
      })
    }

    // Falhas de configuração/provedor viram uma resposta genérica; o detalhe vai só para o log
    // (sem CPF nem carteirinha).
    let found
    try {
      found = await getProviders().members.lookupMember({ membershipNumber, cpf })
    } catch (error) {
      console.error(
        'lookup: falha no MemberProvider',
        error instanceof ProviderError ? error.code : 'unknown',
      )
      throw publicError('service_unavailable')
    }

    if (!found.found) {
      await ctx.runMutation(internal.members.lookupGate.recordFailure, { membershipNumber })
      throw publicError('identification_failed')
    }

    const secret = process.env.CPF_HASH_SECRET
    if (!secret || secret.length < 16) {
      console.error('lookup: CPF_HASH_SECRET ausente ou curto')
      throw publicError('service_unavailable')
    }
    const { member } = found

    const synced = await ctx.runMutation(internal.members.lookupGate.complete, {
      membershipNumber: member.membershipNumber,
      cpfHash: await hashCpf(cpf, secret),
      cpfMasked: maskCpf(cpf),
      status: member.status,
      phone: member.phone,
      email: member.email,
      holder: member.holder,
      dependents: member.dependents.map((dependent) => ({ ...dependent })),
    })

    const family = buildFamilyView({ memberStatus: member.status, links: synced.links })
    if (!family) throw publicError('service_unavailable')

    return {
      member: {
        id: synced.memberId,
        membershipNumber: member.membershipNumber,
        status: member.status,
        cpfMasked: maskCpf(cpf),
      },
      holder: family.holder,
      dependents: family.dependents,
      session: synced.session,
      ...(member.status === 'active' ? {} : { message: publicMessage('member_inactive') }),
    }
  },
})

export type ValidateSelectionResult =
  | {
      ok: true
      quantity: number
      people: { linkId: Id<'householdLinks'>; name: string; role: string }[]
    }
  | { ok: false; code: PublicErrorCode; message: string }

/**
 * Valida, no servidor, as pessoas selecionadas: pertencem ao grupo familiar deste titular, estão
 * ativas, não se repetem e a seleção não é vazia. Convidados não existem: só há vínculos
 * cadastrados. Não considera data nem duplicidade (ver `public/payments:checkDuplicates`).
 *
 * Seleção inválida é um resultado normal (`ok: false`); prova de identificação inválida é erro.
 */
export const validateSelection = query({
  args: {
    memberId: v.id('members'),
    identificationToken: v.string(),
    linkIds: v.array(v.id('householdLinks')),
  },
  handler: async (ctx, args): Promise<ValidateSelectionResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)
    const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
    if (!selection.ok) {
      return { ok: false, code: selection.code, message: publicMessage(selection.code) }
    }
    return {
      ok: true,
      quantity: selection.people.length,
      people: selection.people.map((person) => ({
        linkId: person.linkId,
        name: person.name,
        role: person.role,
      })),
    }
  },
})
