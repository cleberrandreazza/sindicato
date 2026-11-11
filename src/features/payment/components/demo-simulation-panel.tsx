import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export type DemoSimulationOutcome = 'approved' | 'declined'

interface DemoSimulationPanelProps {
  busy: boolean
  disabled?: boolean
  onSimulate: (outcome: DemoSimulationOutcome) => void
  errorMessage?: string | null
}

/**
 * Controles exclusivos da demonstração pública. Só devem ser montados quando o backend
 * sinaliza `demoSimulationAllowed` (APP_ENV=demonstration + mock).
 */
export function DemoSimulationPanel({
  busy,
  disabled = false,
  onSimulate,
  errorMessage,
}: DemoSimulationPanelProps) {
  return (
    <section
      aria-labelledby="demo-simulation-title"
      className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-50/80 p-4 dark:bg-amber-950/20"
      data-testid="demo-simulation-panel"
    >
      <Alert variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle id="demo-simulation-title">Ambiente demonstrativo</AlertTitle>
        <AlertDescription>
          <p>
            Nenhum dinheiro será movimentado. Pix e cartão desta tela não são pagáveis. Use os
            botões abaixo apenas para simular a confirmação do provedor nesta demonstração.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="xl"
          className="w-full sm:flex-1"
          disabled={busy || disabled}
          data-testid="demo-simulate-approved"
          onClick={() => onSimulate('approved')}
        >
          {busy ? 'Simulando…' : 'Simular pagamento aprovado'}
        </Button>
        <Button
          type="button"
          size="xl"
          variant="outline"
          className="w-full sm:flex-1"
          disabled={busy || disabled}
          data-testid="demo-simulate-declined"
          onClick={() => onSimulate('declined')}
        >
          Simular pagamento recusado
        </Button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert" data-testid="demo-simulation-error">
          {errorMessage}
        </p>
      ) : null}
    </section>
  )
}
