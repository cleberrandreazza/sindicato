import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import {
  createOperation,
  getOperation,
  type CreateOperationFn,
  type GetOperationFn,
} from '../api/create-operation'
import {
  checkRecoveredOperation,
  interpretCreateError,
  interpretCreateResult,
  type ConfirmationOutcome,
} from '../lib/confirmation-outcome'
import {
  isSameRequest,
  type ConfirmationRequest,
  type CreatedOperation,
} from '../lib/created-operation'
import { generateRequestId } from '../lib/request-id'

export type ConfirmationState =
  | { status: 'idle' }
  | { status: 'confirming' }
  /** Criada (ou recuperada): a tela está passando para a etapa seguinte. */
  | { status: 'created' }
  | { status: 'rejected'; reason: 'selection' | 'date' | 'other'; message: string }
  | { status: 'duplicate'; names: string[]; message: string }
  /** Operação recuperada que já não está pendente (expirada, paga, em análise...). */
  | { status: 'unusable'; expired: boolean; message: string }
  /** Resultado desconhecido: a operação pode ter sido criada. A mesma chave é mantida. */
  | { status: 'unknown' }

interface UseOperationConfirmationOptions {
  member: IdentifiedMember
  selectedLinkIds: readonly Id<'householdLinks'>[]
  usageDate: string | null
  /** Tentativa lógica em andamento (guardada na jornada, só em memória). */
  request: ConfirmationRequest | null
  onRequestChange: (request: ConfirmationRequest | null) => void
  onCreated: (operation: CreatedOperation) => void | Promise<void>
  onSessionExpired: () => void | Promise<void>
  create?: CreateOperationFn
  getState?: GetOperationFn
  newRequestId?: () => string
}

/**
 * Criação da operação, com idempotência.
 *
 * - Cada tentativa lógica tem UM `requestId`. Ele só muda depois de uma resposta DEFINITIVA do
 *   backend (criada, recusada, duplicidade, operação recuperada sem uso). Enquanto o resultado for
 *   desconhecido (rede, tempo esgotado), a MESMA chave é reutilizada: repetir é seguro e
 *   recupera a operação original em vez de criar outra.
 * - Uma única chamada por vez (clique duplo não dispara duas).
 */
export function useOperationConfirmation({
  member,
  selectedLinkIds,
  usageDate,
  request,
  onRequestChange,
  onCreated,
  onSessionExpired,
  create = createOperation,
  getState = getOperation,
  newRequestId = generateRequestId,
}: UseOperationConfirmationOptions) {
  const [state, setState] = useState<ConfirmationState>({ status: 'idle' })
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const show = useCallback((next: ConfirmationState) => {
    if (mounted.current) setState(next)
  }, [])

  const confirm = useCallback(async () => {
    if (inFlight.current) return
    if (usageDate === null || selectedLinkIds.length === 0) return
    inFlight.current = true
    show({ status: 'confirming' })

    try {
      // Mesma tentativa (mesmos dados) → mesma chave; senão, uma tentativa nova.
      const attempt: ConfirmationRequest = isSameRequest(request, usageDate, selectedLinkIds)
        ? request
        : { requestId: newRequestId(), usageDate, linkIds: [...selectedLinkIds] }
      if (attempt !== request) onRequestChange(attempt)

      let outcome: ConfirmationOutcome
      let recovered = false
      try {
        const result = await create({
          memberId: member.memberId,
          identificationToken: member.session.token,
          linkIds: [...selectedLinkIds],
          usageDate,
          requestId: attempt.requestId,
        })
        recovered = result.reused
        outcome = interpretCreateResult(result)
      } catch (error) {
        outcome = interpretCreateError(error)
      }

      // Operação recuperada pela mesma chave: o estado oficial é o do `getOperation`, não o da
      // hora da criação (pode ter expirado, sido paga ou entrado em análise).
      if (outcome.kind === 'created' && recovered) {
        try {
          const check = checkRecoveredOperation(
            await getState({
              operationId: outcome.operation.operationId,
              accessToken: outcome.operation.accessToken,
            }),
          )
          if (!check.usable) {
            onRequestChange(null)
            show({ status: 'unusable', expired: check.expired, message: check.message })
            return
          }
        } catch {
          // Não deu para confirmar o estado: segue como desconhecido e repete com a mesma chave.
          outcome = { kind: 'unknown' }
        }
      }

      switch (outcome.kind) {
        case 'created':
          onRequestChange(null)
          show({ status: 'created' })
          await onCreated(outcome.operation)
          return
        case 'session_expired':
          show({ status: 'idle' })
          await onSessionExpired()
          return
        case 'rejected':
          onRequestChange(null)
          show({ status: 'rejected', reason: outcome.reason, message: outcome.message })
          return
        case 'duplicate':
          onRequestChange(null)
          show({ status: 'duplicate', names: outcome.names, message: outcome.message })
          return
        case 'unknown':
          show({ status: 'unknown' })
          return
      }
    } finally {
      inFlight.current = false
    }
  }, [
    create,
    getState,
    member.memberId,
    member.session.token,
    newRequestId,
    onCreated,
    onRequestChange,
    onSessionExpired,
    request,
    selectedLinkIds,
    show,
    usageDate,
  ])

  /** Descarta um aviso (a tentativa seguinte começa com uma chave nova, se for o caso). */
  const dismiss = useCallback(() => {
    if (!inFlight.current) setState({ status: 'idle' })
  }, [])

  return { state, confirm, dismiss }
}
