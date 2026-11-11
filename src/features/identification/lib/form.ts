import { isCpfComplete, onlyDigits } from './cpf-mask'

export interface IdentificationFormValues {
  membershipNumber: string
  /** Como digitado (com máscara). */
  cpf: string
}

export type FieldName = keyof IdentificationFormValues
export type FieldErrors = Partial<Record<FieldName, string>>

/** Ordem dos campos na tela; usada para levar o foco ao primeiro com erro. */
export const FIELD_ORDER: readonly FieldName[] = ['membershipNumber', 'cpf']

/** Limite só de digitação. A regra de formato da carteirinha é do backend. */
const MEMBERSHIP_INPUT_MAX_LENGTH = 20

/** Carteirinha: apenas letras e números, sem espaços (também ao colar). */
export function sanitizeMembershipNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, MEMBERSHIP_INPUT_MAX_LENGTH)
}

/**
 * Verificação de preenchimento, para avisar antes de consultar. Não replica regras de negócio:
 * dígitos verificadores do CPF e formato da carteirinha continuam sendo validados no backend
 * (os erros dele aparecem nos mesmos campos).
 */
export function validateIdentificationForm(values: IdentificationFormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (values.membershipNumber.trim() === '') {
    errors.membershipNumber = 'Informe o número da carteirinha.'
  }
  if (onlyDigits(values.cpf) === '') {
    errors.cpf = 'Informe o CPF.'
  } else if (!isCpfComplete(values.cpf)) {
    errors.cpf = 'O CPF deve ter 11 números.'
  }
  return errors
}

export function firstInvalidField(errors: FieldErrors): FieldName | null {
  return FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null
}
