import { describe, expect, it } from 'vitest'
import { businessCalendarDate, isValidIsoDate } from '../../convex/domain/time'
import { defaultUsagePolicy } from '../../convex/domain/usagePolicy'

// 2026-12-01 15:00 UTC = 12:00 em São Paulo.
const NOON_IN_SAO_PAULO = Date.UTC(2026, 11, 1, 15, 0, 0)

describe('data de utilização', () => {
  it('bloqueia datas passadas', () => {
    expect(defaultUsagePolicy.checkUsageDate('2026-11-30', NOON_IN_SAO_PAULO)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
    expect(defaultUsagePolicy.checkUsageDate('2025-01-01', NOON_IN_SAO_PAULO)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
  })

  it('permite a data de hoje e datas futuras', () => {
    expect(defaultUsagePolicy.checkUsageDate('2026-12-01', NOON_IN_SAO_PAULO)).toEqual({ ok: true })
    expect(defaultUsagePolicy.checkUsageDate('2026-12-02', NOON_IN_SAO_PAULO)).toEqual({ ok: true })
  })

  it('considera o fuso do sindicato para decidir o que é "hoje"', () => {
    // 02:30 UTC de 01/12 ainda é 23:30 de 30/11 em São Paulo.
    const lateNightInSaoPaulo = Date.UTC(2026, 11, 1, 2, 30, 0)
    expect(businessCalendarDate(lateNightInSaoPaulo)).toBe('2026-11-30')
    expect(defaultUsagePolicy.checkUsageDate('2026-11-30', lateNightInSaoPaulo)).toEqual({
      ok: true,
    })
    expect(defaultUsagePolicy.checkUsageDate('2026-11-29', lateNightInSaoPaulo)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
  })

  it('rejeita datas inexistentes ou em formato inválido', () => {
    for (const value of ['', '2026-13-01', '2026-02-30', '01/12/2026', '2026-1-1', 'amanhã']) {
      expect(isValidIsoDate(value)).toBe(false)
      expect(defaultUsagePolicy.checkUsageDate(value, NOON_IN_SAO_PAULO)).toEqual({
        ok: false,
        code: 'invalid_usage_date',
      })
    }
    expect(isValidIsoDate('2028-02-29')).toBe(true)
  })
})

describe('regras pendentes não são inventadas', () => {
  it('não restringe dias da semana nem antecedência máxima', () => {
    // 2026-12-06 é domingo; 2026-12-07 é segunda; 2030-01-01 está a anos de distância.
    for (const date of ['2026-12-06', '2026-12-07', '2030-01-01']) {
      expect(defaultUsagePolicy.checkUsageDate(date, NOON_IN_SAO_PAULO)).toEqual({ ok: true })
    }
  })

  it('aplica R$ 30,00 para qualquer data, sem isenções ou faixas', () => {
    expect(defaultUsagePolicy.unitAmountCents('2026-12-06')).toBe(3000)
    expect(defaultUsagePolicy.unitAmountCents('2027-07-15')).toBe(3000)
  })
})
