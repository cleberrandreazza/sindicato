import { useMemo, useState, type ReactNode } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import { JourneyContext, type JourneyContextValue } from './journey-context'

const NO_SELECTION: readonly Id<'householdLinks'>[] = []

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<IdentifiedMember | null>(null)
  const [selectedLinkIds, setSelectedLinkIds] =
    useState<readonly Id<'householdLinks'>[]>(NO_SELECTION)

  const value = useMemo<JourneyContextValue>(
    () => ({
      member,
      selectedLinkIds,
      begin: (next) => {
        setMember(next)
        setSelectedLinkIds(NO_SELECTION)
      },
      setSelectedLinkIds,
      end: () => {
        setMember(null)
        setSelectedLinkIds(NO_SELECTION)
      },
    }),
    [member, selectedLinkIds],
  )

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}
