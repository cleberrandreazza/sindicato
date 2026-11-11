import { useCallback, useEffect, useRef, useState } from 'react'
import { lookupMember, type LookupFn, type LookupInput } from '../api/lookup-member'
import { interpretLookupError, interpretLookupResult } from '../lib/lookup-outcome'
import type { IdentifiedMember, LookupOutcome } from '../lib/lookup-outcome'

export type IdentificationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'identified'; member: IdentifiedMember }
  | { status: 'inactive'; membershipNumber: string; message: string }
  | { status: 'not_found' }
  | { status: 'rate_limited'; message: string }
  | { status: 'unavailable' }

function stateFromOutcome(outcome: LookupOutcome): IdentificationState {
  switch (outcome.kind) {
    case 'identified':
      return { status: 'identified', member: outcome.member }
    case 'inactive':
      return {
        status: 'inactive',
        membershipNumber: outcome.membershipNumber,
        message: outcome.message,
      }
    case 'not_found':
      return { status: 'not_found' }
    case 'rate_limited':
      return { status: 'rate_limited', message: outcome.message }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'invalid_input':
      // Erro de campo: quem exibe é o formulário; a tela volta ao estado inicial.
      return { status: 'idle' }
  }
}

/**
 * Fluxo de identificação. Mantém apenas o estado da tela; o que cada resposta significa vem de
 * `lookup-outcome.ts`. A prova de identificação (`member.session`) fica só em memória.
 */
export function useIdentification(lookup: LookupFn = lookupMember) {
  const [state, setState] = useState<IdentificationState>({ status: 'idle' })
  const lastInput = useRef<LookupInput | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const submit = useCallback(
    async (input: LookupInput): Promise<LookupOutcome | null> => {
      // Evita consulta duplicada por duplo toque enquanto uma já está em andamento.
      if (inFlight.current) return null
      inFlight.current = true
      lastInput.current = input
      setState({ status: 'submitting' })

      let outcome: LookupOutcome
      try {
        outcome = interpretLookupResult(await lookup(input))
      } catch (error) {
        outcome = interpretLookupError(error)
      } finally {
        inFlight.current = false
      }

      if (mounted.current) setState(stateFromOutcome(outcome))
      return outcome
    },
    [lookup],
  )

  /** Repete a última consulta (ex.: após erro de comunicação). */
  const retry = useCallback(async (): Promise<LookupOutcome | null> => {
    return lastInput.current ? submit(lastInput.current) : null
  }, [submit])

  /** Volta ao início e esquece os dados da consulta anterior. */
  const reset = useCallback(() => {
    lastInput.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, submit, retry, reset }
}
