const CPF_DIGITS = 11

/** Mantém só os dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Máscara de digitação `000.000.000-00`. Apenas formatação: a validade do CPF (dígitos
 * verificadores) é verificada pelo backend, que é a fonte da regra.
 */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, CPF_DIGITS)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 9)
  const check = digits.slice(9, 11)

  let formatted = part1
  if (part2) formatted += `.${part2}`
  if (part3) formatted += `.${part3}`
  if (check) formatted += `-${check}`
  return formatted
}

/** O CPF tem os 11 dígitos? (Completude de preenchimento, não validade.) */
export function isCpfComplete(value: string): boolean {
  return onlyDigits(value).length === CPF_DIGITS
}
