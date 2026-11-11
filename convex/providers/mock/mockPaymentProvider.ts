import type { TransactionStatus } from '../../domain/statuses'
import { ProviderError } from '../errors'
import type {
  CardCharge,
  CreateCardChargeInput,
  CreatePixChargeInput,
  PaymentConfirmation,
  PaymentProvider,
  PaymentStatusResult,
  PixCharge,
  WebhookRequest,
} from '../paymentProvider'

/** Token de cartão que simula aprovação. */
export const MOCK_CARD_TOKEN_APPROVED = 'tok_mock_approved'
/** Token de cartão que simula recusa. */
export const MOCK_CARD_TOKEN_DECLINED = 'tok_mock_declined'
/** Valor esperado no cabeçalho `x-mock-signature` das confirmações simuladas. */
export const MOCK_WEBHOOK_SIGNATURE = 'mock-signature'

const MOCK_STATUSES: readonly TransactionStatus[] = [
  'pending',
  'succeeded',
  'failed',
  'canceled',
  'expired',
]

function isTransactionStatus(value: unknown): value is TransactionStatus {
  return MOCK_STATUSES.some((status) => status === value)
}

/**
 * Provider de pagamento sem estado, para desenvolvimento.
 * O resultado fica codificado no id (`mock_<método>_<resultado>_<idempotencyKey>`),
 * o que torna `getPaymentStatus` determinístico sem armazenamento próprio.
 * Cobranças Pix nascem `pending`; a confirmação é simulada via `processConfirmation`.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const providerTransactionId = `mock_pix_pending_${input.idempotencyKey}`
    return {
      providerTransactionId,
      status: 'pending',
      pixCopyPasteCode: `MOCK-PIX-NAO-PAGAVEL:${providerTransactionId}`,
      expiresAt: input.expiresAt,
    }
  }

  async createCardCharge(input: CreateCardChargeInput): Promise<CardCharge> {
    if (input.paymentMethodToken === MOCK_CARD_TOKEN_APPROVED) {
      return {
        providerTransactionId: `mock_card_succeeded_${input.idempotencyKey}`,
        status: 'succeeded',
        clientSecret: null,
        failureReason: null,
      }
    }
    if (input.paymentMethodToken === MOCK_CARD_TOKEN_DECLINED) {
      return {
        providerTransactionId: `mock_card_failed_${input.idempotencyKey}`,
        status: 'failed',
        clientSecret: null,
        failureReason: 'card_declined',
      }
    }
    throw new ProviderError('invalid_request', 'Token de cartão desconhecido para o provider mock.')
  }

  async getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResult> {
    const match = /^mock_(?:pix|card)_(pending|succeeded|failed)_/.exec(providerTransactionId)
    const status = match?.[1]
    if (!isTransactionStatus(status)) {
      throw new ProviderError('invalid_request', 'Transação desconhecida para o provider mock.')
    }
    return { providerTransactionId, status }
  }

  /**
   * Corpo esperado (JSON): `{ eventId, providerTransactionId, status, amountCents, occurredAt }`
   * com o cabeçalho `x-mock-signature: mock-signature`.
   */
  async processConfirmation(request: WebhookRequest): Promise<PaymentConfirmation> {
    if (request.headers['x-mock-signature'] !== MOCK_WEBHOOK_SIGNATURE) {
      throw new ProviderError('invalid_signature', 'Assinatura inválida.')
    }

    let payload: unknown
    try {
      payload = JSON.parse(request.rawBody)
    } catch {
      throw new ProviderError('invalid_request', 'Corpo da confirmação não é um JSON válido.')
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('eventId' in payload) ||
      !('providerTransactionId' in payload) ||
      !('status' in payload) ||
      !('amountCents' in payload) ||
      !('occurredAt' in payload)
    ) {
      throw new ProviderError('invalid_request', 'Confirmação com campos obrigatórios ausentes.')
    }

    const { eventId, providerTransactionId, status, amountCents, occurredAt } = payload
    if (
      typeof eventId !== 'string' ||
      typeof providerTransactionId !== 'string' ||
      !isTransactionStatus(status) ||
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      typeof occurredAt !== 'number'
    ) {
      throw new ProviderError('invalid_request', 'Confirmação com campos de tipo inválido.')
    }

    return { eventId, providerTransactionId, status, amountCents, occurredAt }
  }
}
