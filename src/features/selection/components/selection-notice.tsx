import { CircleCheck, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ValidationState } from '../hooks/use-selection-validation'
import { formatBRL, peopleLabel, summarizeSelection } from '../lib/summary'

type NoticeState = Extract<ValidationState, { status: 'valid' | 'rejected' | 'unavailable' }>

interface SelectionNoticeProps {
  state: NoticeState
  onRetry: () => void
}

/**
 * Resultado da validação da seleção, acima da lista. Recebe o foco ao aparecer (o navegador
 * também rola até ele), para que ninguém precise procurá-lo atrás da barra fixa.
 */
export function SelectionNotice({ state, onRetry }: SelectionNoticeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  switch (state.status) {
    case 'valid': {
      const summary = summarizeSelection(state.quantity)
      return (
        <Alert ref={ref} tabIndex={-1} role="status" variant="success" className="mb-4">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Seleção validada</AlertTitle>
          <AlertDescription>
            <p>
              {peopleLabel(state.quantity)} · {formatBRL(summary.totalAmountCents)}. Na próxima
              etapa você informa a data de utilização.
            </p>
          </AlertDescription>
        </Alert>
      )
    }
    case 'rejected':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Revise a seleção</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
          </AlertDescription>
        </Alert>
      )
    case 'unavailable':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="destructive" className="mb-4">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Não foi possível validar agora</AlertTitle>
          <AlertDescription>
            <p>
              Tivemos um problema de comunicação. Verifique sua conexão e tente novamente; a sua
              seleção foi mantida.
            </p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )
  }
}
