import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import { formatDeadline } from '../../src/features/payment/lib/deadline'
import type {
  CreateOperationResult,
  OperationView,
} from '../../src/features/summary/api/create-operation'
import {
  checkRecoveredOperation,
  interpretCreateError,
  interpretCreateResult,
} from '../../src/features/summary/lib/confirmation-outcome'
import { isSameRequest } from '../../src/features/summary/lib/created-operation'
import { generateRequestId } from '../../src/features/summary/lib/request-id'
import { formatUsageDateBR } from '../../src/features/usage-date/lib/usage-date'

const link = (value: string) => value as Id<'householdLinks'>

const result: CreateOperationResult = {
  operationId: 'op-1' as Id<'paymentOperations'>,
  accessToken: 'a'.repeat(64),
  usageDate: '2026-11-20',
  quantity: 2,
  unitAmountCents: 3000,
  totalAmountCents: 6000,
  expiresAt: Date.UTC(2026, 10, 11, 21, 45, 0),
  people: [
    { name: 'Ana Teste', role: 'holder' },
    { name: 'Bruno Teste', role: 'spouse' },
  ],
  reused: false,
}

const publicError = (code: string, extra: Record<string, unknown> = {}) =>
  new ConvexError({ code, message: `texto do backend para ${code}`, ...extra })

describe('generateRequestId', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('gera UUID v4 diferente a cada chamada', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID)
  })

  it('funciona sem crypto.randomUUID (contexto não seguro, ex.: HTTP na rede local)', () => {
    const original = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const a = generateRequestId()
      const b = generateRequestId()
      expect(a).toMatch(UUID)
      expect(b).toMatch(UUID)
      expect(a).not.toBe(b)
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      })
    }
  })
})

describe('isSameRequest', () => {
  const request = {
    requestId: 'id-1',
    usageDate: '2026-11-20',
    linkIds: [link('l1'), link('l2')],
  }

  it('mesma data e mesmas pessoas (em qualquer ordem) é a mesma tentativa', () => {
    expect(isSameRequest(request, '2026-11-20', [link('l1'), link('l2')])).toBe(true)
    expect(isSameRequest(request, '2026-11-20', [link('l2'), link('l1')])).toBe(true)
  })

  it('outra data, outras pessoas ou nenhuma tentativa: não é a mesma', () => {
    expect(isSameRequest(request, '2026-11-21', [link('l1'), link('l2')])).toBe(false)
    expect(isSameRequest(request, '2026-11-20', [link('l1')])).toBe(false)
    expect(isSameRequest(request, '2026-11-20', [link('l1'), link('l3')])).toBe(false)
    expect(isSameRequest(request, '2026-11-20', [link('l1'), link('l2'), link('l3')])).toBe(false)
    expect(isSameRequest(null, '2026-11-20', [link('l1')])).toBe(false)
  })
})

describe('interpretCreateResult', () => {
  it('mantém os valores e o prazo oficiais do backend, sem recalcular', () => {
    const odd: CreateOperationResult = { ...result, totalAmountCents: 7777, expiresAt: 123456789 }
    const outcome = interpretCreateResult(odd)
    expect(outcome).toMatchObject({
      kind: 'created',
      operation: { totalAmountCents: 7777, expiresAt: 123456789, recovered: false },
    })
  })

  it('operação reaproveitada é marcada como recuperada', () => {
    expect(interpretCreateResult({ ...result, reused: true })).toMatchObject({
      operation: { recovered: true },
    })
  })
})

