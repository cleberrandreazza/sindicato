import { CheckCircle2, Download, Loader2, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/features/selection/lib/summary'
import type { CreatedOperation } from '@/features/summary/lib/created-operation'
import { formatUsageDate, formatUsageDateBR } from '@/features/usage-date/lib/usage-date'
import { messageOr, readPublicError } from '@/lib/public-error'
import {
  getOperation,
  getReceiptDownloadUrl,
  requestReceiptEmail,
  type DownloadReceiptFn,
  type GetOperationFn,
  type OperationView,
  type RequestEmailFn,
} from '../api/receipt'

interface ReceiptSuccessPageProps {
  operation: CreatedOperation
  onFinish: () => void | Promise<void>
  onSessionExpired?: () => void | Promise<void>
  getState?: GetOperationFn
  download?: DownloadReceiptFn
  requestEmail?: RequestEmailFn
}

/**
 * Sexta etapa: comprovante definitivo após confirmação válida.
 * Pagamento tardio em análise usa `LatePaymentPage` — esta tela só para `confirmed`.
 */
export function ReceiptSuccessPage({
  operation,
  onFinish,
  onSessionExpired,
  getState = getOperation,
  download = getReceiptDownloadUrl,
  requestEmail = requestReceiptEmail,
}: ReceiptSuccessPageProps) {
  const [view, setView] = useState<OperationView | null>(null)
  const [busy, setBusy] = useState<'download' | 'email' | 'refresh' | null>(null)
  const [emailNote, setEmailNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(options: { showBusy?: boolean } = {}) {
    if (options.showBusy) setBusy('refresh')
    setError(null)
    try {
      const next = await getState({
        operationId: operation.operationId,
        accessToken: operation.accessToken,
      })
      setView(next)
    } catch (err) {
      const publicError = readPublicError(err)
      if (publicError?.code === 'operation_not_found') {
        await onSessionExpired?.()
        return
      }
      setError('Não foi possível atualizar o status agora. Tente novamente em instantes.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation.operationId])

  const receiptNumber = view?.receipt?.receiptNumber ?? view?.receiptNumber
  const emailStatus = view?.notifications.find((n) => n.channel === 'email')?.status
  const whatsappStatus = view?.notifications.find((n) => n.channel === 'whatsapp')?.status
  const method = view?.payment?.method
  const fileReady = view?.receipt?.fileReady === true

  async function handleDownload() {
    setBusy('download')
    setError(null)
    try {
      const result = await download({
        operationId: operation.operationId,
        accessToken: operation.accessToken,
      })
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      const publicError = readPublicError(err)
      setError(
        messageOr(
          publicError ?? { code: 'x' },
          'Não foi possível baixar o comprovante agora. Tente novamente em instantes.',
        ),
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleEmail() {
    setBusy('email')
    setError(null)
    setEmailNote(null)
    try {
      await requestEmail({
        operationId: operation.operationId,
        accessToken: operation.accessToken,
      })
      setEmailNote(
        'Solicitamos o envio do comprovante por e-mail (simulado neste ambiente). Nada de cobrança real.',
      )
      await refresh()
    } catch (err) {
      const publicError = readPublicError(err)
      if (publicError?.code === 'email_already_sent') {
        setEmailNote('O comprovante já foi enviado por e-mail.')
      } else if (publicError?.code === 'email_in_progress') {
        setEmailNote('O envio do e-mail já está em andamento.')
      } else {
        setEmailNote(
          'Seu pagamento foi confirmado, mas não conseguimos enviar o e-mail agora. Seu comprovante continua disponível para download.',
        )
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <JourneyLayout
      eyebrow="Etapa 6 · Comprovante"
      title="Pagamento confirmado!"
      description="Seu pagamento foi recebido e sua utilização das piscinas está confirmada."
    >
      <div className="flex flex-col gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Utilização confirmada</AlertTitle>
          <AlertDescription>
            <p>
              Este ambiente usa notificações <strong>simuladas</strong>. O comprovante PDF é gerado
              no backend; o e-mail usa o provedor mockado (não há envio real até configurar o
              provedor).
            </p>
          </AlertDescription>
        </Alert>

        <section
          aria-labelledby="receipt-summary"
          className="rounded-2xl border bg-card p-4"
          data-testid="receipt-summary"
        >
          <h2 id="receipt-summary" className="sr-only">
            Dados do comprovante
          </h2>
          <dl className="flex flex-col gap-3 text-base">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Comprovante</dt>
              <dd className="font-semibold tabular-nums">
                {receiptNumber ?? (busy === 'refresh' ? 'Carregando…' : '—')}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Data de utilização</dt>
              <dd className="text-right font-semibold">
                {formatUsageDateBR(operation.usageDate)}
                <span className="block text-sm font-normal text-muted-foreground">
                  {formatUsageDate(operation.usageDate)}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Valor pago</dt>
              <dd className="text-2xl font-bold text-primary">
                {formatBRL(operation.totalAmountCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Método</dt>
              <dd className="font-semibold">
                {method === 'pix' ? 'Pix' : method === 'card' ? 'Cartão' : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="font-semibold">Pagamento confirmado</dd>
            </div>
          </dl>
        </section>

        {emailStatus === 'failed' ? (
          <Alert variant="warning" role="status">
            <Mail aria-hidden="true" />
            <AlertTitle>E-mail não enviado</AlertTitle>
            <AlertDescription>
              <p>
                Seu pagamento foi confirmado, mas não conseguimos enviar o e-mail agora. Seu
                comprovante continua disponível para download.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {emailStatus === 'sent' ? (
          <p className="text-sm text-muted-foreground" role="status">
            E-mail do comprovante registrado como enviado pelo provedor mockado.
          </p>
        ) : null}

        {whatsappStatus === 'not_configured' ? (
          <p className="text-sm text-muted-foreground">
            WhatsApp: canal preparado na arquitetura, ainda sem provedor conectado (nenhuma mensagem
            foi enviada).
          </p>
        ) : null}

        {emailNote ? (
          <p className="text-sm text-muted-foreground" role="status">
            {emailNote}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="button"
          size="xl"
          className="w-full"
          disabled={busy !== null}
          aria-disabled={busy !== null || undefined}
          onClick={() => void handleDownload()}
        >
          {busy === 'download' ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {fileReady ? 'Baixar comprovante PDF' : 'Preparar / baixar comprovante PDF'}
        </Button>

        <Button
          type="button"
          size="xl"
          variant="outline"
          className="w-full"
          disabled={busy !== null || emailStatus === 'sent' || emailStatus === 'pending'}
          aria-disabled={
            busy !== null || emailStatus === 'sent' || emailStatus === 'pending' || undefined
          }
          onClick={() => void handleEmail()}
        >
          {busy === 'email' ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Mail aria-hidden="true" />
          )}
          Enviar comprovante por e-mail
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-11 self-start"
          onClick={() => void refresh()}
        >
          Atualizar status
        </Button>

        <Button
          type="button"
          variant="outline"
          size="xl"
          className="w-full"
          onClick={() => void onFinish()}
        >
          Voltar ao início
        </Button>
      </div>
    </JourneyLayout>
  )
}
