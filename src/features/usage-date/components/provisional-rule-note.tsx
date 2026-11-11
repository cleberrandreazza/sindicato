import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Aviso sempre visível: aceitar "qualquer data de hoje em diante" é uma regra PROVISÓRIA de
 * desenvolvimento, enquanto o sindicato não informa dias, horários e limites de antecedência.
 * Escolher a data não é uma confirmação de que as piscinas funcionam ou têm vaga naquele dia.
 */
export function ProvisionalRuleNote() {
  return (
    <Alert variant="info" data-testid="provisional-rule-note">
      <Info aria-hidden="true" />
      <AlertTitle>Regra provisória</AlertTitle>
      <AlertDescription>
        <p>
          Por enquanto, qualquer data a partir de hoje pode ser escolhida. Isso não confirma que as
          piscinas estarão em funcionamento ou disponíveis nesse dia: os dias e horários de
          funcionamento ainda serão informados pelo Sindicomerciários.
        </p>
      </AlertDescription>
    </Alert>
  )
}
