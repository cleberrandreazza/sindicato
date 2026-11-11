/**
 * IDEMPOTÊNCIA DA CRIAÇÃO DA OPERAÇÃO
 *
 * O navegador gera um `requestId` (UUID) por tentativa lógica de confirmação e o reenvia, sem
 * trocá-lo, quando não sabe o resultado da primeira chamada. Aqui ficam as peças puras:
 *
 * - formato do `requestId`;
 * - `requestKeyHash`: o que se guarda no banco (nunca o `requestId` em si);
 * - derivação DETERMINÍSTICA do `accessToken`, para que a repetição da mesma solicitação
 *   devolva o MESMO token sem que ele precise ser guardado em claro.
 *
 * Só usa Web Crypto, disponível no runtime padrão do Convex.
 */

const encoder = new TextEncoder()

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tamanho de um UUID textual. */
export const REQUEST_ID_LENGTH = 36

/** Segredo curto demais não protege o token derivado. */
export const MIN_TOKEN_SECRET_LENGTH = 32

/** `requestId` aceito: UUID textual (36 caracteres). Qualquer outra coisa é recusada. */
export function isValidRequestId(value: string): boolean {
  return value.length === REQUEST_ID_LENGTH && REQUEST_ID_PATTERN.test(value)
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Chave de idempotência persistida: SHA-256 de `memberId` + `requestId` com separação de
 * domínio. Inclui o associado, então o mesmo UUID usado por dois associados gera chaves
 * diferentes (sem acesso cruzado), e o `requestId` não pode ser recuperado a partir do banco.
 * O `requestId` tem 122 bits aleatórios, o que torna um hash simples adequado aqui.
 */
export async function hashRequestKey(memberId: string, requestId: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(`request-key|v1|${memberId}|${requestId}`),
    ),
  )
}

/**
 * Token de acesso da operação, derivado por HMAC-SHA256.
 *
 * O `requestId` NUNCA é o segredo: o segredo é `secret` (variável do deployment, jamais enviada
 * ao navegador), e a mensagem vincula o token à operação, ao associado e à solicitação. Quem
 * conhece só o `requestId` não consegue calcular o token. Mesma entrada, mesmo token (64 hex).
 */
export async function deriveAccessToken(
  secret: string,
  input: { operationId: string; memberId: string; requestId: string },
): Promise<string> {
  if (secret.length < MIN_TOKEN_SECRET_LENGTH) {
    throw new Error(
      `OPERATION_TOKEN_SECRET ausente ou curto demais (mínimo de ${MIN_TOKEN_SECRET_LENGTH} caracteres).`,
    )
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const message = `access-token|v1|${input.operationId}|${input.memberId}|${input.requestId}`
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/**
 * Segredos de derivação, do mais novo para o mais antigo.
 *
 * ROTAÇÃO: para trocar o segredo, copie o valor atual de `OPERATION_TOKEN_SECRET` para
 * `OPERATION_TOKEN_SECRET_PREVIOUS` e grave o novo em `OPERATION_TOKEN_SECRET`. Operações novas
 * usam o segredo novo; a repetição de uma solicitação antiga testa os segredos em ordem e devolve
 * o token cujo hash confere com o guardado. Depois que o prazo de todas as operações pendentes
 * passou (15 minutos), `..._PREVIOUS` pode ser removido. Sem a rotação, trocar o segredo apenas
 * impede recuperar operações criadas antes da troca (a repetição falha com
 * `operation_not_recoverable`); tokens já entregues continuam válidos, pois o banco guarda o hash.
 * Devolve lista vazia se o segredo atual estiver ausente ou curto (falha fechada).
 */
export function readTokenSecrets(env: Record<string, string | undefined>): string[] {
  const current = env.OPERATION_TOKEN_SECRET ?? ''
  if (current.length < MIN_TOKEN_SECRET_LENGTH) return []
  const previous = env.OPERATION_TOKEN_SECRET_PREVIOUS ?? ''
  return previous.length >= MIN_TOKEN_SECRET_LENGTH ? [current, previous] : [current]
}
