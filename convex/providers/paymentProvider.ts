import type { PaymentProviderName, PixQrCode, TransactionStatus } from '../domain/statuses'

/** Campos comuns a qualquer cobrança. O valor é sempre calculado pelo backend. */
export interface CreateChargeBase {
  /** Id da operação, enviado como metadado ao provedor. */
  readonly operationId: string
  /** Garante que repetir a chamada não gere cobrança duplicada. */
  readonly idempotencyKey: string
  /** Inteiro, em centavos (BRL). */
  readonly amountCents: number
  readonly description: string
  /** Instante limite (ms) para o pagamento; deve coincidir com `expiresAt` da operação. */
  readonly expiresAt: number
}

export type CreatePixChargeInput = CreateChargeBase

export interface CreateCardChargeInput extends CreateChargeBase {
  /**
   * Token gerado no navegador pelo SDK do provedor. O backend nunca recebe nem armazena
   * dados do cartão (escopo PCI mínimo).
   */
  readonly paymentMethodToken: string
}

export interface PixCharge {
  readonly providerTransactionId: string
  /** Pix nasce `pending`; o recebimento chega depois, por notificação do provedor. */
  readonly status: TransactionStatus
  /** Valor cobrado, em centavos, conforme o provedor. O backend confere com a operação. */
  readonly amountCents: number
  /** Payload "copia e cola" do Pix. */
  readonly pixCopyPasteCode: string
  /** QR Code para exibição (imagem do provedor ou, no mock, um placeholder não escaneável). */
  readonly qrCode: PixQrCode
  readonly expiresAt: number
}

export interface CardCharge {
  readonly providerTransactionId: string
  /**
   * `succeeded`/`failed` quando o provedor decide na própria criação; `pending` quando depende
   * de confirmação posterior (ex.: 3-D Secure). Qualquer resultado entra no backend pela mesma
   * porta de eventos (`providerEvents`), então prazo e valor continuam sendo verificados.
   */
  readonly status: TransactionStatus
  /** Valor cobrado, em centavos, conforme o provedor. O backend confere com a operação. */
  readonly amountCents: number
  /** Presente quando o provedor exige confirmação no navegador (ex.: 3-D Secure). */
  readonly clientSecret: string | null
  readonly failureReason: string | null
}

export interface PaymentStatusResult {
  readonly providerTransactionId: string
  readonly status: TransactionStatus
}

/** Requisição bruta recebida do provedor (ex.: webhook em uma HTTP action). */
export interface WebhookRequest {
  /** Corpo exatamente como recebido; necessário para verificar assinatura. */
  readonly rawBody: string
  /** Cabeçalhos com nomes em minúsculas. */
  readonly headers: Readonly<Record<string, string>>
}

/** Confirmação já autenticada e normalizada, independente do formato do provedor. */
export interface PaymentConfirmation {
  /** Identificador do evento no provedor, usado para idempotência. */
  readonly eventId: string
  readonly providerTransactionId: string
  readonly status: TransactionStatus
  /** Valor efetivamente cobrado; o backend o compara com o valor da operação. */
  readonly amountCents: number
  /** Instante (ms) do evento, segundo o provedor. */
  readonly occurredAt: number
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>
  createCardCharge(input: CreateCardChargeInput): Promise<CardCharge>
  getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResult>
  /**
   * Autentica (assinatura) e normaliza uma notificação do provedor.
   * Lança `ProviderError('invalid_signature')` se a autenticidade não puder ser comprovada.
   * Não altera nenhum dado: aplicar a confirmação é responsabilidade do backend.
   */
  processConfirmation(request: WebhookRequest): Promise<PaymentConfirmation>
}
