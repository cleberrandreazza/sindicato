export type ProviderErrorCode =
  'configuration' | 'invalid_request' | 'invalid_signature' | 'rejected' | 'unavailable'

/**
 * Erro único que qualquer provider pode lançar. As regras de negócio decidem o que fazer
 * com base em `code` e `retryable`, sem conhecer o provedor concreto.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryable: boolean

  constructor(code: ProviderErrorCode, message: string, options: { retryable?: boolean } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryable = options.retryable ?? code === 'unavailable'
  }
}
