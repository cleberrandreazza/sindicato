import { createContext, useContext } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'

/**
 * Estado da jornada do associado ENQUANTO a aba estiver aberta: quem se identificou (incluindo a
 * prova de identificação temporária) e quais pessoas foram marcadas.
 *
 * Fica somente em memória, de propósito: nada vai para `localStorage`, `sessionStorage`, cookie
 * ou URL. Recarregar a página encerra a jornada e leva o associado a se identificar de novo.
 */
export interface JourneyContextValue {
  member: IdentifiedMember | null
  selectedLinkIds: readonly Id<'householdLinks'>[]
  /** Inicia a jornada com um novo associado identificado (descarta qualquer seleção anterior). */
  begin: (member: IdentifiedMember) => void
  setSelectedLinkIds: (linkIds: readonly Id<'householdLinks'>[]) => void
  /** Encerra a jornada e esquece a prova de identificação. */
  end: () => void
}

export const JourneyContext = createContext<JourneyContextValue | null>(null)

export function useJourney(): JourneyContextValue {
  const value = useContext(JourneyContext)
  if (!value) throw new Error('useJourney deve ser usado dentro de <JourneyProvider>.')
  return value
}
