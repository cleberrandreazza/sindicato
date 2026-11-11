import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { CheckDuplicatesResult } from '../../src/features/usage-date/api/check-usage-date'
import {
  checkLocalUsageDate,
  formatUsageDate,
  todayInSaoPaulo,
} from '../../src/features/usage-date/lib/usage-date'
import {
  interpretUsageDateError,
  interpretUsageDateResult,
} from '../../src/features/usage-date/lib/usage-date-outcome'

const linkId = (value: string) => value as Id<'householdLinks'>

describe('todayInSaoPaulo', () => {
  it('usa o calendário de São Paulo, não o UTC nem o fuso do aparelho', () => {
    // 02:00 UTC de 12/11 ainda é 23:00 de 11/11 em São Paulo.
    expect(todayInSaoPaulo(Date.UTC(2026, 10, 12, 2, 0, 0))).toBe('2026-11-11')
    // 03:00 UTC = 00:00 em São Paulo: já é o dia 12.
    expect(todayInSaoPaulo(Date.UTC(2026, 10, 12, 3, 0, 0))).toBe('2026-11-12')
    expect(todayInSaoPaulo(Date.UTC(2026, 10, 12, 2, 59, 59))).toBe('2026-11-11')
  })
})

describe('checkLocalUsageDate (regra provisória: de hoje em diante)', () => {
  const today = '2026-11-11'

  it('a data é obrigatória', () => {
    const result = checkLocalUsageDate('', today)
    expect(result).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('bloqueia datas passadas e aceita hoje', () => {
    expect(checkLocalUsageDate('2026-11-10', today)).toMatchObject({ ok: false, reason: 'past' })
    expect(checkLocalUsageDate('2025-01-01', today)).toMatchObject({ ok: false, reason: 'past' })
    expect(checkLocalUsageDate('2026-11-11', today)).toEqual({ ok: true })
  })

  it('aceita qualquer data futura: sem dia da semana, feriado, antecedência mínima ou máxima', () => {
    // 15/11/2026 é domingo e feriado nacional; nada disso é regra confirmada, então nada bloqueia.
    expect(checkLocalUsageDate('2026-11-12', today)).toEqual({ ok: true })
    expect(checkLocalUsageDate('2026-11-15', today)).toEqual({ ok: true })
    expect(checkLocalUsageDate('2026-12-25', today)).toEqual({ ok: true })
    expect(checkLocalUsageDate('2030-01-01', today)).toEqual({ ok: true })
    expect(checkLocalUsageDate('2099-12-31', today)).toEqual({ ok: true })
  })

  it('recusa datas que não existem no calendário ou fora do formato', () => {
    for (const value of ['2026-02-30', '2026-13-01', '20261120', '20/11/2026', '2026-1-5']) {
      expect(checkLocalUsageDate(value, today)).toMatchObject({ ok: false, reason: 'invalid' })
    }
  })

  it('compara como data de calendário: não depende de hora nem de fuso', () => {
    expect(checkLocalUsageDate('2026-11-11', '2026-11-11')).toEqual({ ok: true })
    expect(checkLocalUsageDate('2026-11-11', '2026-11-12')).toMatchObject({ reason: 'past' })
  })

  it('usa os mesmos textos do backend', () => {
    expect(checkLocalUsageDate('2026-11-10', today)).toMatchObject({
      message: 'A data de utilização não pode estar no passado.',
    })
    expect(checkLocalUsageDate('2026-02-30', today)).toMatchObject({
      message: 'Informe uma data de utilização válida.',
    })
  })
})

describe('formatUsageDate', () => {
  it('escreve o dia exatamente como escolhido (sem deslizar por fuso)', () => {
    expect(formatUsageDate('2026-11-20')).toBe('sexta-feira, 20 de novembro de 2026')
    expect(formatUsageDate('2026-12-01')).toBe('terça-feira, 1 de dezembro de 2026')
    expect(formatUsageDate('2027-01-01')).toBe('sexta-feira, 1 de janeiro de 2027')
    expect(formatUsageDate('2028-02-29')).toBe('terça-feira, 29 de fevereiro de 2028')
  })

  it('devolve o texto original se não for uma data de calendário válida', () => {
    expect(formatUsageDate('2026-02-30')).toBe('2026-02-30')
    expect(formatUsageDate('')).toBe('')
  })
})

describe('interpretUsageDateResult', () => {
  it('data aceita e sem conflitos', () => {
    const result: CheckDuplicatesResult = {
      ok: true,
      usageDate: '2026-11-20',
      hasConflicts: false,
      conflicts: [],
    }
    expect(interpretUsageDateResult(result)).toEqual({ kind: 'accepted' })
  })

  it('conflito: só os nomes devolvidos pelo backend', () => {
    const result: CheckDuplicatesResult = {
      ok: true,
      usageDate: '2026-11-20',
      hasConflicts: true,
      conflicts: [
        { linkId: linkId('l1'), name: 'Bruno Teste Almeida' },
        { linkId: linkId('l2'), name: 'Clara Teste Almeida' },
      ],
    }
    const outcome = interpretUsageDateResult(result)
    expect(outcome).toEqual({
      kind: 'conflict',
      names: ['Bruno Teste Almeida', 'Clara Teste Almeida'],
    })
    // Nenhum identificador interno vai para a tela.
    expect(JSON.stringify(outcome)).not.toContain('l1')
  })

  it('conflito sem nome utilizável não inventa texto', () => {
    const result: CheckDuplicatesResult = {
      ok: true,
      usageDate: '2026-11-20',
      hasConflicts: true,
      conflicts: [{ linkId: linkId('l1'), name: '' }],
    }
    expect(interpretUsageDateResult(result)).toEqual({ kind: 'conflict', names: [] })
  })

  it('recusa do backend: usa o texto dele', () => {
    expect(
      interpretUsageDateResult({
        ok: false,
        code: 'past_usage_date',
        message: 'A data de utilização não pode estar no passado.',
      }),
    ).toEqual({ kind: 'rejected', message: 'A data de utilização não pode estar no passado.' })
  })

  it('recusa sem texto usa uma mensagem de reserva', () => {
    const outcome = interpretUsageDateResult({ ok: false, code: 'link_inactive', message: '' })
    expect(outcome).toMatchObject({ kind: 'rejected' })
    expect((outcome as { message: string }).message).not.toBe('')
  })

  it('titular não encontrado pede nova identificação', () => {
    expect(interpretUsageDateResult({ ok: false, code: 'member_not_found', message: 'x' })).toEqual(
      { kind: 'session_expired' },
    )
  })
})

describe('interpretUsageDateError', () => {
  it('prova inválida ou expirada pede nova identificação', () => {
    expect(
      interpretUsageDateError(new ConvexError({ code: 'session_invalid', message: 'x' })),
    ).toEqual({ kind: 'session_expired' })
  })

  it('erro público de validação vira recusa com o texto do backend', () => {
    expect(
      interpretUsageDateError(
        new ConvexError({ code: 'invalid_usage_date', message: 'Data ruim' }),
      ),
    ).toEqual({ kind: 'rejected', message: 'Data ruim' })
  })

  it('qualquer outra falha vira indisponível, sem expor o motivo', () => {
    expect(interpretUsageDateError(new Error('[CONVEX Q(...)] Server Error'))).toEqual({
      kind: 'unavailable',
    })
    expect(
      interpretUsageDateError(new ConvexError({ code: 'too_many_requests', message: 'x' })),
    ).toEqual({ kind: 'unavailable' })
    expect(interpretUsageDateError('estranho')).toEqual({ kind: 'unavailable' })
  })
})
