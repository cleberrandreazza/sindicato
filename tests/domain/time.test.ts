import { describe, expect, it } from 'vitest'
import {
  BUSINESS_TIME_ZONE,
  businessCalendarDate,
  calendarDateInZone,
  isValidIsoDate,
} from '../../convex/domain/time'
import { defaultUsagePolicy } from '../../convex/domain/usagePolicy'

/**
 * São Paulo está em UTC-3 o ano todo (sem horário de verão desde 2019). A meia-noite local de
 * 2026-12-01 é, portanto, 2026-12-01T03:00:00Z.
 */
const MIDNIGHT_DEC_1 = Date.UTC(2026, 11, 1, 3, 0, 0)
const SECOND = 1000

describe('estratégia de fuso: datas de calendário x instantes', () => {
  it('o fuso de negócio é America/Sao_Paulo', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Sao_Paulo')
  })

  it('um segundo antes da meia-noite local ainda é o dia anterior', () => {
    expect(businessCalendarDate(MIDNIGHT_DEC_1 - SECOND)).toBe('2026-11-30')
  })

  it('exatamente na meia-noite local começa o novo dia', () => {
    expect(businessCalendarDate(MIDNIGHT_DEC_1)).toBe('2026-12-01')
    expect(businessCalendarDate(MIDNIGHT_DEC_1 + SECOND)).toBe('2026-12-01')
  })

  it('a meia-noite UTC NÃO muda o dia em São Paulo', () => {
    // 00:00 UTC de 01/12 = 21:00 de 30/11 em São Paulo.
    expect(businessCalendarDate(Date.UTC(2026, 11, 1, 0, 0, 0))).toBe('2026-11-30')
    // 23:59:59 UTC de 01/12 = 20:59:59 de 01/12 em São Paulo.
    expect(businessCalendarDate(Date.UTC(2026, 11, 1, 23, 59, 59))).toBe('2026-12-01')
  })

  it('vira o ano corretamente (31/12 -> 01/01) na hora local', () => {
    const newYear = Date.UTC(2027, 0, 1, 3, 0, 0)
    expect(businessCalendarDate(newYear - SECOND)).toBe('2026-12-31')
    expect(businessCalendarDate(newYear)).toBe('2027-01-01')
  })

  it('trata ano bissexto (29/02) sem deslocar o dia', () => {
    const leapMidnight = Date.UTC(2028, 1, 29, 3, 0, 0)
    expect(businessCalendarDate(leapMidnight - SECOND)).toBe('2028-02-28')
    expect(businessCalendarDate(leapMidnight)).toBe('2028-02-29')
  })

  it('o resultado não depende do fuso do ambiente, apenas do fuso informado', () => {
    const instant = Date.UTC(2026, 11, 1, 2, 30, 0)
    expect(calendarDateInZone(instant, 'UTC')).toBe('2026-12-01')
    expect(calendarDateInZone(instant, 'America/Sao_Paulo')).toBe('2026-11-30')
    expect(calendarDateInZone(instant, 'Asia/Tokyo')).toBe('2026-12-01')
    expect(calendarDateInZone(instant, 'Pacific/Kiritimati')).toBe('2026-12-01')
  })

  it('recusa instante inválido em vez de produzir uma data errada', () => {
    expect(() => businessCalendarDate(Number.NaN)).toThrow(RangeError)
    expect(() => businessCalendarDate(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('recusa fuso desconhecido', () => {
    expect(() => calendarDateInZone(MIDNIGHT_DEC_1, 'Nao/Existe')).toThrow()
  })
})

describe('validação de data passada no calendário de São Paulo', () => {
  it('às 23:59:59 locais, hoje ainda é permitido e ontem não', () => {
    const lastSecond = MIDNIGHT_DEC_1 + 24 * 3600 * SECOND - SECOND // 2026-12-01 23:59:59 local
    expect(defaultUsagePolicy.checkUsageDate('2026-12-01', lastSecond)).toEqual({ ok: true })
    expect(defaultUsagePolicy.checkUsageDate('2026-11-30', lastSecond)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
  })

  it('um segundo depois (00:00:00 local), o dia que acabou de terminar vira passado', () => {
    const firstSecondOfNextDay = MIDNIGHT_DEC_1 + 24 * 3600 * SECOND
    expect(defaultUsagePolicy.checkUsageDate('2026-12-01', firstSecondOfNextDay)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
    expect(defaultUsagePolicy.checkUsageDate('2026-12-02', firstSecondOfNextDay)).toEqual({
      ok: true,
    })
  })

  it('21:00 em São Paulo já é o dia seguinte em UTC, mas a data de uso segue o calendário local', () => {
    // 2026-12-02T00:30Z = 2026-12-01 21:30 em São Paulo: "hoje" é 01/12.
    const instant = Date.UTC(2026, 11, 2, 0, 30, 0)
    expect(defaultUsagePolicy.checkUsageDate('2026-12-01', instant)).toEqual({ ok: true })
    expect(defaultUsagePolicy.checkUsageDate('2026-11-30', instant)).toEqual({
      ok: false,
      code: 'past_usage_date',
    })
  })

  it('a data de utilização é só calendário: nada é convertido nem aceita hora/fuso', () => {
    for (const value of ['2026-12-01T00:00:00Z', '2026-12-01 10:00', '2026-12-01T00:00:00-03:00']) {
      expect(isValidIsoDate(value)).toBe(false)
    }
  })
})
