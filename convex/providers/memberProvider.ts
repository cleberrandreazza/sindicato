import type { DependentRole, LinkStatus, MemberStatus } from '../domain/statuses'

/**
 * IDENTIDADE DA PESSOA
 *
 * `personId` identifica a PESSOA no mundo real. Exigências para qualquer implementação:
 * - estável: nunca muda para a mesma pessoa e nunca é reutilizado por outra;
 * - único: uma pessoa tem exatamente um `personId`, mesmo se constar em várias famílias
 *   (ex.: filha de dois titulares) ou como titular e dependente ao mesmo tempo;
 * - independente do vínculo: NÃO pode ser o id do vínculo familiar nem derivado do titular.
 *
 * A prevenção global de duplicidade (a mesma pessoa não paga duas vezes na mesma data) é tão
 * confiável quanto este identificador. O cadastro oficial precisa fornecê-lo; se ele não
 * existir, a duplicidade entre titulares diferentes NÃO pode ser garantida (ver
 * docs/business-rules.md).
 */
export interface ProviderPerson {
  readonly personId: string
  readonly name: string
}

/** Vínculo de um dependente com o titular (uma pessoa pode ter vários, um por titular). */
export interface ProviderDependentLink {
  /** Id do VÍNCULO no cadastro de origem. Distinto de `person.personId`. */
  readonly linkId: string
  readonly person: ProviderPerson
  readonly role: DependentRole
  readonly status: LinkStatus
}

export interface ProviderMember {
  readonly membershipNumber: string
  /** O titular também é uma pessoa e tem seu próprio `personId`. */
  readonly holder: ProviderPerson
  /** Situação cadastral. A elegibilidade é decidida pelo backend, não pelo provider. */
  readonly status: MemberStatus
  readonly phone?: string
  readonly email?: string
  readonly dependents: readonly ProviderDependentLink[]
}

export interface MemberLookupInput {
  /** Já validado e sem espaços nas pontas. */
  readonly membershipNumber: string
  /** Já validado; somente dígitos (11). */
  readonly cpf: string
}

/**
 * `found: false` cobre tanto carteirinha inexistente quanto CPF divergente, para que a
 * resposta não revele qual dos dois dados estava incorreto.
 */
export type MemberLookupResult =
  { readonly found: false } | { readonly found: true; readonly member: ProviderMember }

/** Acesso ao cadastro de associados do sindicato (fonte da verdade). */
export interface MemberProvider {
  readonly name: string
  lookupMember(input: MemberLookupInput): Promise<MemberLookupResult>
}
