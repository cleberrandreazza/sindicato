/**
 * Limites TÉCNICOS de proteção contra abuso na primeira versão. Não são regras de negócio do
 * sindicato e podem ser ajustados sem afetar valores, prazos ou duplicidade.
 *
 * Limitação importante: funções públicas do Convex não recebem o IP do cliente. Por isso os
 * limites são por carteirinha e globais, não por origem. Um atacante pode, portanto, bloquear
 * temporariamente uma carteirinha com tentativas erradas (ver docs/architecture.md). A solução
 * completa exige CAPTCHA/Turnstile ou um proxy que repasse a origem.
 */

/** Tentativas de identificação que falharam, por carteirinha, antes de bloquear. */
export const LOOKUP_MAX_FAILURES_PER_MEMBERSHIP = 5
export const LOOKUP_FAILURE_WINDOW_MS = 15 * 60 * 1000

/** Consultas cadastrais totais por minuto (todas as carteirinhas): limita varredura em massa. */
export const LOOKUP_MAX_PER_MINUTE = 120
export const LOOKUP_GLOBAL_WINDOW_MS = 60 * 1000

/** Operações criadas por titular na janela. */
export const CREATE_OPERATION_MAX_PER_MEMBER = 10
export const CREATE_OPERATION_WINDOW_MS = 15 * 60 * 1000

/** Tentativas de cobrança por operação (inclui cartões recusados). */
export const MAX_CHARGE_ATTEMPTS_PER_OPERATION = 3

/**
 * Uma tentativa de cobrança "em andamento" há mais que isto é considerada interrompida (ex.: a
 * action caiu) e pode ser retomada com a mesma chave de idempotência.
 */
export const CHARGE_ATTEMPT_STALE_AFTER_MS = 60 * 1000

/** Tamanho máximo do token de cartão aceito do navegador (tokens do provedor são curtos). */
export const MAX_PAYMENT_TOKEN_LENGTH = 200

/** Validade da prova de identificação emitida pela consulta cadastral. */
export const IDENTIFICATION_SESSION_TTL_MS = 30 * 60 * 1000

/** Tamanho máximo aceito para textos digitados antes de qualquer processamento. */
export const MAX_RAW_INPUT_LENGTH = 64
