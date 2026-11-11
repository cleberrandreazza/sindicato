import { ConvexError, type Value } from 'convex/values'

/**
 * Erros das funções públicas. O navegador recebe `code` (para a tela decidir o que fazer) e
 * `message` (texto pronto em pt-BR). Mensagens são deliberadamente genéricas quando detalhar
 * ajudaria quem tenta descobrir se uma carteirinha ou CPF existe.
 */
export const PUBLIC_ERROR_MESSAGES = {
  // Identificação
  invalid_membership_number: 'Informe o número da carteirinha (apenas letras e números).',
  invalid_cpf: 'Informe um CPF válido.',
  // Resposta ÚNICA para carteirinha inexistente e para CPF que não confere.
  identification_failed:
    'Não foi possível confirmar os dados informados. Verifique o número da carteirinha e o CPF.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  service_unavailable: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
  session_invalid: 'Sua identificação expirou. Informe novamente a carteirinha e o CPF.',
  // Seleção
  member_inactive:
    'O cadastro do titular não está ativo. Entre em contato com o Sindicomerciários.',
  member_not_found: 'Não foi possível concluir a operação. Identifique-se novamente.',
  empty_selection: 'Selecione ao menos uma pessoa.',
  duplicate_person: 'A mesma pessoa foi selecionada mais de uma vez.',
  link_not_found: 'Uma das pessoas selecionadas não pertence a este cadastro.',
  link_inactive: 'Uma das pessoas selecionadas não está ativa no cadastro.',
  invalid_selection: 'A seleção de pessoas é inválida.',
  // Data e cobrança
  invalid_usage_date: 'Informe uma data de utilização válida.',
  past_usage_date: 'A data de utilização não pode estar no passado.',
  duplicate_usage:
    'Já existe um pagamento ou uma cobrança em andamento para uma das pessoas nesta data.',
  too_many_requests: 'Muitas solicitações em pouco tempo. Aguarde alguns minutos.',
  // Idempotência da criação da operação
  invalid_request_id: 'Não foi possível identificar esta solicitação. Tente novamente.',
  request_id_conflict:
    'Esta solicitação já foi usada com outros dados. Revise as informações e tente novamente.',
  operation_not_recoverable:
    'Não foi possível recuperar a operação criada anteriormente. Aguarde alguns minutos e tente novamente.',
  // Consulta de operação: mesma resposta para inexistente e para credencial incorreta.
  operation_not_found: 'Operação não encontrada.',
  // Cobrança (`public/payments:startPayment`)
  operation_expired:
    'O prazo de 15 minutos para o pagamento terminou. Se você já pagou, não pague novamente: ' +
    'caso o recebimento seja identificado, nossa equipe fará a verificação. ' +
    'Se ainda deseja utilizar as piscinas, faça uma nova solicitação.',
  operation_already_paid:
    'O pagamento desta solicitação já foi identificado. Não é necessário pagar novamente.',
  operation_under_review:
    'Seu pagamento foi identificado e está em verificação pela nossa equipe. ' +
    'Não realize um novo pagamento.',
  operation_closed:
    'Esta solicitação foi encerrada e não aceita novos pagamentos. Faça uma nova solicitação.',
  invalid_operation_amount:
    'Não foi possível iniciar o pagamento desta solicitação. Faça uma nova solicitação.',
  payment_method_conflict:
    'Já existe um pagamento em andamento para esta solicitação com outra forma de pagamento. ' +
    'Conclua-o ou aguarde o fim do prazo antes de escolher outra forma.',
  payment_in_progress:
    'Estamos preparando o seu pagamento. Aguarde alguns segundos e tente novamente.',
  payment_attempts_exceeded:
    'Foram feitas muitas tentativas de pagamento para esta solicitação. Faça uma nova solicitação.',
  invalid_payment_method:
    'Forma de pagamento inválida. Para cartão, use o token gerado pelo provedor; Pix não usa token.',
  invalid_payment_token: 'Não foi possível processar os dados do cartão. Revise e tente novamente.',
  // Comprovante / notificações
  receipt_not_available: 'O comprovante definitivo ainda não está disponível para esta operação.',
  receipt_file_not_ready:
    'O arquivo do comprovante ainda está sendo preparado. Tente novamente em instantes.',
  email_already_sent: 'O comprovante já foi enviado por e-mail.',
  email_in_progress: 'O envio do e-mail já está em andamento. Aguarde alguns instantes.',
} as const

export type PublicErrorCode = keyof typeof PUBLIC_ERROR_MESSAGES

export function publicMessage(code: PublicErrorCode): string {
  return PUBLIC_ERROR_MESSAGES[code]
}

export interface PublicErrorData {
  readonly code: PublicErrorCode
  readonly message: string
  readonly [key: string]: Value
}

/** Cria o erro que o navegador recebe. `extra` não deve conter dados de terceiros. */
export function publicError(
  code: PublicErrorCode,
  extra: Readonly<Record<string, Value>> = {},
): ConvexError<PublicErrorData> {
  return new ConvexError({ ...extra, code, message: PUBLIC_ERROR_MESSAGES[code] })
}
