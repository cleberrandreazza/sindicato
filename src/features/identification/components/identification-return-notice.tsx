import { Clock, KeyRound } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ReturnReason } from '../lib/return-reason'

/** Aviso de por que o associado voltou à identificação. Não revela detalhes internos. */
export function IdentificationReturnNotice({ reason }: { reason: ReturnReason }) {
  if (reason === 'sessao-expirada') {
    return (
      <Alert role="alert" variant="warning" className="mb-6">
        <Clock aria-hidden="true" />
        <AlertTitle>Sua identificação expirou</AlertTitle>
        <AlertDescription>
          <p>Por segurança, informe novamente o número da carteirinha e o CPF para continuar.</p>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert role="status" variant="info" className="mb-6">
      <KeyRound aria-hidden="true" />
      <AlertTitle>Identifique-se para continuar</AlertTitle>
      <AlertDescription>
        <p>Para escolher as pessoas, primeiro informe o número da carteirinha e o CPF.</p>
      </AlertDescription>
    </Alert>
  )
}
