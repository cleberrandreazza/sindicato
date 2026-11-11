import { POOL_MEDICAL_FEE_CENTS } from './pricing'
import { businessCalendarDate, isValidIsoDate } from './time'

/**
 * Regras de utilização configuráveis.
 *
 * O sindicato ainda NÃO informou: dias e horários de funcionamento, antecedência mínima ou
 * máxima, isenções (crianças, idosos) e faixas etárias com preços diferentes. Nenhuma dessas
 * regras é aplicada nem inventada aqui. Quando existirem, basta fornecer outra implementação
 * de `UsagePolicy` (ex.: lida de uma tabela de configuração) sem alterar as mutations.
 *
 * Tratamento de datas e fusos: ver `time.ts`.
 */

export type UsageDateCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'invalid_usage_date' | 'past_usage_date' }

export interface UsagePolicy {
  /**
   * Valida a data de utilização (calendário `YYYY-MM-DD`) no instante `nowMs`.
   * É avaliada apenas na criação da operação.
   */
  checkUsageDate(usageDate: string, nowMs: number): UsageDateCheck
  /** Valor unitário em centavos para a data. Hoje é fixo; poderá variar por regra futura. */
  unitAmountCents(usageDate: string): number
}

/**
 * Política padrão: bloqueia datas anteriores a "hoje" no calendário de São Paulo (hoje é
 * permitido) e cobra R$ 30,00 por pessoa. Não aplica isenções, descontos, calendário de
 * funcionamento nem janelas de antecedência.
 */
export const defaultUsagePolicy: UsagePolicy = {
  checkUsageDate(usageDate, nowMs) {
    if (!isValidIsoDate(usageDate)) return { ok: false, code: 'invalid_usage_date' }
    // Strings ISO `YYYY-MM-DD` comparam corretamente na ordem lexicográfica.
    if (usageDate < businessCalendarDate(nowMs)) return { ok: false, code: 'past_usage_date' }
    return { ok: true }
  },
  unitAmountCents() {
    return POOL_MEDICAL_FEE_CENTS
  },
}
