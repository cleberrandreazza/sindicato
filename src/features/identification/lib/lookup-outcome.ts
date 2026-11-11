import { ConvexError } from 'convex/values'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { LookupResult } from '../api/lookup-member'
import type { FieldErrors } from './form'

/**
 * Traduz a resposta do backend (`public/members:lookup`) no que a tela precisa decidir.
 * Nenhuma regra é recalculada aqui: situação cadastral, falha de identificação e limites vêm
 * do backend; este módulo só os classifica. Detalhes internos nunca chegam à tela.
 */

export interface IdentifiedMember {
  memberId: Id<'members'>
  membershipNumber: string
  /** Já mascarado pelo backend (`***.***.***-09`). */
  cpfMasked: string
  holderName: string
  /** Pessoas que o backend marcou como selecionáveis (titular + dependentes ativos). */
  selectablePeopleCount: number
  /** Prova de identificação para as próximas chamadas. Fica só em memória. */
  session: { token: string; expiresAt: number }
}

export type LookupOutcome =
  | { kind: 'identified'; member: IdentifiedMember }
  | { kind: 'inactive'; membershipNumber: string; message: string }
  /** Carteirinha inexistente OU CPF divergente: o backend não distingue, nem a tela. */
  | { kind: 'not_found' }
  /** Entrada recusada por formato; o erro é mostrado no campo correspondente. */
  | { kind: 'invalid_input'; fields: FieldErrors }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'unavailable' }

const FALLBACK_MESSAGES = {
  invalid_membership_number: 'Confira o número da carteirinha (apenas letras e números).',
  invalid_cpf: 'Confira o CPF informado.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
} as const

export function interpretLookupResult(result: LookupResult): LookupOutcome {
  if (result.member.status !== 'active') {
    return {
      kind: 'inactive',
      membershipNumber: result.member.membershipNumber,
      message: result.message ?? '',
    }
  }
  // Cadastro ativo sempre vem com prova de identificação; sem ela não há como continuar.
  if (!result.session) return { kind: 'unavailable' }

  return {
    kind: 'identified',
    member: {
      memberId: result.member.id,
      membershipNumber: result.member.membershipNumber,
      cpfMasked: result.member.cpfMasked,
      holderName: result.holder.name,
      selectablePeopleCount:
        (result.holder.selectable ? 1 : 0) +
        result.dependents.filter((dependent) => dependent.selectable).length,
      session: result.session,
    },
  }
}

interface PublicErrorShape {
  code: string
  message?: unknown
}

function readPublicError(error: unknown): PublicErrorShape | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null) return null
  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null
  return { code, message: (data as { message?: unknown }).message }
}

function messageOr(error: PublicErrorShape, fallback: string): string {
  return typeof error.message === 'string' && error.message !== '' ? error.message : fallback
}

/**
 * Qualquer falha que não seja um erro público conhecido (rede, indisponibilidade, erro
 * inesperado do servidor) vira `unavailable`, sem expor o motivo.
 */
export function interpretLookupError(error: unknown): LookupOutcome {
  const publicError = readPublicError(error)
  if (!publicError) return { kind: 'unavailable' }

  switch (publicError.code) {
    case 'identification_failed':
      return { kind: 'not_found' }
    case 'invalid_membership_number':
      return {
        kind: 'invalid_input',
        fields: {
          membershipNumber: messageOr(publicError, FALLBACK_MESSAGES.invalid_membership_number),
        },
      }
    case 'invalid_cpf':
      return {
        kind: 'invalid_input',
        fields: { cpf: messageOr(publicError, FALLBACK_MESSAGES.invalid_cpf) },
      }
    case 'too_many_attempts':
      return {
        kind: 'rate_limited',
        message: messageOr(publicError, FALLBACK_MESSAGES.too_many_attempts),
      }
    default:
      return { kind: 'unavailable' }
  }
}