describe('interpretCreateError', () => {
  it('prova inválida ou titular não encontrado pede nova identificação', () => {
    expect(interpretCreateError(publicError('session_invalid'))).toEqual({
      kind: 'session_expired',
    })
    expect(interpretCreateError(publicError('member_not_found'))).toEqual({
      kind: 'session_expired',
    })
  })

  it('seleção inválida: orienta revisar as pessoas, com o texto do backend', () => {
    for (const code of [
      'empty_selection',
      'duplicate_person',
      'link_not_found',
      'link_inactive',
      'member_inactive',
      'invalid_selection',
    ]) {
      expect(interpretCreateError(publicError(code))).toEqual({
        kind: 'rejected',
        reason: 'selection',
        message: `texto do backend para ${code}`,
      })
    }
  })

  it('data inválida ou passada: orienta escolher outra data', () => {
    for (const code of ['invalid_usage_date', 'past_usage_date']) {
      expect(interpretCreateError(publicError(code))).toMatchObject({
        kind: 'rejected',
        reason: 'date',
      })
    }
  })

  it('duplicidade traz só os nomes devolvidos pelo backend (sem ids)', () => {
    const outcome = interpretCreateError(
      publicError('duplicate_usage', {
        names: ['Ana Teste', 'Bruno Teste'],
        linkIds: ['l1', 'l2'],
      }),
    )
    expect(outcome).toEqual({
      kind: 'duplicate',
      names: ['Ana Teste', 'Bruno Teste'],
      message: 'texto do backend para duplicate_usage',
    })
    expect(JSON.stringify(outcome)).not.toContain('l1')
  })

  it('duplicidade sem nomes utilizáveis não inventa nada', () => {
    expect(
      interpretCreateError(publicError('duplicate_usage', { names: [1, '', null] })),
    ).toMatchObject({ kind: 'duplicate', names: [] })
    expect(interpretCreateError(publicError('duplicate_usage'))).toMatchObject({
      kind: 'duplicate',
      names: [],
    })
  })

  it('outras recusas definitivas viram "other"', () => {
    for (const code of [
      'request_id_conflict',
      'invalid_request_id',
      'operation_not_recoverable',
      'too_many_requests',
    ]) {
      expect(interpretCreateError(publicError(code))).toMatchObject({
        kind: 'rejected',
        reason: 'other',
      })
    }
  })

  it('o que não é resposta do backend é resultado DESCONHECIDO, nunca "falhou"', () => {
    expect(
      interpretCreateError(new Error('[CONVEX M(public/payments:createOperation)] Server Error')),
    ).toEqual({ kind: 'unknown' })
    expect(interpretCreateError(new Error('A operação demorou demais para responder.'))).toEqual({
      kind: 'unknown',
    })
    expect(interpretCreateError('estranho')).toEqual({ kind: 'unknown' })
    expect(interpretCreateError(null)).toEqual({ kind: 'unknown' })
    // Mesmo um erro público inesperado (ex.: indisponibilidade) não afirma que nada foi criado.
    expect(interpretCreateError(publicError('service_unavailable'))).toEqual({ kind: 'unknown' })
  })
})

describe('checkRecoveredOperation', () => {
  const view = (patch: Partial<OperationView>): OperationView => ({
    operationId: result.operationId,
    usageDate: '2026-11-20',
    quantity: 2,
    unitAmountCents: 3000,
    totalAmountCents: 6000,
    expiresAt: result.expiresAt,
    operationalStatus: 'awaiting_payment',
    financialStatus: 'unpaid',
    presentation: { code: 'awaiting_payment', message: 'Aguardando a confirmação.' },
    people: [],
    receiptNumber: null,
    receipt: null,
    notifications: [],
    paidAt: null,
    payment: null,
    demoSimulationAllowed: false,
    ...patch,
  })

  it('pendente e sem pagamento é utilizável', () => {
    expect(checkRecoveredOperation(view({}))).toEqual({ usable: true })
  })

  it('expirada: não utilizável, com o texto oficial', () => {
    expect(
      checkRecoveredOperation(
        view({
          operationalStatus: 'expired',
          presentation: { code: 'expired', message: 'O prazo de 15 minutos terminou.' },
        }),
      ),
    ).toEqual({ usable: false, expired: true, message: 'O prazo de 15 minutos terminou.' })
  })

  it('paga, em análise ou rejeitada: não utilizável e não "expirada"', () => {
    for (const patch of [
      { financialStatus: 'paid', operationalStatus: 'confirmed' },
      { financialStatus: 'paid_late', operationalStatus: 'under_review' },
      { operationalStatus: 'rejected' },
    ] as const) {
      expect(checkRecoveredOperation(view(patch))).toMatchObject({ usable: false, expired: false })
    }
  })
})

describe('formatUsageDateBR', () => {
  it('escreve a data no padrão brasileiro, sem passar por Date', () => {
    expect(formatUsageDateBR('2026-11-20')).toBe('20/11/2026')
    expect(formatUsageDateBR('2027-01-05')).toBe('05/01/2027')
  })

  it('devolve o texto original se não for data de calendário válida', () => {
    expect(formatUsageDateBR('2026-02-30')).toBe('2026-02-30')
    expect(formatUsageDateBR('')).toBe('')
  })
})

describe('formatDeadline', () => {
  it('escreve o instante do backend no calendário de São Paulo, sem recalcular', () => {
    // 21:45 UTC = 18:45 em São Paulo (UTC-3).
    expect(formatDeadline(Date.UTC(2026, 10, 11, 21, 45, 0))).toBe(
      'até 18:45 de 11/11/2026 (horário de Brasília)',
    )
  })

  it('o dia segue o calendário de São Paulo, não o UTC', () => {
    // 02:30 UTC de 12/11 ainda é 23:30 de 11/11 em São Paulo.
    expect(formatDeadline(Date.UTC(2026, 10, 12, 2, 30, 0))).toBe(
      'até 23:30 de 11/11/2026 (horário de Brasília)',
    )
    expect(formatDeadline(Date.UTC(2026, 10, 12, 3, 0, 0))).toBe(
      'até 00:00 de 12/11/2026 (horário de Brasília)',
    )
  })
})
