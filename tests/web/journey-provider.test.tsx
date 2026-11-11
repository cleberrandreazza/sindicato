// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import { useJourney } from '../../src/app/providers/journey-context'
import { JourneyProvider } from '../../src/app/providers/journey-provider'
import type { IdentifiedMember } from '../../src/features/identification/lib/lookup-outcome'

afterEach(cleanup)

const link = (value: string) => value as Id<'householdLinks'>

const member: IdentifiedMember = {
  memberId: 'member-1' as Id<'members'>,
  membershipNumber: '100001',
  cpfMasked: '***.***.***-08',
  holderName: 'Ana Teste Almeida',
  selectablePeopleCount: 2,
  people: [],
  session: { token: 'token-da-sessao', expiresAt: Date.now() + 1_800_000 },
}

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JourneyProvider>{children}</JourneyProvider>
  )
  return renderHook(() => useJourney(), { wrapper })
}

describe('JourneyProvider: data de utilização', () => {
  it('começa sem data', () => {
    const { result } = setup()
    expect(result.current.usageDate).toBeNull()
  })

  it('guarda a data como texto de calendário, sem convertê-la', () => {
    const { result } = setup()
    act(() => result.current.setUsageDate('2026-11-20'))
    expect(result.current.usageDate).toBe('2026-11-20')
    expect(typeof result.current.usageDate).toBe('string')
  })

  it('alterar a seleção descarta a data escolhida', () => {
    const { result } = setup()
    act(() => result.current.begin(member))
    act(() => result.current.setSelectedLinkIds([link('l0')]))
    act(() => result.current.setUsageDate('2026-11-20'))

    act(() => result.current.setSelectedLinkIds([link('l0'), link('l1')]))
    expect(result.current.usageDate).toBeNull()
    expect(result.current.selectedLinkIds).toEqual(['l0', 'l1'])
  })

  it('trocar uma pessoa por outra (mesma quantidade) também descarta a data', () => {
    const { result } = setup()
    act(() => result.current.setSelectedLinkIds([link('l0')]))
    act(() => result.current.setUsageDate('2026-11-20'))
    act(() => result.current.setSelectedLinkIds([link('l1')]))
    expect(result.current.usageDate).toBeNull()
  })

  it('desmarcar todas as pessoas descarta a data', () => {
    const { result } = setup()
    act(() => result.current.setSelectedLinkIds([link('l0')]))
    act(() => result.current.setUsageDate('2026-11-20'))
    act(() => result.current.setSelectedLinkIds([]))
    expect(result.current.usageDate).toBeNull()
  })

  it('reenviar a mesma seleção não descarta a data', () => {
    const { result } = setup()
    act(() => result.current.setSelectedLinkIds([link('l0'), link('l1')]))
    act(() => result.current.setUsageDate('2026-11-20'))
    act(() => result.current.setSelectedLinkIds([link('l0'), link('l1')]))
    expect(result.current.usageDate).toBe('2026-11-20')
  })

  it('iniciar uma nova jornada ou encerrá-la descarta seleção e data', () => {
    const { result } = setup()
    act(() => result.current.setSelectedLinkIds([link('l0')]))
    act(() => result.current.setUsageDate('2026-11-20'))
    act(() => result.current.begin(member))
    expect(result.current.usageDate).toBeNull()
    expect(result.current.selectedLinkIds).toEqual([])

    act(() => result.current.setSelectedLinkIds([link('l0')]))
    act(() => result.current.setUsageDate('2026-11-21'))
    act(() => result.current.end())
    expect(result.current.usageDate).toBeNull()
    expect(result.current.selectedLinkIds).toEqual([])
    expect(result.current.member).toBeNull()
  })
})
