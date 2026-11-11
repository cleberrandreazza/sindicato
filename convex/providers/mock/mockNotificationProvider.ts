import { ProviderError } from '../errors'
import type {
  NotificationProvider,
  NotificationSendResult,
  SendPaymentUpdateEmailInput,
  SendPaymentUpdateWhatsAppInput,
  SendReceiptEmailInput,
  SendReceiptWhatsAppInput,
} from '../notificationProvider'

function assertEmail(to: string): void {
  if (!to.includes('@')) throw new ProviderError('invalid_request', 'E-mail inválido.')
}

function assertE164(phone: string): void {
  if (!/^\+\d{10,15}$/.test(phone)) {
    throw new ProviderError('invalid_request', 'Telefone fora do formato E.164.')
  }
}

/**
 * Não envia nada e não registra destinatários em log (dados pessoais).
 * Apenas devolve um id de mensagem simulado.
 */
export class MockNotificationProvider implements NotificationProvider {
  readonly name = 'mock'

  async sendReceiptEmail({ to }: SendReceiptEmailInput): Promise<NotificationSendResult> {
    assertEmail(to)
    return { providerMessageId: `mock_email_${crypto.randomUUID()}` }
  }

  async sendReceiptWhatsApp({
    toPhone,
  }: SendReceiptWhatsAppInput): Promise<NotificationSendResult> {
    assertE164(toPhone)
    return { providerMessageId: `mock_whatsapp_${crypto.randomUUID()}` }
  }

  async sendPaymentUpdateEmail({
    to,
  }: SendPaymentUpdateEmailInput): Promise<NotificationSendResult> {
    assertEmail(to)
    return { providerMessageId: `mock_email_${crypto.randomUUID()}` }
  }

  async sendPaymentUpdateWhatsApp({
    toPhone,
  }: SendPaymentUpdateWhatsAppInput): Promise<NotificationSendResult> {
    assertE164(toPhone)
    return { providerMessageId: `mock_whatsapp_${crypto.randomUUID()}` }
  }
}
