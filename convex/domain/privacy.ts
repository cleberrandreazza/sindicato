import { normalizeCpf } from './cpf'

/**
 * Utilitários de privacidade. Usam apenas Web Crypto, disponível no runtime padrão
 * do Convex (não é necessário `"use node"`).
 */

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * HMAC-SHA256 do CPF normalizado. O CPF tem espaço de busca pequeno, então um hash
 * simples seria reversível por força bruta; o segredo (pepper) impede isso.
 * O segredo vem de `CPF_HASH_SECRET` (variável do deployment Convex).
 */
export async function hashCpf(cpf: string, secret: string): Promise<string> {
  if (secret.length < 16) {
    throw new Error('CPF_HASH_SECRET ausente ou curto demais (mínimo de 16 caracteres).')
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeCpf(cpf)))
  return toHex(signature)
}

/** Token aleatório (256 bits) usado como credencial de acesso a uma operação. */
export function generateAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 do token. Apenas o hash é persistido; o token original vai somente ao navegador. */
export async function hashAccessToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)))
}

/** `maria@example.com` -> `m***@example.com` */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

/** Mantém apenas os quatro últimos dígitos: `+5511900000001` -> `**********0001` */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`
}
