import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { LookupResult } from '../../src/features/identification/api/lookup-member'
import { formatCpf, isCpfComplete } from '../../src/features/identification/lib/cpf-mask'
import {
  firstInvalidField,
  sanitizeMembershipNumber,
  validateIdentificationForm,
} from '../../src/features/identification/lib/form'
import {
  interpretLookupError,
  interpretLookupResult,
} from '../../src/features/identification/lib/lookup-outcome'
import { TimeoutError, withTimeout } from '../../src/lib/with-timeout'

describe('máscara de CPF', () => {
  it('formata progressivamente', () => {
    expect(formatCpf('')).toBe('')
    expect(formatCpf('1')).toBe('1')
    expect(formatCpf('123')).toBe('123')
    expect(formatCpf('1234')).toBe('123.4')
    expect(formatCpf('123456')).toBe('123.456')
    expect(formatCpf('1234567')).toBe('123.456.7')
    expect(formatCpf('123456789')).toBe('123.456.789')
    expect(formatCpf('1234567890')).toBe('123.456.789-0')
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
  })

  it('ignora caracteres não numéricos e corta no 11º dígito', () => {
    expect(formatCpf('123.456.789-09')).toBe('123.456.789-09')
    expect(formatCpf('abc123 456x789!09')).toBe('123.456.789-09')
    expect(formatCpf('123456789012345')).toBe('123.456.789-01')
  })

  it('reformatar um valor já formatado não o altera (idempotente)', () => {
    const once = formatCpf('12345678909')
    expect(formatCpf(once)).toBe(once)
  })

  it('apagar o último dígito remove a pontuação sobrando', () => {
    expect(formatCpf('123.456.789-')).toBe('123.456.789')
    expect(formatCpf('123.')).toBe('123')
  })

  it('completude considera só dígitos', () => {
    expect(isCpfComplete('123.456.789-09')).toBe(true)
    expect(isCpfComplete('123.456.789-0')).toBe(false)
    expect(isCpfComplete('')).toBe(false)
  })
})

describe('formulário', () => {
  it('carteirinha: mantém só letras e números, sem espaços, e limita o tamanho', () => {
    expect(sanitizeMembershipNumber(' 10 00-01 ')).toBe('100001')
    expect(sanitizeMembershipNumber('ab12')).toBe('ab12')
    expect(sanitizeMembershipNumber('1'.repeat(40))).toHaveLength(20)
  })

  it('campos vazios geram erro em ambos', () => {
    const errors = validateIdentificationForm({ membershipNumber: '', cpf: '' })
    expect(errors.membershipNumber).toBe('Informe o número da carteirinha.')
    expect(errors.cpf).toBe('Informe o CPF.')
    expect(firstInvalidField(errors)).toBe('membershipNumber')
  })

  it('CPF incompleto gera erro, mas CPF com 11 dígitos não é julgado aqui (dígitos verificadores são do backend)', () => {
    expect(validateIdentificationForm({ membershipNumber: '1', cpf: '123.4' }).cpf).toBe(
      'O CPF deve ter 11 números.',
    )
    expect(validateIdentificationForm({ membershipNumber: '1', cpf: '111.111.111-11' })).toEqual({})
  })

  it('sem erros não há campo para focar', () => {
    expect(firstInvalidField({})).toBeNull()
    expect(firstInvalidField({ cpf: 'x' })).toBe('cpf')
  })
})

function lookupResult(overrides: Partial<LookupResult> = {}): LookupResult {
  return {
    member: {
      id: 'member-1' as Id<'members'>,
      membershipNumber: '100001',
      status: 'active',
      cpfMasked: '***.***.***-08',
    },
    holder: {
      linkId: 'link-0' as Id<'householdLinks'>,
      name: 'Ana Teste Almeida',
      role: 'holder',
      status: 'active',
      selectable: true,
    },
    dependents: [
      {
        linkId: 'link-1' as Id<'householdLinks'>,
        name: 'Bruno',
        role: 'spouse',
        status: 'active',
        selectable: true,
      },
      {
        linkId: 'link-2' as Id<'householdLinks'>,
        name: 'Helena',
        role: 'parent',
        status: 'inactive',
        selectable: false,
      },
    ],
    session: { token: 'tok', expiresAt: 123 },
    ...overrides,
  }
}

