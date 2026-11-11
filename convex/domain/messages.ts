import type { FinancialStatus, OperationalStatus, ReviewReason } from './statuses'

/**
 * Mensagens exibidas ao associado (pt-BR). Ficam no backend para que tela, e-mail e WhatsApp
 * usem exatamente o mesmo texto. Os textos marcados como "rascunho" aguardam aprovação do
 * sindicato.
 */

/**
 * Confirmação tardia. Segue a mensagem de referência fornecida pelo sindicato, acrescida da
 * última frase, que deixa explícito que a utilização depende de validação administrativa.
 */
export const LATE_PAYMENT_MESSAGE =
  'Seu pagamento foi identificado, mas a confirmação chegou com um pequeno atraso. ' +
  'Não se preocupe: identificamos o recebimento e nossa equipe está verificando a situação. ' +
  'Não realize um novo pagamento neste momento. ' +
  'Você receberá uma atualização assim que a análise for concluída. ' +
  'A utilização das piscinas só será liberada após a validação da nossa equipe.'

/** Análise por outro motivo que não atraso (valor divergente, recebimento em duplicidade etc.). */
export const UNDER_REVIEW_MESSAGE =
  'Seu pagamento foi identificado e nossa equipe está verificando a situação. ' +
  'Não realize um novo pagamento neste momento. ' +
  'Você receberá uma atualização assim que a análise for concluída. ' +
  'A utilização das piscinas só será liberada após a validação da nossa equipe.'

/** Rascunho. */
export const AWAITING_PAYMENT_MESSAGE =
  'Aguardando a confirmação do pagamento. Conclua o pagamento dentro de 15 minutos.'

/** Rascunho. */
export const CONFIRMED_MESSAGE =
  'Pagamento confirmado. O comprovante será enviado por e-mail e WhatsApp.'

/** Rascunho. Orienta a não pagar de novo caso o pagamento ainda esteja a caminho. */
export const EXPIRED_MESSAGE =
  'O prazo de 15 minutos para o pagamento terminou. ' +
  'Se você já pagou, não pague novamente: caso o recebimento seja identificado, ' +
  'nossa equipe fará a verificação e você receberá uma atualização. ' +
  'Se ainda deseja utilizar as piscinas, faça uma nova solicitação.'

/** Rascunho. */
export const REJECTED_MESSAGE =
  'A análise do seu pagamento foi concluída e a utilização das piscinas não foi liberada. ' +
  'Entre em contato com o Sindicomerciários para mais informações.'

/** Rascunho. */
export const PIX_PENDING_MESSAGE =
  'Pix gerado. Use o código “copia e cola” ou o QR Code para pagar dentro do prazo. ' +
  'A confirmação pode levar alguns instantes: não pague novamente.'

/** Rascunho. */
export const CARD_PENDING_MESSAGE =
  'Pagamento por cartão em processamento. Aguarde a confirmação e não faça um novo pagamento.'

/** Rascunho. Cobrança recusada: nenhum recebimento foi identificado. */
export const CHARGE_FAILED_MESSAGE =
  'O pagamento não foi aprovado e nenhum recebimento foi identificado. ' +
  'Você pode tentar novamente dentro do prazo.'

/** Rascunho. */
export const CHARGE_CANCELED_MESSAGE =
  'A cobrança foi cancelada e nenhum recebimento foi identificado. ' +
  'Se ainda deseja utilizar as piscinas, tente novamente dentro do prazo.'

export type OperationPresentationCode =
  | 'awaiting_payment'
  | 'confirmed'
  | 'expired'
  | 'under_review_late_payment'
  | 'under_review'
  | 'rejected'

export interface OperationPresentation {
  readonly code: OperationPresentationCode
  readonly message: string
}

/**
 * Tradução do estado interno em mensagem para o associado. Estados internos (como o motivo da
 * análise) não vazam: o associado recebe apenas o código e o texto.
 */
export function describeOperationForMember(input: {
  readonly financialStatus: FinancialStatus
  readonly operationalStatus: OperationalStatus
  readonly reviewReason?: ReviewReason | undefined
}): OperationPresentation {
  switch (input.operationalStatus) {
    case 'awaiting_payment':
      return { code: 'awaiting_payment', message: AWAITING_PAYMENT_MESSAGE }
    case 'confirmed':
      return { code: 'confirmed', message: CONFIRMED_MESSAGE }
    case 'expired':
      return { code: 'expired', message: EXPIRED_MESSAGE }
    case 'rejected':
      return { code: 'rejected', message: REJECTED_MESSAGE }
    case 'under_review':
      return input.financialStatus === 'paid_late' || input.reviewReason === 'late_payment'
        ? { code: 'under_review_late_payment', message: LATE_PAYMENT_MESSAGE }
        : { code: 'under_review', message: UNDER_REVIEW_MESSAGE }
  }
}
