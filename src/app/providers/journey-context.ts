import { createContext, useContext } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'

/**
 * Estado da jornada do associado ENQUANTO a aba estiver aberta: quem se identificou (incluindo a
 * prova de identificação temporária), quais pessoas foram marcadas e a data escolhida.
 *
 * Fica somente em memória, de propósito: nada vai para `localStorage`, `sessionStorage`, cookie
 * ou URL. Recarregar a página encerra a jornada e leva o associado a se identificar de novo.
 */
export interface JourneyContextValue {
  member: IdentifiedMember | null
  selectedLinkIds: readonly Id<'householdLinks'>[]
  /**
   * Data de utilização escolhida: data de calendário `YYYY-MM-DD`, sem hora nem fuso (nunca um
   * `Date`), ou `null` enquanto não escolhida. É só a escolha do associado; quem a aceita é o
   * backend, a cada validação.
   */
  usageDate: string | null
  /** Inicia a jornada com um novo associado identificado (descarta seleção e data anteriores). */
  begin: (member: IdentifiedMember) => void
  /**
   * Altera a seleção de pessoas. Uma seleção DIFERENTE da atual descarta a data escolhida: a data
   * foi validada para outro conjunto de pessoas e não vale para o novo.
   */
  setSelectedLinkIds: (linkIds: readonly Id<'householdLinks'>[]) => void
  setUsageDate: (usageDate: string | null) => void
  /** Encerra a jornada e esquece a prova de identificação. */
  end: () => void
}

export const JourneyContext = createContext<JourneyContextValue | null>(null)

export function useJourney(): JourneyContextValue {
  const value = useContext(JourneyContext)
  if (!value) throw new Error('useJourney deve ser usado dentro de <JourneyProvider>.')
  return value
}
