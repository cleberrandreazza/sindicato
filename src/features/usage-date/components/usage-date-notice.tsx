import { CircleCheck, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { UsageDateCheckState } from '../hooks/use-usage-date-check'
import { formatUsageDate } from '../lib/usage-date'

type NoticeState = Extract<
  UsageDateCheckState,
  { status: 'accepted' | 'conflict' | 'rejected' | 'unavailable' }
>

interface UsageDateNoticeProps {
  state: NoticeState
  onRetry: () => void
}

/**
 * Resultado da validação da data, acima do formulário. Recebe o foco ao aparecer (o navegador
 * também rola até ele), para que ninguém precise procurá-lo.
 */
export function UsageDateNotice({ state, onRetry }: UsageDateNoticeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  switch (state.status) {
    case 'accepted':
      return (
        <Alert ref={ref} tabIndex={-1} role="status" variant="success" className="mb-4">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Data aceita pelo sistema</AlertTitle>
          <AlertDescription>
            <p className="font-medium">{formatUsageDate(state.usageDate)}</p>
            <p>
              Aceitar a data não confirma que as piscinas estarão em funcionamento nem com vaga
              nesse dia.
            </p>
          </AlertDescription>
        </Alert>
      )
    case 'conflict':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Já existe pagamento ou cobrança nesta data</AlertTitle>
          <AlertDescription>
            {state.names.length > 0 ? (
              <>
                <p>Para estas pessoas já existe um pagamento ou uma cobrança em andamento:</p>
                <ul className="list-disc pl-5">
                  {state.names.map((name) => (
                    <li key={name} className="font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Já existe um pagamento ou uma cobrança em andamento para uma das pessoas nesta data.
              </p>
            )}
            <p>Escolha outra data ou volte e retire essas pessoas da seleção.</p>
          </AlertDescription>
        </Alert>
      )
    case 'rejected':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Revise a data</AlertTitle>
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
              Tivemos um problema de comunicação. Verifique sua conexão e tente novamente; a data e
              a seleção foram mantidas.
            </p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )
  }
}
