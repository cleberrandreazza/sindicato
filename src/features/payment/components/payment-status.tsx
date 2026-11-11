import { CircleCheck, Hourglass, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ActivePayment, PaymentUiState } from '../hooks/use-payment'

interface PaymentStatusProps {
  state: PaymentUiState
  onRetry: () => void
  onChooseAgain: () => void
  onRefresh: () => void
}

export function PaymentStatus({ state, onRetry, onChooseAgain, onRefresh }: PaymentStatusProps) {
  const ref = useRef<HTMLDivElement>(null)
  const focusKey =
    state.status === 'active'
      ? `${state.active.payment.status}:${state.active.financialStatus}:${state.active.operationalStatus}`
      : state.status

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'starting' || state.status === 'refreshing') {
      return
    }
    if (state.status === 'active' && state.active.payment.status === 'pending') return
    ref.current?.focus()
  }, [focusKey, state])

  if (state.status === 'active') {
    return <ActiveStatus active={state.active} noticeRef={ref} />
  }

  if (state.status === 'rejected') {
    return (
      <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Não foi possível concluir esta cobrança</AlertTitle>
        <AlertDescription>
          <p>{state.message}</p>
          <p>Nenhum pagamento foi registrado. Você pode tentar outra forma dentro do prazo.</p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11"
            onClick={onChooseAgain}
          >
            Escolher novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (state.status === 'closed') {
    const late =
      state.code === 'under_review_late_payment' || state.code === 'operation_under_review'
    return (
      <Alert ref={ref} tabIndex={-1} role="status" variant="warning" className="mb-4">
        {late ? <Hourglass aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
        <AlertTitle>
          {late
            ? 'Pagamento recebido após o prazo'
            : state.code === 'operation_expired' || state.code === 'expired'
              ? 'Operação expirada'
              : 'Situação da operação'}
        </AlertTitle>
        <AlertDescription>
          <p>{state.message}</p>
          {late ? (
            <p>
              A utilização das piscinas só será liberada após a validação da nossa equipe. Não
              realize um novo pagamento.
            </p>
          ) : null}
          <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRefresh}>
            Atualizar status
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <Alert ref={ref} tabIndex={-1} role="alert" variant="destructive" className="mb-4">
        <WifiOff aria-hidden="true" />
        <AlertTitle>Ainda não conseguimos confirmar</AlertTitle>
        <AlertDescription>
          <p>
            Tivemos um problema de comunicação. Não sabemos se a cobrança chegou a ser criada. Ao
            verificar novamente, o sistema reconhece a mesma solicitação e não cria cobrança
            duplicada.
          </p>
          <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
            Verificar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

function ActiveStatus({
  active,
  noticeRef,
}: {
  active: ActivePayment
  noticeRef: React.RefObject<HTMLDivElement | null>
}) {
  const { payment, financialStatus, operationalStatus, presentation, reused } = active

  if (payment.status === 'pending' && operationalStatus === 'awaiting_payment') {
    return reused ? (
      <Alert role="status" variant="info" className="mb-4">
        <Hourglass aria-hidden="true" />
        <AlertTitle>Cobrança em andamento</AlertTitle>
        <AlertDescription>
          <p>
            Reutilizamos a cobrança já criada para esta operação. Nenhuma cobrança nova foi gerada.
          </p>
        </AlertDescription>
      </Alert>
    ) : null
  }

  if (financialStatus === 'paid' && operationalStatus === 'confirmed') {
    return (
      <Alert ref={noticeRef} tabIndex={-1} role="status" variant="success" className="mb-4">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>Pagamento aprovado (simulado)</AlertTitle>
        <AlertDescription>
          <p>{presentation.message}</p>
          <p>Esta aprovação veio do provedor mockado — nenhum pagamento real foi processado.</p>
        </AlertDescription>
      </Alert>
    )
  }

  if (financialStatus === 'paid_late' || operationalStatus === 'under_review') {
    return (
      <Alert ref={noticeRef} tabIndex={-1} role="status" variant="warning" className="mb-4">
        <Hourglass aria-hidden="true" />
        <AlertTitle>Pagamento recebido após o prazo</AlertTitle>
        <AlertDescription>
          <p>{presentation.message}</p>
          <p>
            Recebemos a confirmação do pagamento após o prazo previsto. Nossa equipe precisará
            analisar a operação antes de confirmar sua utilização. Você poderá acompanhar a
            atualização por aqui.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  if (
    payment.status === 'failed' ||
    payment.status === 'canceled' ||
    payment.status === 'expired'
  ) {
    return (
      <Alert ref={noticeRef} tabIndex={-1} role="alert" variant="warning" className="mb-4">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>
          {payment.status === 'failed'
            ? 'Pagamento recusado (simulado)'
            : payment.status === 'canceled'
              ? 'Cobrança cancelada'
              : 'Cobrança expirada'}
        </AlertTitle>
        <AlertDescription>
          <p>{payment.message}</p>
        </AlertDescription>
      </Alert>
    )
  }

  if (operationalStatus === 'expired') {
    return (
      <Alert ref={noticeRef} tabIndex={-1} role="status" variant="warning" className="mb-4">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Operação expirada</AlertTitle>
        <AlertDescription>
          <p>{presentation.message}</p>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
