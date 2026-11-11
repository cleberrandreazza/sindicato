import { CreditCard, Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MethodPickerProps {
  disabled?: boolean
  starting?: 'pix' | 'card' | null
  onPix: () => void
  onCard: () => void
}

export function MethodPicker({ disabled, starting = null, onPix, onCard }: MethodPickerProps) {
  return (
    <section aria-labelledby="payment-methods" className="flex flex-col gap-3">
      <h2 id="payment-methods" className="text-xl leading-tight font-semibold">
        Forma de pagamento
      </h2>
      <p className="text-sm text-muted-foreground">
        Escolha Pix ou cartão. As duas opções são simuladas neste ambiente.
      </p>
      <Button
        type="button"
        size="xl"
        className="w-full justify-start gap-3"
        disabled={disabled}
        aria-disabled={starting !== null || undefined}
        onClick={onPix}
      >
        {starting === 'pix' ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <QrCode aria-hidden="true" />
        )}
        Pagar com Pix (simulado)
      </Button>
      <Button
        type="button"
        size="xl"
        variant="outline"
        className="w-full justify-start gap-3"
        disabled={disabled}
        aria-disabled={starting !== null || undefined}
        onClick={onCard}
      >
        {starting === 'card' ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <CreditCard aria-hidden="true" />
        )}
        Pagar com cartão (simulado)
      </Button>
    </section>
  )
}
