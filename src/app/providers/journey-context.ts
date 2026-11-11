import { createContext, useContext } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import type {
  ConfirmationRequest,
  CreatedOperation,
} from '@/features/summary/lib/created-operation'

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
  /**
   * Tentativa lógica de confirmação em andamento (`requestId` + dados a que se refere). Mantém a
   * MESMA chave enquanto o resultado da criação for desconhecido, para repetir sem duplicar.
   */
  confirmRequest: ConfirmationRequest | null
  /**
   * Operação que o backend criou (ou recuperou), com valores e prazo oficiais e a credencial
   * dela. Só em memória.
   */
  operation: CreatedOperation | null
  /** Inicia a jornada com um novo associado identificado (descarta tudo o que havia da jornada anterior). */
  begin: (member: IdentifiedMember) => void
  /**
   * Altera a seleção de pessoas. Uma seleção DIFERENTE da atual descarta a data escolhida: a data
   * foi validada para outro conjunto de pessoas e não vale para o novo.
   */
  setSelectedLinkIds: (linkIds: readonly Id<'householdLinks'>[]) => void
  setUsageDate: (usageDate: string | null) => void
  setConfirmRequest: (request: ConfirmationRequest | null) => void
  setOperation: (operation: CreatedOperation | null) => void
  /** Encerra a jornada e esquece a prova de identificação. */
  end: () => void
}

export const JourneyContext = createContext<JourneyContextValue | null>(null)

export function useJourney(): JourneyContextValue {
  const value = useContext(JourneyContext)
  if (!value) throw new Error('useJourney deve ser usado dentro de <JourneyProvider>.')
  return value
}
