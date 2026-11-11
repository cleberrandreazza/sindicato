import { BUSINESS_TIME_ZONE } from '../../../../convex/domain/time'

const FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Prazo oficial da operação para exibição: `até 18:45 de 11/11/2026 (horário de Brasília)`.
 * `expiresAt` é um instante (UTC, ms) calculado pelo BACKEND; aqui só se escreve esse instante no
 * calendário de São Paulo. Nada é recalculado: o navegador não decide quando a operação expira.
 */
export function formatDeadline(expiresAt: number): string {
  const parts = FORMAT.formatToParts(new Date(expiresAt))
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `até ${pick('hour')}:${pick('minute')} de ${pick('day')}/${pick('month')}/${pick('year')} (horário de Brasília)`
}
