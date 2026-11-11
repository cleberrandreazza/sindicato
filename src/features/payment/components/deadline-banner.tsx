import { Clock } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useCountdown } from '../hooks/use-countdown'
import { formatDeadline } from '../lib/deadline'

interface DeadlineBannerProps {
  /** Instante oficial (`expiresAt`) calculado pelo backend na criação da operação. */
  expiresAt: number
  nowMs?: () => number
  /** Chamado uma vez quando a contagem zera, para a tela consultar o estado oficial. */
  onExpired?: () => void
}

export function DeadlineBanner({ expiresAt, nowMs, onExpired }: DeadlineBannerProps) {
  const { label, expired, remainingMs } = useCountdown(expiresAt, nowMs)
  const notified = useRef(false)

  useEffect(() => {
    notified.current = false
  }, [expiresAt])

  useEffect(() => {
    if (!expired || !onExpired || notified.current) return
    notified.current = true
    onExpired()
  }, [expired, onExpired])

  if (expired) {
    return (
      <Alert variant="warning" role="status" data-testid="deadline-banner">
        <Clock aria-hidden="true" />
        <AlertTitle>Prazo encerrado</AlertTitle>
        <AlertDescription>
          <p>
            O prazo de 15 minutos terminou ({formatDeadline(expiresAt)}). O sistema consulta o
            estado oficial da operação — não presumimos que o pagamento foi recebido.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert variant="info" role="status" data-testid="deadline-banner">
      <Clock aria-hidden="true" />
      <AlertTitle>
        Tempo restante: <span className="tabular-nums">{label}</span>
      </AlertTitle>
      <AlertDescription>
        <p>
          O prazo de 15 minutos começou quando a operação foi criada ({formatDeadline(expiresAt)}).
          Trocar Pix por cartão ou atualizar a tela não reinicia a contagem.
        </p>
        <p className="sr-only" aria-live="polite">
          {remainingMs <= 60_000 ? `Restam menos de um minuto: ${label}.` : ''}
        </p>
      </AlertDescription>
    </Alert>
  )
}
