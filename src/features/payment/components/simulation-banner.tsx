import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** Aviso permanente: nada aqui é cobrança real. */
export function SimulationBanner() {
  return (
    <Alert variant="info" data-testid="simulation-banner">
      <Info aria-hidden="true" />
      <AlertTitle>Pagamento simulado</AlertTitle>
      <AlertDescription>
        <p>
          Este ambiente usa um provedor de pagamento <strong>mockado</strong>. Nenhum Pix real é
          gerado, nenhum cartão é cobrado e nenhum dinheiro é movimentado. A integração com o
          provedor real (Stripe) ainda não está ativa.
        </p>
      </AlertDescription>
    </Alert>
  )
}
