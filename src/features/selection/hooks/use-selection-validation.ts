import { useCallback, useEffect, useRef, useState } from 'react'
import {
  validateSelection,
  type ValidateSelectionFn,
  type ValidateSelectionInput,
} from '../api/validate-selection'
import {
  interpretValidationError,
  interpretValidationResult,
  type ValidationOutcome,
} from '../lib/selection-outcome'

export type ValidationState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid'; quantity: number }
  | { status: 'rejected'; message: string }
  | { status: 'unavailable' }

function stateFromOutcome(outcome: ValidationOutcome): ValidationState {
  switch (outcome.kind) {
    case 'valid':
      return { status: 'valid', quantity: outcome.quantity }
    case 'rejected':
      return { status: 'rejected', message: outcome.message }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'session_expired':
      // A tela é abandonada pelo chamador; nada a exibir aqui.
      return { status: 'idle' }
  }
}

/** Validação da seleção no backend. Guarda apenas o estado da tela. */
export function useSelectionValidation(validate: ValidateSelectionFn = validateSelection) {
  const [state, setState] = useState<ValidationState>({ status: 'idle' })
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (input: ValidateSelectionInput): Promise<ValidationOutcome | null> => {
      // Evita validação duplicada por duplo toque.
      if (inFlight.current) return null
      inFlight.current = true
      setState({ status: 'validating' })

      let outcome: ValidationOutcome
      try {
        outcome = interpretValidationResult(await validate(input))
      } catch (error) {
        outcome = interpretValidationError(error)
      } finally {
        inFlight.current = false
      }

      if (mounted.current) setState(stateFromOutcome(outcome))
      return outcome
    },
    [validate],
  )

  /** Volta ao estado neutro (ex.: quando a seleção muda e a validação anterior deixa de valer). */
  const reset = useCallback(() => {
    if (!inFlight.current) setState({ status: 'idle' })
  }, [])

  return { state, validate: run, reset }
}
