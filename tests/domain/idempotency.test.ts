import { describe, expect, it } from 'vitest'
import {
  deriveAccessToken,
  hashRequestKey,
  isValidRequestId,
  readTokenSecrets,
} from '../../convex/domain/idempotency'
import { hashAccessToken } from '../../convex/domain/privacy'

const SECRET = 'segredo-de-token-de-teste-com-mais-de-32-caracteres'
const OTHER_SECRET = 'outro-segredo-de-token-com-mais-de-32-caracteres!'
const REQUEST_ID = '3f2b8a52-6c1d-4e0f-9a7b-1d2c3e4f5a6b'
const input = { operationId: 'op-1', memberId: 'member-1', requestId: REQUEST_ID }

describe('isValidRequestId', () => {
  it('aceita UUID textual (maiúsculas e minúsculas)', () => {
    expect(isValidRequestId(REQUEST_ID)).toBe(true)
    expect(isValidRequestId(REQUEST_ID.toUpperCase())).toBe(true)
  })

  it('recusa vazio, tamanho errado, caracteres estranhos e textos enormes', () => {
    for (const value of [
      '',
      'abc',
      REQUEST_ID.slice(1),
      `${REQUEST_ID}0`,
      REQUEST_ID.replaceAll('-', ''),
      '3f2b8a52-6c1d-4e0f-9a7b-1d2c3e4f5a6z',
      ' 3f2b8a52-6c1d-4e0f-9a7b-1d2c3e4f5a6',
      'x'.repeat(5000),
      '../../etc/passwd'.padEnd(36, 'a'),
    ]) {
      expect(isValidRequestId(value)).toBe(false)
    }
  })
})

describe('hashRequestKey', () => {
  it('é determinístico e não contém o requestId', async () => {
    const a = await hashRequestKey('member-1', REQUEST_ID)
    expect(a).toBe(await hashRequestKey('member-1', REQUEST_ID))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain(REQUEST_ID)
    expect(a).not.toContain(REQUEST_ID.replaceAll('-', ''))
  })

  it('é vinculado ao associado e ao requestId', async () => {
    const base = await hashRequestKey('member-1', REQUEST_ID)
    expect(await hashRequestKey('member-2', REQUEST_ID)).not.toBe(base)
    expect(await hashRequestKey('member-1', REQUEST_ID.replace('3f2b', '4f2b'))).not.toBe(base)
  })
})

describe('deriveAccessToken', () => {
  it('é determinístico: mesma entrada, mesmo token (64 hex)', async () => {
    const token = await deriveAccessToken(SECRET, input)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(await deriveAccessToken(SECRET, input)).toBe(token)
  })

  it('muda com o segredo, a operação, o associado e o requestId', async () => {
    const base = await deriveAccessToken(SECRET, input)
    expect(await deriveAccessToken(OTHER_SECRET, input)).not.toBe(base)
    expect(await deriveAccessToken(SECRET, { ...input, operationId: 'op-2' })).not.toBe(base)
    expect(await deriveAccessToken(SECRET, { ...input, memberId: 'member-2' })).not.toBe(base)
    expect(
      await deriveAccessToken(SECRET, { ...input, requestId: REQUEST_ID.replace('3f2b', '4f2b') }),
    ).not.toBe(base)
  })

  it('o requestId sozinho não permite calcular o token (nem por hash simples)', async () => {
    const token = await deriveAccessToken(SECRET, input)
    expect(token).not.toBe(await hashAccessToken(REQUEST_ID))
    expect(token).not.toBe(await hashRequestKey('member-1', REQUEST_ID))
    expect(token).not.toContain(REQUEST_ID.replaceAll('-', ''))
  })

  it('recusa segredo ausente ou curto demais', async () => {
    await expect(deriveAccessToken('', input)).rejects.toThrow(/OPERATION_TOKEN_SECRET/)
    await expect(deriveAccessToken('curto', input)).rejects.toThrow(/OPERATION_TOKEN_SECRET/)
  })
})

describe('readTokenSecrets (rotação)', () => {
  it('só o atual: lista com um segredo', () => {
    expect(readTokenSecrets({ OPERATION_TOKEN_SECRET: SECRET })).toEqual([SECRET])
  })

  it('com o anterior: o novo vem primeiro', () => {
    expect(
      readTokenSecrets({
        OPERATION_TOKEN_SECRET: SECRET,
        OPERATION_TOKEN_SECRET_PREVIOUS: OTHER_SECRET,
      }),
    ).toEqual([SECRET, OTHER_SECRET])
  })

  it('falha fechada: sem segredo atual válido não há nenhum, mesmo com o anterior', () => {
    expect(readTokenSecrets({})).toEqual([])
    expect(readTokenSecrets({ OPERATION_TOKEN_SECRET: 'curto' })).toEqual([])
    expect(readTokenSecrets({ OPERATION_TOKEN_SECRET_PREVIOUS: OTHER_SECRET })).toEqual([])
  })

  it('ignora segredo anterior curto demais', () => {
    expect(
      readTokenSecrets({ OPERATION_TOKEN_SECRET: SECRET, OPERATION_TOKEN_SECRET_PREVIOUS: 'x' }),
    ).toEqual([SECRET])
  })
})
