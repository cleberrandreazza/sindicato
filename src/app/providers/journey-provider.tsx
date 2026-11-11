import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import type {
  ConfirmationRequest,
  CreatedOperation,
} from '@/features/summary/lib/created-operation'
import { JourneyContext, type JourneyContextValue } from './journey-context'

type LinkIds = readonly Id<'householdLinks'>[]

const NO_SELECTION: LinkIds = []

/** Mesmas pessoas, na mesma ordem. */
function sameLinkIds(a: LinkIds, b: LinkIds): boolean {
  return a.length === b.length && a.every((linkId, index) => linkId === b[index])
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<IdentifiedMember | null>(null)
  const [selectedLinkIds, setSelectedLinkIdsState] = useState<LinkIds>(NO_SELECTION)
  const [usageDate, setUsageDate] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmationRequest | null>(null)
  const [operation, setOperation] = useState<CreatedOperation | null>(null)

  const setSelectedLinkIds = useCallback(
    (next: LinkIds) => {
      if (!sameLinkIds(selectedLinkIds, next)) {
        // Outra seleção: a data e qualquer tentativa de confirmação em andamento deixam de valer.
        setUsageDate(null)
        setConfirmRequest(null)
      }
      setSelectedLinkIdsState(next)
    },
    [selectedLinkIds],
  )

  const setUsageDateAndClearRequest = useCallback(
    (next: string | null) => {
      if (usageDate !== next) setConfirmRequest(null)
      setUsageDate(next)
    },
    [usageDate],
  )

  const value = useMemo<JourneyContextValue>(
    () => ({
      member,
      selectedLinkIds,
      usageDate,
      confirmRequest,
      operation,
      begin: (next) => {
        setMember(next)
        setSelectedLinkIdsState(NO_SELECTION)
        setUsageDate(null)
        setConfirmRequest(null)
        setOperation(null)
      },
      setSelectedLinkIds,
      setUsageDate: setUsageDateAndClearRequest,
      setConfirmRequest,
      setOperation,
      end: () => {
        setMember(null)
        setSelectedLinkIdsState(NO_SELECTION)
        setUsageDate(null)
        setConfirmRequest(null)
        setOperation(null)
      },
    }),
    [
      member,
      selectedLinkIds,
      usageDate,
      confirmRequest,
      operation,
      setSelectedLinkIds,
      setUsageDateAndClearRequest,
    ],
  )

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}
