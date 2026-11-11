import { CalendarX, Hourglass, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ConfirmationState } from '../hooks/use-operation-confirmation'

type NoticeState = Extract<
  ConfirmationState,
  { status: 'rejected' | 'duplicate' | 'unusable' | 'unknown' }
>

interface ConfirmationNoticeProps {
  state: NoticeState
  onRetry: () => void
  onReviewPeople: () => void
  onChangeDate: () => void
  onDismiss: () => void
}

/**
 * Resultado da confirmação que exige atenção, acima do resumo. Recebe o foco ao aparecer (o
 * navegador também rola até ele). Nenhum texto técnico: só o que o backend devolveu para o
 * associado ou mensagens fixas desta tela.
 */
export function ConfirmationNotice({
  state,
  onRetry,
  onReviewPeople,
  onChangeDate,
  onDismiss,
}: ConfirmationNoticeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  switch (state.status) {
    case 'rejected': {
      const title =
        state.reason === 'selection'
          ? 'Revise as pessoas selecionadas'
          : state.reason === 'date'
            ? 'Escolha outra data'
            : 'Não foi possível continuar'
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <p>Nenhuma operação foi criada.</p>
            {state.reason === 'selection' ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11"
                onClick={onReviewPeople}
              >
                Revisar pessoas
              </Button>
            ) : state.reason === 'date' ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11"
                onClick={onChangeDate}
              >
                Escolher outra data
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11"
                onClick={onDismiss}
              >
                Entendi
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )
    }
    case 'duplicate':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <CalendarX aria-hidden="true" />
          <AlertTitle>Já existe uma operação para esta data</AlertTitle>
          <AlertDescription>
            <p>
              Já existe uma operação pendente ou paga para
              {state.names.length > 0 ? ' estas pessoas' : ' uma das pessoas'} nesta data. Por isso{' '}
              <strong>não criamos outra</strong>.
            </p>
            {state.names.length > 0 ? (
              <ul className="list-disc pl-5">
                {state.names.map((name) => (
                  <li key={name} className="font-medium">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p>
              Uma operação pendente expira 15 minutos depois de criada. Se preferir, escolha outra
              data ou revise as pessoas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11"
                onClick={onChangeDate}
              >
                Escolher outra data
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11"
                onClick={onReviewPeople}
              >
                Revisar pessoas
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )
    case 'unusable':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <Hourglass aria-hidden="true" />
          <AlertTitle>
            {state.expired
              ? 'O prazo desta operação terminou'
              : 'Esta operação não está mais pendente'}
          </AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onDismiss}>
              Fazer nova solicitação
            </Button>
          </AlertDescription>
        </Alert>
      )
    case 'unknown':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="destructive" className="mb-4">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Ainda não conseguimos confirmar</AlertTitle>
          <AlertDescription>
            <p>
              Tivemos um problema de comunicação e não sabemos se a operação chegou a ser criada.
              Não é preciso começar de novo: ao verificar novamente, o sistema reconhece a mesma
              solicitação e <strong>não cria outra</strong>.
            </p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
              Verificar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )
  }
}
