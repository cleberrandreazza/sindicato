import { Check, Copy, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PaymentView } from '../../../../convex/payments/chargeView'

interface PixPanelProps {
  payment: PaymentView
  refreshing?: boolean
  onRefresh: () => void
  /** Substitui `navigator.clipboard.writeText` (testes). */
  copyText?: (value: string) => Promise<void>
}

export function PixPanel({ payment, refreshing, onRefresh, copyText }: PixPanelProps) {
  const [copied, setCopied] = useState(false)
  const pix = payment.pix

  async function copyCode() {
    if (!pix?.copyPasteCode) return
    try {
      const write = copyText ?? ((value: string) => navigator.clipboard.writeText(value))
      await write(pix.copyPasteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      // Fallback: selecionar o texto do campo.
      const field = document.getElementById('pix-copy-paste') as HTMLTextAreaElement | null
      field?.select()
    }
  }

  return (
    <section
      aria-labelledby="pix-panel-title"
      className="flex flex-col gap-4"
      data-testid="pix-panel"
    >
      <h2 id="pix-panel-title" className="text-xl leading-tight font-semibold">
        Pix simulado
      </h2>
      <p className="text-base text-muted-foreground">{payment.message}</p>

      {pix ? (
        <>
          <div className="mx-auto w-full max-w-[220px]">
            <img
              src={pix.qrCode.value}
              alt="QR Code demonstrativo — não pagável"
              width={220}
              height={220}
              className="aspect-square w-full rounded-2xl border bg-card"
            />
            <p className="mt-2 text-center text-sm text-muted-foreground">
              QR Code de demonstração — não é escaneável nem pagável.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pix-copy-paste" className="text-base font-medium">
              Código Pix copia e cola (simulado)
            </label>
            <textarea
              id="pix-copy-paste"
              readOnly
              rows={3}
              value={pix.copyPasteCode}
              className="w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all"
            />
            <Button type="button" size="xl" className="w-full" onClick={() => void copyCode()}>
              {copied ? (
                <>
                  <Check aria-hidden="true" />
                  Código copiado
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" />
                  Copiar código
                </>
              )}
            </Button>
          </div>
        </>
      ) : null}

      {payment.status === 'pending' ? (
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="w-full"
          aria-disabled={refreshing || undefined}
          onClick={onRefresh}
        >
          {refreshing ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Atualizando…
            </>
          ) : (
            'Atualizar status'
          )}
        </Button>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Em desenvolvimento, a confirmação do Pix simulado passa pelo backend (
        <code className="text-xs">dev/simulate:simulatePayment</code>
        ), nunca por um botão de &quot;marcar como pago&quot; no navegador.
      </p>
    </section>
  )
}
