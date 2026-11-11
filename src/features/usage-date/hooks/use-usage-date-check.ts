import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkUsageDate,
  type CheckUsageDateFn,
  type CheckUsageDateInput,
} from '../api/check-usage-date'
import {
  interpretUsageDateError,
  interpretUsageDateResult,
  type UsageDateOutcome,
} from '../lib/usage-date-outcome'

export type UsageDateCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'accepted'; usageDate: string }
  | { status: 'conflict'; usageDate: string; names: string[] }
  | { status: 'rejected'; message: string }
  | { status: 'unavailable' }

function stateFromOutcome(outcome: UsageDateOutcome, usageDate: string): UsageDateCheckState {
  switch (outcome.kind) {
    case 'accepted':
      return { status: 'accepted', usageDate }
    case 'conflict':
      return { status: 'conflict', usageDate, names: outcome.names }
    case 'rejected':
      return { status: 'rejected', message: outcome.message }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'session_expired':
      // A tela é abandonada pelo chamador; nada a exibir aqui.
      return { status: 'idle' }
  }
}

/** Validação da data no backend. Guarda apenas o estado da tela. */
export function useUsageDateCheck(check: CheckUsageDateFn = checkUsageDate) {
  const [state, setState] = useState<UsageDateCheckState>({ status: 'idle' })
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (input: CheckUsageDateInput): Promise<UsageDateOutcome | null> => {
      // Evita validação duplicada por duplo toque.
      if (inFlight.current) return null
      inFlight.current = true
      setState({ status: 'checking' })

      let outcome: UsageDateOutcome
      try {
        outcome = interpretUsageDateResult(await check(input))
      } catch (error) {
        outcome = interpretUsageDateError(error)
      } finally {
        inFlight.current = false
      }

      if (mounted.current) setState(stateFromOutcome(outcome, input.usageDate))
      return outcome
    },
    [check],
  )

  /** Volta ao estado neutro (ex.: a data mudou e o resultado anterior deixou de valer). */
  const reset = useCallback(() => {
    if (!inFlight.current) setState({ status: 'idle' })
  }, [])

  return { state, check: run, reset }
}
