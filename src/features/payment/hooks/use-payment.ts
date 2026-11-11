import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { PaymentMethod } from '../../../../convex/domain/statuses'
import type { PaymentView } from '../../../../convex/payments/chargeView'
import type { OperationView } from '../../../../convex/public/payments'
import {
  getOperation,
  startPayment,
  type GetOperationFn,
  type StartPaymentFn,
} from '../api/start-payment'
import {
  canAttemptPayment,
  interpretGetError,
  interpretGetResult,
  interpretStartError,
  interpretStartResult,
} from '../lib/payment-outcome'

export type ActivePayment = {
  method: PaymentMethod
  payment: PaymentView
  operationalStatus: OperationView['operationalStatus']
  financialStatus: OperationView['financialStatus']
  presentation: OperationView['presentation']
  reused: boolean
}

export type PaymentUiState =
  | { status: 'idle' }
  | { status: 'starting'; method: PaymentMethod }
  | { status: 'active'; active: ActivePayment }
  | { status: 'refreshing'; active: ActivePayment | null }
  | { status: 'closed'; message: string; code: string }
  | { status: 'rejected'; message: string; code: string }
  | { status: 'unavailable' }
  | { status: 'gone' }

interface UsePaymentOptions {
  operationId: Id<'paymentOperations'>
  accessToken: string
  initialExpiresAt: number
  start?: StartPaymentFn
  getState?: GetOperationFn
  pollIntervalMs?: number
  onGone?: () => void | Promise<void>
}

function toActive(
  payment: PaymentView,
  view: {
    operationalStatus: OperationView['operationalStatus']
    financialStatus: OperationView['financialStatus']
    presentation: OperationView['presentation']
  },
  reused: boolean,
): ActivePayment {
  return {
    method: payment.method,
    payment,
    operationalStatus: view.operationalStatus,
    financialStatus: view.financialStatus,
    presentation: view.presentation,
    reused,
  }
}

/**
 * Checkout: cria/reutiliza cobrança via `startPayment` e consulta o estado oficial via
 * `getOperation`. Nunca confirma pagamento no navegador.
 */
export function usePayment({
  operationId,
  accessToken,
  initialExpiresAt,
  start = startPayment,
  getState = getOperation,
  pollIntervalMs = 4_000,
  onGone,
}: UsePaymentOptions) {
  const [state, setState] = useState<PaymentUiState>({ status: 'idle' })
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const activeRef = useRef<ActivePayment | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const show = useCallback((next: PaymentUiState) => {
    if (!mounted.current) return
    if (next.status === 'active') activeRef.current = next.active
    if (next.status === 'idle' || next.status === 'closed' || next.status === 'gone') {
      activeRef.current = null
    }
    setState(next)
  }, [])

  const applyGone = useCallback(async () => {
    show({ status: 'gone' })
    await onGone?.()
  }, [onGone, show])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    show({ status: 'refreshing', active: activeRef.current })
    try {
      let outcome
      try {
        outcome = interpretGetResult(await getState({ operationId, accessToken }))
      } catch (error) {
        outcome = interpretGetError(error)
      }

      if (outcome.kind === 'operation_gone') {
        await applyGone()
        return
      }
      if (outcome.kind === 'unavailable') {
        if (activeRef.current) show({ status: 'active', active: activeRef.current })
        else show({ status: 'unavailable' })
        return
      }
      if (outcome.kind !== 'snapshot') return

      const view = outcome.view
      setExpiresAt(view.expiresAt)
      if (view.payment) {
        show({ status: 'active', active: toActive(view.payment, view, false) })
      } else if (!canAttemptPayment(view)) {
        show({
          status: 'closed',
          code: view.presentation.code,
          message: view.presentation.message,
        })
      } else {
        show({ status: 'idle' })
      }
    } finally {
      inFlight.current = false
    }
  }, [accessToken, applyGone, getState, operationId, show])

  const begin = useCallback(
    async (method: PaymentMethod, paymentMethodToken?: string) => {
      if (inFlight.current) return
      inFlight.current = true
      show({ status: 'starting', method })
      try {
        let outcome
        try {
          outcome = interpretStartResult(
            await start({
              operationId,
              accessToken,
              paymentMethod: method,
              ...(paymentMethodToken !== undefined ? { paymentMethodToken } : {}),
            }),
          )
        } catch (error) {
          outcome = interpretStartError(error)
        }

        switch (outcome.kind) {
          case 'ready': {
            const { payment, operation, reused } = outcome.result
            show({ status: 'active', active: toActive(payment, operation, reused) })
            try {
              const view = await getState({ operationId, accessToken })
              setExpiresAt(view.expiresAt)
              if (view.payment) {
                show({ status: 'active', active: toActive(view.payment, view, reused) })
              }
            } catch {
              // Mantém o resultado do startPayment.
            }
            return
          }
          case 'operation_gone':
            await applyGone()
            return
          case 'operation_closed':
            show({ status: 'closed', message: outcome.message, code: outcome.code })
            return
          case 'rejected':
            show({ status: 'rejected', message: outcome.message, code: outcome.code })
            return
          case 'unavailable':
            show({ status: 'unavailable' })
            return
          default:
            show({ status: 'unavailable' })
        }
      } finally {
        inFlight.current = false
      }
    },
    [accessToken, applyGone, getState, operationId, show, start],
  )

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationId, accessToken])

  const pending =
    state.status === 'active' &&
    state.active.payment.status === 'pending' &&
    state.active.operationalStatus === 'awaiting_payment'

  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)
    return () => window.clearInterval(id)
  }, [pending, pollIntervalMs, refresh])

  return {
    state,
    expiresAt,
    begin,
    refresh,
    resetToIdle: () => {
      if (!inFlight.current) show({ status: 'idle' })
    },
  }
}
