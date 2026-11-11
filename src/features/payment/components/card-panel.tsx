import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MOCK_CARD_SCENARIOS, type MockCardScenario } from '../lib/mock-card-tokens'

interface CardPanelProps {
  starting?: boolean
  onSimulate: (scenario: MockCardScenario, token: string) => void
  onBack: () => void
}

/**
 * Não coleta número de cartão, validade nem CVV. Só dispara tokens fictícios do mock, com
 * rótulos explícitos de simulação.
 */
export function CardPanel({ starting, onSimulate, onBack }: CardPanelProps) {
  return (
    <section
      aria-labelledby="card-panel-title"
      className="flex flex-col gap-4"
      data-testid="card-panel"
    >
      <h2 id="card-panel-title" className="text-xl leading-tight font-semibold">
        Cartão simulado
      </h2>
      <p className="text-base text-muted-foreground">
        Não informe dados reais de cartão. Escolha um cenário de simulação. O navegador envia apenas
        um token fictício; nenhum número, CVV ou dado bancário é coletado ou armazenado.
      </p>

      <ul className="flex flex-col gap-3">
        {MOCK_CARD_SCENARIOS.map((item) => (
          <li key={item.scenario}>
            <Button
              type="button"
              size="xl"
              variant={item.scenario === 'approved' ? 'default' : 'outline'}
              className="h-auto w-full flex-col items-start gap-1 py-3 whitespace-normal"
              disabled={starting}
              aria-disabled={starting || undefined}
              onClick={() => onSimulate(item.scenario, item.token)}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                {starting ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : null}
                {item.label}
              </span>
              <span className="text-left text-sm font-normal opacity-90">{item.description}</span>
            </Button>
          </li>
        ))}
      </ul>

      <Button type="button" variant="ghost" size="lg" className="h-11 self-start" onClick={onBack}>
        Voltar às formas de pagamento
      </Button>
    </section>
  )
}
