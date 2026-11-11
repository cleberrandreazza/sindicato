const CPF_LENGTH = 11

/** Remove tudo que não for dígito. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '')
}

function calculateCheckDigit(digits: readonly number[]): number {
  const weight = digits.length + 1
  const sum = digits.reduce((total, digit, index) => total + digit * (weight - index), 0)
  const remainder = (sum * 10) % 11
  return remainder === 10 ? 0 : remainder
}

/** Valida formato e dígitos verificadores. Aceita CPF com ou sem pontuação. */
export function isValidCpf(input: string): boolean {
  const normalized = normalizeCpf(input)
  if (normalized.length !== CPF_LENGTH) return false
  if (/^(\d)\1+$/.test(normalized)) return false

  const digits = Array.from(normalized, Number)
  const firstCheck = calculateCheckDigit(digits.slice(0, 9))
  const secondCheck = calculateCheckDigit(digits.slice(0, 10))
  return digits[9] === firstCheck && digits[10] === secondCheck
}

/** Máscara para exibição: mantém apenas os dois últimos dígitos (`***.***.***-09`). */
export function maskCpf(input: string): string {
  const normalized = normalizeCpf(input)
  return `***.***.***-${normalized.slice(-2)}`
}
