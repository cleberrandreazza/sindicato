import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
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

  const setSelectedLinkIds = useCallback(
    (next: LinkIds) => {
      // A data depende de quem utilizará as piscinas: outra seleção, outra validação.
      if (!sameLinkIds(selectedLinkIds, next)) setUsageDate(null)
      setSelectedLinkIdsState(next)
    },
    [selectedLinkIds],
  )

  const value = useMemo<JourneyContextValue>(
    () => ({
      member,
      selectedLinkIds,
      usageDate,
      begin: (next) => {
        setMember(next)
        setSelectedLinkIdsState(NO_SELECTION)
        setUsageDate(null)
      },
      setSelectedLinkIds,
      setUsageDate,
      end: () => {
        setMember(null)
        setSelectedLinkIdsState(NO_SELECTION)
        setUsageDate(null)
      },
    }),
    [member, selectedLinkIds, usageDate, setSelectedLinkIds],
  )

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}
