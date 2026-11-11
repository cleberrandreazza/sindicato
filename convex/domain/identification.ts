import { MAX_RAW_INPUT_LENGTH } from './limits'
import type { HouseholdRole, LinkStatus, MemberStatus } from './statuses'

/**
 * Formato aceito para o número da carteirinha. PREMISSA: o sindicato ainda não informou o formato
 * real; aceitamos 1 a 20 letras/números, o que cobre os mocks (`100001`). Ajustar quando houver
 * a regra oficial. Serve para barrar entradas absurdas, não para validar existência.
 */
const MEMBERSHIP_NUMBER_PATTERN = /^[A-Za-z0-9]{1,20}$/

/** Retorna o número normalizado (sem espaços nas pontas) ou `null` se o formato for inválido. */
export function parseMembershipNumber(input: string): string | null {
  if (input.length > MAX_RAW_INPUT_LENGTH) return null
  const trimmed = input.trim()
  return MEMBERSHIP_NUMBER_PATTERN.test(trimmed) ? trimmed : null
}

/** Pessoa como o navegador a vê: sem `personId`, sem CPF, sem dados de contato. */
export interface PersonView<TLinkId extends string = string> {
  /** Identificador do VÍNCULO com este titular. É o que o navegador devolve ao selecionar. */
  readonly linkId: TLinkId
  readonly name: string
  readonly role: HouseholdRole
  readonly status: LinkStatus
  /** Pode ser selecionada agora (titular ativo e vínculo ativo). */
  readonly selectable: boolean
}

export interface FamilyView<TLinkId extends string = string> {
  readonly holder: PersonView<TLinkId>
  readonly dependents: readonly PersonView<TLinkId>[]
}

export function buildFamilyView<TLinkId extends string>(input: {
  readonly memberStatus: MemberStatus
  readonly links: readonly {
    readonly linkId: TLinkId
    readonly name: string
    readonly role: HouseholdRole
    readonly status: LinkStatus
  }[]
}): FamilyView<TLinkId> | null {
  const toView = (link: (typeof input.links)[number]): PersonView<TLinkId> => ({
    linkId: link.linkId,
    name: link.name,
    role: link.role,
    status: link.status,
    selectable: input.memberStatus === 'active' && link.status === 'active',
  })
  const holder = input.links.find((link) => link.role === 'holder')
  if (!holder) return null
  return {
    holder: toView(holder),
    dependents: input.links.filter((link) => link.role !== 'holder').map(toView),
  }
}
