import type { PixQrCode, TransactionStatus } from '../../domain/statuses'
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

/** Token de cartão que simula aprovação imediata. */
export const MOCK_CARD_TOKEN_APPROVED = 'tok_mock_approved'
/** Token de cartão que simula recusa. */
export const MOCK_CARD_TOKEN_DECLINED = 'tok_mock_declined'
/** Token de cartão que simula cobrança pendente (ex.: aguardando 3-D Secure). */
export const MOCK_CARD_TOKEN_PENDING = 'tok_mock_pending'
/** Token de cartão que simula indisponibilidade do provedor. */
export const MOCK_CARD_TOKEN_UNAVAILABLE = 'tok_mock_unavailable'
/** Valor esperado no cabeçalho `x-mock-signature` das confirmações simuladas. */
export const MOCK_WEBHOOK_SIGNATURE = 'mock-signature'

/**
 * Prefixo do "copia e cola" do mock. Um Pix real é um payload EMV que começa com `000201`; este
 * texto deliberadamente não segue esse formato e não pode ser interpretado por nenhum app
 * bancário como cobrança.
 */
export const MOCK_PIX_CODE_PREFIX = 'MOCK-PIX-NAO-PAGAVEL:'

/**
 * Placeholder visual do QR Code: um desenho estático com a legenda "DEMONSTRAÇÃO". Não codifica
 * nada e não é escaneável.
 */
const MOCK_QR_PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  '<rect width="200" height="200" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="4" stroke-dasharray="10 6"/>' +
  '<path d="M20 20h50v50H20zM130 20h50v50h-50zM20 130h50v50H20z" fill="none" stroke="#71717a" stroke-width="8"/>' +
  '<text x="100" y="108" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#52525b">DEMONSTRAÇÃO</text>' +
  '<text x="100" y="128" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#71717a">não pagável</text>' +
  '</svg>'

export const MOCK_QR_CODE: PixQrCode = {
  kind: 'placeholder',
  value: `data:image/svg+xml;utf8,${encodeURIComponent(MOCK_QR_PLACEHOLDER_SVG)}`,
}

const MOCK_STATUSES: readonly TransactionStatus[] = [
  'pending',
  'succeeded',
  'failed',
  'canceled',
  'expired',
]

/** FNV-1a de 32 bits em hexadecimal: sufixo curto, estável e não reversível (não é segurança). */
function opaqueSuffix(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').toUpperCase()
}

function isTransactionStatus(value: unknown): value is TransactionStatus {
  return MOCK_STATUSES.some((status) => status === value)
}

/**
 * Provider de pagamento sem estado, para desenvolvimento.
 * O resultado fica codificado no id (`mock_<método>_<resultado>_<idempotencyKey>`),
 * o que torna a criação idempotente (mesma chave, mesmo id) e `getPaymentStatus` determinístico
 * sem armazenamento próprio. Cobranças Pix nascem `pending`; a confirmação é simulada via
 * `processConfirmation` (ver `convex/dev/simulate.ts`).
 *
 * Nenhum dado de cartão existe aqui: só tokens fictícios.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const providerTransactionId = `mock_pix_pending_${input.idempotencyKey}`
    return {
      providerTransactionId,
      status: 'pending',
      amountCents: input.amountCents,
      // Opaco, como o de um provedor real: não embute o id da cobrança nem a chave de idempotência.
      pixCopyPasteCode: `${MOCK_PIX_CODE_PREFIX}${opaqueSuffix(providerTransactionId)}`,
      qrCode: MOCK_QR_CODE,
      expiresAt: input.expiresAt,
    }
  }

  async createCardCharge(input: CreateCardChargeInput): Promise<CardCharge> {
    switch (input.paymentMethodToken) {
      case MOCK_CARD_TOKEN_APPROVED:
        return {
          providerTransactionId: `mock_card_succeeded_${input.idempotencyKey}`,
          status: 'succeeded',
          amountCents: input.amountCents,
          clientSecret: null,
          failureReason: null,
        }
      case MOCK_CARD_TOKEN_DECLINED:
        return {
          providerTransactionId: `mock_card_failed_${input.idempotencyKey}`,
          status: 'failed',
          amountCents: input.amountCents,
          clientSecret: null,
          failureReason: 'card_declined',
        }
      case MOCK_CARD_TOKEN_PENDING:
        return {
          providerTransactionId: `mock_card_pending_${input.idempotencyKey}`,
          status: 'pending',
          amountCents: input.amountCents,
          clientSecret: `mock_secret_${input.idempotencyKey}`,
          failureReason: null,
        }
      case MOCK_CARD_TOKEN_UNAVAILABLE:
        throw new ProviderError('unavailable', 'Provider mock indisponível (simulado).')
      default:
        throw new ProviderError(
          'invalid_request',
          'Token de cartão desconhecido para o provider mock.',
        )
    }
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
