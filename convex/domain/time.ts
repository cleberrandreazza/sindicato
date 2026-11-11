/**
 * ESTRATÉGIA DE DATAS E FUSO HORÁRIO
 *
 * Dois conceitos distintos, nunca misturados:
 *
 * 1. INSTANTE (momento exato): `number` em milissegundos desde a época Unix, que é UTC por
 *    definição. Usado em `createdAt` (`_creationTime`), `updatedAt`, `expiresAt`, `paidAt`,
 *    `occurredAt` etc. O prazo de 15 minutos é aritmética sobre instantes: não depende de fuso,
 *    de meia-noite nem de horário de verão. Nenhum instante é guardado como texto.
 *
 * 2. DATA DE CALENDÁRIO: string `YYYY-MM-DD`, sem hora e sem fuso. Usada em `usageDate`. Uma data
 *    de utilização é "o dia 10 de dezembro" para todos, em qualquer fuso, e nunca é convertida.
 *
 * Única ponte entre os dois: descobrir "que dia é hoje no calendário de São Paulo" a partir de um
 * instante. Isso é feito UMA vez, aqui, de forma explícita (`BUSINESS_TIME_ZONE`), e serve para
 * bloquear datas passadas e numerar comprovantes por ano. Não se usa `getFullYear()`,
 * `getDate()`, `toLocaleDateString()` sem fuso, nem o fuso do servidor/navegador.
 *
 * O fuso é resolvido com a base IANA do runtime (`Intl`), não com um deslocamento fixo de -3h,
 * para que uma eventual mudança futura de horário de verão no Brasil seja absorvida pela base de
 * fusos, sem alterar o código.
 */

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Data de calendário válida no formato `YYYY-MM-DD` (rejeita, por exemplo, `2026-02-30`). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  // `Date.UTC` e `toISOString` são explícitos em UTC: usados só para validar o calendário.
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.toISOString().slice(0, 10) === value
}

/**
 * Data de calendário (`YYYY-MM-DD`) que o instante `instantMs` tem no fuso `timeZone`.
 * Lança erro se o instante for inválido ou se o runtime não conseguir resolver o fuso; falhar
 * alto é preferível a aceitar silenciosamente uma data errada.
 */
export function calendarDateInZone(instantMs: number, timeZone: string): string {
  if (!Number.isFinite(instantMs)) {
    throw new RangeError('O instante deve ser um número finito de milissegundos.')
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instantMs))

  const pick = (type: 'year' | 'month' | 'day'): string => {
    const value = parts.find((part) => part.type === type)?.value
    if (value === undefined) throw new Error(`Não foi possível resolver "${type}" em ${timeZone}.`)
    return value
  }
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

/** Dia de hoje no calendário de São Paulo, para o instante informado. */
export function businessCalendarDate(instantMs: number): string {
  return calendarDateInZone(instantMs, BUSINESS_TIME_ZONE)
}
