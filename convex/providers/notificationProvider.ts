/** Dados do comprovante necessários para montar a mensagem. */
export interface ReceiptNotificationContent {
  readonly receiptNumber: string
  readonly memberName: string
  /** `YYYY-MM-DD` */
  readonly usageDate: string
  readonly peopleNames: readonly string[]
  readonly totalAmountCents: number
  /** Instante (ms) da confirmação do pagamento. */
  readonly paidAt: number
  /** Link para o arquivo do comprovante, quando existir. */
  readonly receiptUrl?: string
}

export interface SendReceiptEmailInput {
  readonly to: string
  readonly content: ReceiptNotificationContent
}

export interface SendReceiptWhatsAppInput {
  /** Telefone em formato E.164, ex.: `+5511900000001`. */
  readonly toPhone: string
  readonly content: ReceiptNotificationContent
}

/**
 * Atualização sobre um pagamento em análise (ex.: confirmação tardia). O texto vem pronto de
 * `domain/messages.ts`, de modo que tela, e-mail e WhatsApp digam exatamente a mesma coisa.
 */
export interface PaymentUpdateNotificationContent {
  readonly memberName: string
  /** `YYYY-MM-DD` */
  readonly usageDate: string
  readonly message: string
}

export interface SendPaymentUpdateEmailInput {
  readonly to: string
  readonly content: PaymentUpdateNotificationContent
}

export interface SendPaymentUpdateWhatsAppInput {
  /** Telefone em formato E.164. */
  readonly toPhone: string
  readonly content: PaymentUpdateNotificationContent
}

export interface NotificationSendResult {
  readonly providerMessageId: string
}

/**
 * Falhas são sinalizadas com `ProviderError` (`retryable` indica se vale tentar de novo).
 * Cada canal é independente: falha em um não impede o envio pelo outro.
 */
export interface NotificationProvider {
  readonly name: string
  sendReceiptEmail(input: SendReceiptEmailInput): Promise<NotificationSendResult>
  sendReceiptWhatsApp(input: SendReceiptWhatsAppInput): Promise<NotificationSendResult>
  sendPaymentUpdateEmail(input: SendPaymentUpdateEmailInput): Promise<NotificationSendResult>
  sendPaymentUpdateWhatsApp(input: SendPaymentUpdateWhatsAppInput): Promise<NotificationSendResult>
}
