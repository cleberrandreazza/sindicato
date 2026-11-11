import { Clock, SearchX, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { IdentificationState } from '../hooks/use-identification'

type NoticeState = Extract<
  IdentificationState,
  { status: 'not_found' | 'rate_limited' | 'unavailable' }
>

interface IdentificationNoticeProps {
  state: NoticeState
  onRetry: () => void
}

/**
 * Aviso exibido acima do formulário quando a consulta não resultou em identificação.
 * Recebe o foco ao aparecer, para que leitores de tela e teclado percebam a mudança.
 * Os textos não revelam detalhes internos do backend.
 */
export function IdentificationNotice({ state, onRetry }: IdentificationNoticeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  switch (state.status) {
    case 'not_found':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-6">
          <SearchX aria-hidden="true" />
          <AlertTitle>Não encontramos o seu cadastro</AlertTitle>
          <AlertDescription>
            <p>
              Confira o número da carteirinha e o CPF e tente novamente. Se os dados estiverem
              corretos e o problema continuar, procure o Sindicomerciários.
            </p>
          </AlertDescription>
        </Alert>
      )
    case 'rate_limited':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="warning" className="mb-6">
          <Clock aria-hidden="true" />
          <AlertTitle>Aguarde um pouco</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
          </AlertDescription>
        </Alert>
      )
    case 'unavailable':
      return (
        <Alert ref={ref} tabIndex={-1} role="alert" variant="destructive" className="mb-6">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Não foi possível consultar agora</AlertTitle>
          <AlertDescription>
            <p>
              Tivemos um problema de comunicação. Verifique sua conexão e tente novamente; os dados
              que você digitou foram mantidos.
            </p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )
  }
}
