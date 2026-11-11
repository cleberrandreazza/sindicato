/**
 * Identificador de uma tentativa lógica de confirmação (UUID v4). Preferimos `randomUUID`; ele só
 * existe em contextos seguros (HTTPS/localhost), então, ao testar no celular por HTTP na rede
 * local, caímos em `getRandomValues`, que também é criptograficamente seguro.
 */
export function generateRequestId(): string {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID()

  const bytes = webCrypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // versão 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variante RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
