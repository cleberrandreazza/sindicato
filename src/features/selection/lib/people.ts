import type { Id } from '../../../../convex/_generated/dataModel'
import type { HouseholdPerson } from '@/features/identification/lib/lookup-outcome'

type LinkId = Id<'householdLinks'>

export function relationshipLabel(person: HouseholdPerson): string {
  return person.kind === 'holder' ? 'Titular' : 'Dependente'
}

/**
 * Justificativa amigável para quem o backend marcou como não selecionável. A decisão é do
 * backend (`selectable`); o texto apenas a explica. Titular inativo nem chega a esta tela.
 */
export function ineligibleReason(person: HouseholdPerson): string | null {
  if (person.selectable) return null
  return 'Cadastro inativo no momento. Procure o Sindicomerciários para regularizar.'
}

/**
 * Marca/desmarca uma pessoa. Mantém a ordem da lista (e não duplica). Pessoas que o backend
 * não liberou não entram na seleção; o backend revalida de qualquer forma ao continuar.
 */
export function toggleSelection(
  people: readonly HouseholdPerson[],
  current: readonly LinkId[],
  linkId: LinkId,
): LinkId[] {
  const person = people.find((candidate) => candidate.linkId === linkId)
  if (!person?.selectable) return [...current]

  const next = new Set(current)
  if (next.has(linkId)) next.delete(linkId)
  else next.add(linkId)
  return people.filter((candidate) => next.has(candidate.linkId)).map((c) => c.linkId)
}
