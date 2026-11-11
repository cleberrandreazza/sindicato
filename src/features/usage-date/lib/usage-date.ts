import { businessCalendarDate, isValidIsoDate } from '../../../../convex/domain/time'
import { publicMessage } from '../../../../convex/domain/publicErrors'

/**
 * A data de utilização é uma DATA DE CALENDÁRIO: texto `YYYY-MM-DD`, sem hora e sem fuso, igual
 * para todos. Nada aqui converte essa data em `Date` local nem em instante: `new Date('2026-11-20')`
 * seria meia-noite UTC e, em São Paulo, ainda o dia 19. As únicas duas pontes são:
 *
 * - "hoje" no calendário de São Paulo (`todayInSaoPaulo`), a mesma função do backend; e
 * - a exibição por extenso (`formatUsageDate`), feita inteiramente em UTC a partir dos números.
 *
 * Comparar duas datas `YYYY-MM-DD` como texto equivale a compará-las no calendário.
 */

/** Dia de hoje no calendário de São Paulo, o fuso de referência (a confirmar pelo sindicato). */
export function todayInSaoPaulo(nowMs: number = Date.now()): string {
  return businessCalendarDate(nowMs)
}

export type LocalDateCheck =
  { ok: true } | { ok: false; reason: 'empty' | 'invalid' | 'past'; message: string }

/**
 * Conferência local, só para orientar logo no campo. NÃO substitui o backend, que valida de novo
 * a data (e a seleção) em `checkDuplicates` e em `createOperation`.
 *
 * Regra provisória de desenvolvimento: qualquer data de hoje em diante é aceita. Não há dias de
 * funcionamento, horários nem antecedência mínima ou máxima: o sindicato ainda não os informou.
 */
export function checkLocalUsageDate(value: string, today: string): LocalDateCheck {
  if (value === '') {
    return { ok: false, reason: 'empty', message: 'Informe a data de utilização.' }
  }
  if (!isValidIsoDate(value)) {
    return { ok: false, reason: 'invalid', message: publicMessage('invalid_usage_date') }
  }
  if (value < today) {
    return { ok: false, reason: 'past', message: publicMessage('past_usage_date') }
  }
  return { ok: true }
}

const LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  // UTC nos dois lados (Date.UTC e timeZone): o dia nunca desliza por causa do fuso do aparelho.
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `2026-11-20` → "sexta-feira, 20 de novembro de 2026". Data inválida volta como veio. */
export function formatUsageDate(value: string): string {
  if (!isValidIsoDate(value)) return value
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return LONG_DATE.format(new Date(Date.UTC(year, month - 1, day)))
}