describe('interpretação da resposta do backend', () => {
  it('cadastro ativo vira identificação, contando só quem o backend marcou como selecionável', () => {
    const outcome = interpretLookupResult(lookupResult())
    expect(outcome).toEqual({
      kind: 'identified',
      member: {
        memberId: 'member-1',
        membershipNumber: '100001',
        cpfMasked: '***.***.***-08',
        holderName: 'Ana Teste Almeida',
        selectablePeopleCount: 2,
        people: [
          { linkId: 'link-0', name: 'Ana Teste Almeida', kind: 'holder', selectable: true },
          { linkId: 'link-1', name: 'Bruno', kind: 'dependent', selectable: true },
          { linkId: 'link-2', name: 'Helena', kind: 'dependent', selectable: false },
        ],
        session: { token: 'tok', expiresAt: 123 },
      },
    })
  })

  it('cadastro inativo usa a mensagem do backend e não expõe prova de identificação', () => {
    const outcome = interpretLookupResult(
      lookupResult({
        member: {
          id: 'member-1' as Id<'members'>,
          membershipNumber: '900004',
          status: 'inactive',
          cpfMasked: '***.***.***-18',
        },
        session: null,
        message: 'O cadastro do titular não está ativo.',
      }),
    )
    expect(outcome).toEqual({
      kind: 'inactive',
      membershipNumber: '900004',
      message: 'O cadastro do titular não está ativo.',
    })
    expect(JSON.stringify(outcome)).not.toContain('tok')
  })

  it('cadastro ativo sem prova de identificação não avança', () => {
    expect(interpretLookupResult(lookupResult({ session: null }))).toEqual({
      kind: 'unavailable',
    })
  })
})

function publicError(code: string, message = 'texto do backend') {
  return new ConvexError({ code, message })
}

describe('interpretação de erros', () => {
  it('identification_failed vira não encontrado (carteirinha e CPF não são distinguidos)', () => {
    expect(interpretLookupError(publicError('identification_failed'))).toEqual({
      kind: 'not_found',
    })
  })

  it('erros de formato vão para o campo correspondente, com o texto do backend', () => {
    expect(interpretLookupError(publicError('invalid_cpf', 'Informe um CPF válido.'))).toEqual({
      kind: 'invalid_input',
      fields: { cpf: 'Informe um CPF válido.' },
    })
    expect(interpretLookupError(publicError('invalid_membership_number'))).toEqual({
      kind: 'invalid_input',
      fields: { membershipNumber: 'texto do backend' },
    })
  })

  it('texto ausente usa mensagem de reserva', () => {
    const outcome = interpretLookupError(new ConvexError({ code: 'invalid_cpf' }))
    expect(outcome).toEqual({
      kind: 'invalid_input',
      fields: { cpf: 'Confira o CPF informado.' },
    })
  })

  it('limite de tentativas', () => {
    expect(interpretLookupError(publicError('too_many_attempts', 'Muitas tentativas.'))).toEqual({
      kind: 'rate_limited',
      message: 'Muitas tentativas.',
    })
  })

  it.each([
    ['service_unavailable', publicError('service_unavailable')],
    ['código desconhecido', publicError('algo_novo')],
    ['erro comum', new Error('Server Error: stack interna com detalhes')],
    ['TypeError de rede', new TypeError('Failed to fetch')],
    ['dado sem código', new ConvexError('texto')],
    ['valor qualquer', 'boom'],
    ['null', null],
  ])('%s vira indisponível, sem repassar detalhes', (_name, error) => {
    expect(interpretLookupError(error)).toEqual({ kind: 'unavailable' })
  })
})

describe('withTimeout', () => {
  it('resolve quando a promessa termina a tempo', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('repassa a rejeição original', async () => {
    const error = new Error('x')
    await expect(withTimeout(Promise.reject(error), 1000)).rejects.toBe(error)
  })

  it('rejeita com TimeoutError quando demora demais', async () => {
    vi.useFakeTimers()
    try {
      const pending = withTimeout(new Promise<never>(() => {}), 500)
      const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError)
      await vi.advanceTimersByTimeAsync(501)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('TimeoutError vira indisponível', () => {
    expect(interpretLookupError(new TimeoutError())).toEqual({ kind: 'unavailable' })
  })
})
