# Contexto do projeto para o GPT — Pagamento das piscinas (Sindicomerciários)

> Documento gerado em 11/11/2026 para você (GPT) entender o estado atual do projeto e ajudar na
> próxima etapa. **Não invente funcionalidades que não estão aqui**; quando algo faltar, diga que
> falta. O código-fonte das partes mais importantes está anexado no fim deste arquivo.

## 1. O que é

Aplicação web **pública** para associados do Sindicomerciários pagarem a **taxa médica das
piscinas**: **R$ 30,00 por pessoa**, por **Pix ou cartão**, com **prazo de 15 minutos** para pagar e
comprovante por e-mail/WhatsApp (comprovante e notificações ainda NÃO implementados).

Regras de negócio confirmadas:

- Não há cadastro/login de associado. O associado informa **carteirinha + CPF**.
- Titular e dependentes são selecionados **individualmente** (sem convidados).
- **Data de utilização obrigatória.** Não pode ser passada (calendário de São Paulo).
- **Uma pessoa não pode ser cobrada duas vezes para a mesma data**, nem por titulares diferentes
  (chave: `personId`).
- Valores sempre em **centavos**, calculados **só no backend**. O frontend nunca envia valor nem
  altera estado de pagamento.
- Pagamento confirmado **depois do prazo** (`paid_late`) vai para **análise administrativa**: nunca
  libera automaticamente e nunca há reembolso automático.
- Regras ainda pendentes do sindicato (dias/horários de funcionamento, antecedência, isenções,
  faixas etárias) ficam isoladas em `UsagePolicy` (`convex/domain/usagePolicy.ts`).

## 2. Stack e ambiente

React + TypeScript (strict) + Vite + TanStack Router + Tailwind v4 + shadcn/ui, backend **Convex**,
gerenciador **pnpm**, **Node 22** (`.nvmrc`), testes **Vitest** (+ `convex-test`). Windows, bash.
Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm dev`, `pnpm dev:convex`.

## 3. Estado atual (o que existe)

**Backend (Convex) completo até a criação da cobrança. Nenhuma tela foi construída.**

| Etapa                                                                               | Entregue               |
| ----------------------------------------------------------------------------------- | ---------------------- |
| Scaffold, arquitetura, modelo de dados                                              | Sim                    |
| Regras de negócio, duplicidade, pagamento tardio                                    | Sim                    |
| Estabilização técnica (`personId`, `providerEvents`, fuso, Node 22)                 | Sim                    |
| API pública: consulta cadastral, validação, duplicidade, criar/consultar operação   | Sim                    |
| **Criação de cobrança Pix/cartão com mock, idempotente + simulação de confirmação** | **Sim (última etapa)** |
| Telas (React)                                                                       | **Não**                |
| Stripe real, webhook HTTP real                                                      | **Não**                |
| Comprovante PDF, e-mail, WhatsApp                                                   | **Não**                |
| Painel administrativo e autenticação admin                                          | **Não**                |

Verificação mais recente: **314 testes passando**, lint, typecheck, format e build OK. Também
foi verificado num backend Convex local real (concorrência, visibilidade das funções internas).

## 4. API pública (única superfície alcançável pelo navegador: `convex/public/`)

Um teste (`tests/domain/publicSurface.test.ts`) varre o código e falha se aparecer função pública
fora de `convex/public/` ou se a lista abaixo mudar.

| Função                             | Tipo     | Argumentos                                                                                      | Retorno resumido                                                                                                                                     |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/members:lookup`            | action   | `membershipNumber`, `cpf`                                                                       | titular, dependentes (cada um `{linkId,name,role,status,selectable}`), `cpfMasked`, `session {token, expiresAt}` (30 min; `null` se titular inativo) |
| `public/members:validateSelection` | query    | `memberId`, `identificationToken`, `linkIds[]`                                                  | `{ok:true, quantity, people}` ou `{ok:false, code, message}`                                                                                         |
| `public/payments:checkDuplicates`  | query    | `memberId`, `identificationToken`, `linkIds[]`, `usageDate`                                     | `{ok:true, hasConflicts, conflicts}` (informativa)                                                                                                   |
| `public/payments:createOperation`  | mutation | `memberId`, `identificationToken`, `linkIds[]`, `usageDate`                                     | `operationId`, `accessToken` (uma vez), valores em centavos, `expiresAt`                                                                             |
| `public/payments:getOperation`     | query    | `operationId`, `accessToken`                                                                    | estados, mensagem, pessoas, `receiptNumber`, `payment`                                                                                               |
| `public/payments:startPayment`     | action   | `operationId`, `accessToken`, `paymentMethod: 'pix'\|'card'`, `paymentMethodToken?` (só cartão) | `{payment, operation, reused}`                                                                                                                       |

Modelo de acesso: sem login. A consulta cadastral devolve uma **prova de identificação** de curta
duração; as demais funções exigem `memberId` **e** a prova. Cada operação tem sua própria
credencial (`accessToken`, só o hash é guardado). Pessoas são referenciadas por `linkId`
(vínculo com o titular), nunca pelo `personId` global. Erros de regra são `ConvexError` com
`{code, message}`; "não existe" e "credencial errada" têm sempre a mesma resposta.

Códigos de erro: `invalid_membership_number`, `invalid_cpf`, `identification_failed`,
`too_many_attempts`, `service_unavailable`, `session_invalid`, `member_inactive`,
`empty_selection`, `duplicate_person`, `link_not_found`, `link_inactive`, `invalid_selection`,
`invalid_usage_date`, `past_usage_date`, `duplicate_usage`, `too_many_requests`,
`operation_not_found`, `operation_expired`, `operation_already_paid`, `operation_under_review`,
`operation_closed`, `invalid_operation_amount`, `payment_method_conflict`, `payment_in_progress`,
`payment_attempts_exceeded`, `invalid_payment_method`, `invalid_payment_token`.

Fluxo que o frontend deverá seguir: `lookup` → escolher pessoas (`validateSelection`) → escolher
data (`checkDuplicates`, opcional) → `createOperation` (guardar `operationId` + `accessToken`) →
`startPayment` (Pix: exibir `payment.pix`; cartão: token do SDK) → consultar `getOperation`
periodicamente até o estado mudar. O frontend **nunca** confirma pagamento.

## 5. Estados (três eixos que não se confundem)

- **Cobrança** (`paymentTransactions.status`): `pending | succeeded | failed | canceled | expired`.
- **Financeiro** (da operação): `unpaid | paid | paid_late`.
- **Operacional**: `awaiting_payment | confirmed | expired | under_review | rejected`.

Só um recebimento (`succeeded`) validado por `decideConfirmation` move o financeiro. Recusa,
cancelamento e expiração da cobrança **não** alteram o financeiro. Pagamento no prazo →
`paid`/`confirmed` (+ comprovante). Pagamento tardio → `paid_late`/`under_review` (análise
`late_payment`), sem liberação. Valor divergente → análise `amount_mismatch`.

## 6. Decisões de arquitetura importantes

1. Backend é a única autoridade financeira; funções são `internal*` por padrão.
2. Providers por interface + `registry.ts`; mocks só com `APP_ENV=development`.
3. Duplicidade garantida **dentro da transação** (verificar e inserir na mesma mutation; índice de
   reservas por `personId`+data), não por "consultar e depois inserir".
4. **Porta única de eventos financeiros**: `providerEvents.ingest` / `ingestProviderEvent` registra,
   deduplica por (`provider`,`eventId`), decide e aplica. Também recebe o resultado imediato do
   cartão na criação (`created:<id>`).
5. **Cobrança em 3 passos** (`begin` registra a tentativa → chamada ao provedor → `complete`),
   com chave de idempotência `op_<operationId>_<forma>_<tentativa>`; no máximo 1 cobrança pendente
   por operação; até 3 tentativas.
6. Webhook futuro: `processProviderNotification` (assinatura → porta única) já existe, **sem rota
   HTTP**. A simulação de dev (`dev/simulate:simulatePayment`, interna, só `APP_ENV=development` e
   provider mock) usa o mesmo caminho.
7. Instantes em UTC (ms); datas de uso `YYYY-MM-DD`; ponte única para o fuso de São Paulo.
8. CPF nunca em claro (HMAC + máscara). Dados de cartão nunca entram (só token do provedor).

## 7. Limitações e pendências conhecidas

- Sem IP no Convex → sem limite por origem; um atacante pode bloquear temporariamente uma
  carteirinha (5 falhas = 15 min). Precisa de CAPTCHA/Turnstile ou proxy com origem.
- Sem proteção de temporização entre "carteirinha inexistente" e "CPF diverge".
- Formato de carteirinha (1–20 letras/números) é **premissa** a confirmar.
- `personId` oficial do cadastro do sindicato ainda precisa ser confirmado (duplicidade entre
  titulares depende dele).
- Stripe real: adaptador, verificação real de assinatura, mapeamento de `occurredAt` (instante do
  recebimento, não da entrega do webhook), rota HTTP — nada feito.
- `startPayment` não repassa `clientSecret` (3-D Secure) ao navegador.
- Trocar de Pix para cartão exige esperar o Pix pendente terminar (não há cancelamento no contrato).
- Cobranças órfãs/tentativas `creating` sem reconciliação automática.
- Comprovante PDF, e-mail, WhatsApp, painel admin (+ autenticação) não implementados.
- Operações antigas não são removidas; mocks não simulam latência nem falhas.
- `convex-test` não simula concorrência real (OCC); concorrência foi verificada manualmente em
  backend local e por testes que suspendem a 1ª chamada dentro do provedor.

## 8. Dados fictícios (provider mock)

| Carteirinha | CPF            | Associado                                                                     | Situação |
| ----------- | -------------- | ----------------------------------------------------------------------------- | -------- |
| 100001      | 100.000.001-08 | Ana Teste Almeida (dependentes Bruno e Clara)                                 | Ativo    |
| 100002      | 100.000.002-80 | Carlos Exemplo Souza (sem dependentes)                                        | Ativo    |
| 100003      | 100.000.003-61 | Daniela Modelo Lima (5 dependentes, 1 inativo; Clara é a mesma pessoa de Ana) | Ativo    |
| 900004      | 900.000.004-18 | Igor Inativo Ferreira                                                         | Inativo  |

Tokens de cartão do mock: `tok_mock_approved`, `tok_mock_declined`, `tok_mock_pending`,
`tok_mock_unavailable`. Simular pagamento:
`npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved"}'`
(`outcome`: `approved | declined | pending | approved_after_expiry`).

## 9. Como me ajudar (instruções para o GPT)

- Responda em português do Brasil.
- Se for pedido o próximo prompt de implementação, mantenha o estilo dos anteriores: objetivo,
  regras, segurança, arquitetura, testes, documentação, critérios de conclusão e "não faça X".
- Respeite as restrições: valores só no backend, nenhuma confirmação de pagamento pelo frontend,
  nada de dados de cartão, sem dados pessoais em logs.
- Próximos passos prováveis: (a) interfaces React consumindo a API pública acima; (b) integração
  real com Stripe + rota de webhook; (c) comprovante PDF + e-mail/WhatsApp; (d) painel
  administrativo para a fila de análise (`paymentReviews`) e alertas (`providerEvents`).

---

# Anexos: código-fonte relevante (estado atual)

## `convex/schema.ts`

```ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  alertStatus,
  chargeAttemptState,
  claimState,
  eventActor,
  financialStatus,
  householdRole,
  linkStatus,
  memberStatus,
  notificationChannel,
  notificationKind,
  notificationStatus,
  operationEventType,
  operationalStatus,
  paymentMethod,
  paymentProviderName,
  pixQrCode,
  providerEventOutcome,
  reviewReason,
  reviewStatus,
  transactionStatus,
} from './domain/statuses'

/**
 * Convenções:
 * - Valores monetários: inteiros em centavos, sufixo `Cents`.
 * - Instantes: `number` em ms desde a época Unix (UTC). `createdAt` é o `_creationTime` nativo.
 * - Datas de calendário (sem fuso, sem conversão): string `YYYY-MM-DD`. Ver `domain/time.ts`.
 * - Nada é apagado: o histórico é formado por linhas imutáveis e por `operationEvents`.
 * - Nenhuma informação clínica é armazenada.
 *
 * Detalhes e justificativas em docs/data-model.md.
 */
export default defineSchema({
  /**
   * IDENTIDADE: quem é a pessoa. `personId` é o identificador estável e único da pessoa no
   * cadastro oficial; é a base da prevenção global de duplicidade. NUNCA é o id de um vínculo.
   */
  people: defineTable({
    personId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
  }).index('by_person_id', ['personId']),

  /**
   * Titular (conta de associado). Cache do cadastro do sindicato, atualizado a cada consulta via
   * MemberProvider. O nome do titular pertence à pessoa (vínculo com papel `holder`).
   */
  members: defineTable({
    membershipNumber: v.string(),
    /** HMAC-SHA256 do CPF normalizado. O CPF completo nunca é persistido. */
    cpfHash: v.string(),
    /** Ex.: `***.***.***-09`. Somente para exibição. */
    cpfMasked: v.string(),
    status: memberStatus,
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_membership_number', ['membershipNumber'])
    .index('by_cpf_hash', ['cpfHash']),

  /**
   * VÍNCULO + PAPEL: liga uma pessoa a um titular. Todas as pessoas selecionáveis, inclusive o
   * próprio titular (`role = holder`), são vínculos. A mesma pessoa pode ter vários vínculos
   * (ex.: filha de dois titulares), cada um com seu id, mas todos apontam para a mesma `people`.
   */
  householdLinks: defineTable({
    memberId: v.id('members'),
    personRef: v.id('people'),
    /** Id do vínculo no cadastro de origem; chave de sincronização. */
    externalLinkId: v.string(),
    role: householdRole,
    status: linkStatus,
    updatedAt: v.number(),
  })
    // Também atende "vínculos (pessoas) por titular", pelo prefixo `memberId`.
    .index('by_member_and_external_link', ['memberId', 'externalLinkId']),

  /**
   * Intenção de pagamento. Todos os valores são calculados no backend.
   * O estado da operação é o par (`financialStatus`, `operationalStatus`) + `expiresAt`.
   */
  paymentOperations: defineTable({
    memberId: v.id('members'),
    /** Data de utilização das piscinas: data de calendário `YYYY-MM-DD`. */
    usageDate: v.string(),
    /** Igual ao número de linhas em `operationPeople`. */
    quantity: v.number(),
    unitAmountCents: v.number(),
    /** `quantity × unitAmountCents`. */
    totalAmountCents: v.number(),
    /** Instante (UTC, ms): `createdAt + 15 min`. */
    expiresAt: v.number(),
    /** O dinheiro foi recebido? (`unpaid | paid | paid_late`) */
    financialStatus,
    /** O que acontece com o direito de uso? (`awaiting_payment | confirmed | expired | under_review | rejected`) */
    operationalStatus,
    /** Instante do recebimento informado pelo provedor (`occurredAt`, UTC, ms). */
    paidAt: v.optional(v.number()),
    /** SHA-256 do token entregue ao navegador para acompanhar a operação. */
    accessTokenHash: v.string(),
    updatedAt: v.number(),
  }).index('by_member', ['memberId']),

  /**
   * Uma linha por pessoa selecionada. Serve de snapshot da seleção e de "reserva" por
   * pessoa/data: a unicidade de reservas `active` por (`personId`, `usageDate`) é a base da
   * prevenção de duplicidade (ver docs/business-rules.md).
   */
  operationPeople: defineTable({
    operationId: v.id('paymentOperations'),
    /** Cópia de `paymentOperations.usageDate`, necessária para o índice de duplicidade. */
    usageDate: v.string(),
    /** Identificador estável da PESSOA (não do vínculo). Chave da duplicidade global. */
    personId: v.string(),
    /** Vínculo pelo qual a pessoa foi selecionada (contexto de qual titular). */
    linkId: v.id('householdLinks'),
    /** Papel no momento da operação. */
    role: householdRole,
    /** Nome no momento da operação. */
    name: v.string(),
    /** `active` enquanto a operação bloqueia novas cobranças para a pessoa nesta data. */
    claim: claimState,
  })
    .index('by_operation', ['operationId'])
    .index('by_person_date_claim', ['personId', 'usageDate', 'claim']),

  /** Transação junto ao provedor de pagamento. Uma operação pode ter várias tentativas. */
  paymentTransactions: defineTable({
    operationId: v.id('paymentOperations'),
    provider: paymentProviderName,
    providerTransactionId: v.string(),
    method: paymentMethod,
    amountCents: v.number(),
    status: transactionStatus,
    /** Código copia-e-cola do Pix, para reexibir o QR Code. */
    pixCopyPasteCode: v.optional(v.string()),
    /** QR Code do Pix (imagem demonstrativa no mock). */
    qrCode: v.optional(pixQrCode),
    /** Instante (UTC, ms) em que a cobrança Pix deixa de aceitar pagamento, segundo o provedor. */
    chargeExpiresAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_operation', ['operationId'])
    // Necessário para resolver eventos do provedor de forma idempotente.
    .index('by_provider_transaction', ['provider', 'providerTransactionId']),

  /**
   * Tentativas de criar cobrança no provedor. A linha é gravada ANTES da chamada externa e é o
   * ponto de exclusão entre chamadas simultâneas (ver `payments/charges.ts`). Não guarda token de
   * cartão nem qualquer dado de pagamento.
   */
  chargeAttempts: defineTable({
    operationId: v.id('paymentOperations'),
    method: paymentMethod,
    /** 1, 2, 3...: parte da chave de idempotência enviada ao provedor. */
    attempt: v.number(),
    idempotencyKey: v.string(),
    state: chargeAttemptState,
    /** Início (ou retomada) da chamada ao provedor, UTC ms. */
    startedAt: v.number(),
    transactionId: v.optional(v.id('paymentTransactions')),
    /** Código técnico do erro do provedor (nunca texto livre nem dado pessoal). */
    errorCode: v.optional(v.string()),
  }).index('by_operation', ['operationId']),

  /**
   * Registro de TODO evento recebido do provedor (webhook), conhecido ou não. Guarda apenas
   * campos normalizados e não pessoais; o corpo bruto não é persistido.
   * - Origem + identificador (`provider`, `eventId`) identificam eventos repetidos.
   * - Evento de recebimento sem transação local correspondente gera alerta administrativo
   *   (`alertStatus = open`); nada é confirmado nem liberado.
   */
  providerEvents: defineTable({
    provider: paymentProviderName,
    /** Identificador do evento no provedor. */
    eventId: v.string(),
    providerTransactionId: v.string(),
    status: transactionStatus,
    amountCents: v.number(),
    /** Instante do evento segundo o provedor (UTC, ms). */
    occurredAt: v.number(),
    /** Quantas vezes este mesmo evento chegou (>1 = repetido). */
    occurrences: v.number(),
    /** Instante (UTC, ms) da última chegada. A primeira é o `_creationTime`. */
    lastReceivedAt: v.number(),
    /** Resultado do último processamento. */
    outcome: providerEventOutcome,
    operationId: v.optional(v.id('paymentOperations')),
    /** Presente quando o evento exige análise administrativa. */
    alertReason: v.optional(v.literal('unknown_transaction')),
    alertStatus: v.optional(alertStatus),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index('by_provider_event', ['provider', 'eventId'])
    // Fila de alertas do painel administrativo.
    .index('by_alert_status', ['alertStatus']),

  /**
   * Prova de identificação do associado (NÃO é login nem conta). Emitida quando carteirinha + CPF
   * conferem; vida curta. Só o hash do token é guardado. Funções públicas que recebem um
   * `memberId` exigem o token correspondente, para que um id sozinho nunca dê acesso.
   */
  identificationSessions: defineTable({
    memberId: v.id('members'),
    tokenHash: v.string(),
    /** Instante (UTC, ms) em que a prova deixa de valer. */
    expiresAt: v.number(),
  }).index('by_token_hash', ['tokenHash']),

  /**
   * Contadores de proteção contra abuso (janela fixa por chave). Linhas são apagadas por função
   * agendada quando a janela termina. Não guardam dado pessoal além do número da carteirinha
   * digitado em tentativas de identificação.
   */
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    /** Fim da janela (UTC, ms). */
    expiresAt: v.number(),
  }).index('by_key', ['key']),

  /** Fila de análise administrativa: recebimentos que não podem ser liberados automaticamente. */
  paymentReviews: defineTable({
    operationId: v.id('paymentOperations'),
    /** Transação que originou a análise. */
    transactionId: v.id('paymentTransactions'),
    reason: reviewReason,
    status: reviewStatus,
    resolvedAt: v.optional(v.number()),
    /** Identificação de quem decidiu (preenchida quando houver autenticação administrativa). */
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index('by_operation', ['operationId'])
    // Fila de pendências do painel administrativo.
    .index('by_status', ['status']),

  /** Histórico append-only de mudanças de estado da operação. */
  operationEvents: defineTable({
    operationId: v.id('paymentOperations'),
    type: operationEventType,
    actor: eventActor,
    /** Estados resultantes após o evento. */
    financialStatus,
    operationalStatus,
    note: v.optional(v.string()),
  }).index('by_operation', ['operationId']),

  /** Comprovante emitido após a confirmação do pagamento. Imutável. */
  receipts: defineTable({
    operationId: v.id('paymentOperations'),
    transactionId: v.id('paymentTransactions'),
    /** Sequencial legível por ano civil de São Paulo, ex.: `SC-2026-000001`. */
    receiptNumber: v.string(),
    /** Arquivo (PDF) no Convex File Storage; preenchido quando a geração do arquivo existir. */
    fileStorageId: v.optional(v.id('_storage')),
  })
    .index('by_operation', ['operationId'])
    // Geração do próximo número e validação de comprovantes.
    .index('by_receipt_number', ['receiptNumber']),

  /** Histórico de envios ao associado. Uma linha por tentativa de envio. */
  notifications: defineTable({
    operationId: v.id('paymentOperations'),
    /** Comprovante (`receipt`) ou atualização sobre análise (`payment_under_review`). */
    kind: notificationKind,
    /** Presente apenas quando `kind` é `receipt`. */
    receiptId: v.optional(v.id('receipts')),
    channel: notificationChannel,
    /** Destino mascarado. O destino real é lido do titular no momento do envio. */
    recipientMasked: v.string(),
    status: notificationStatus,
    providerMessageId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  }).index('by_operation', ['operationId']),
})
```

## `convex/domain/statuses.ts`

```ts
import { v, type Infer } from 'convex/values'

/**
 * Fonte única de verdade para enums de domínio.
 * Os validators alimentam o schema e os tipos TypeScript (via `Infer`) alimentam
 * contratos de providers e regras de negócio.
 */

export const memberStatus = v.union(v.literal('active'), v.literal('inactive'))
export type MemberStatus = Infer<typeof memberStatus>

/**
 * MODELO DE IDENTIDADE (três conceitos separados):
 * - PESSOA (`people`): quem é. Identificada por `personId`, estável e único no mundo real,
 *   fornecido pelo cadastro oficial. Nunca é o id de um vínculo.
 * - VÍNCULO (`householdLinks`): a ligação de uma pessoa com um titular. Uma pessoa pode ter
 *   vários vínculos (ex.: filha de dois titulares). Cada vínculo tem seu próprio id.
 * - PAPEL (`role`): como a pessoa se relaciona com o titular naquele vínculo.
 */
export const linkStatus = v.union(v.literal('active'), v.literal('inactive'))
export type LinkStatus = Infer<typeof linkStatus>

/** Papéis de dependentes (tudo menos o titular). */
export const dependentRole = v.union(
  v.literal('spouse'),
  v.literal('child'),
  v.literal('parent'),
  v.literal('other'),
)
export type DependentRole = Infer<typeof dependentRole>

/** Papel na associação familiar. `holder` é o próprio titular. */
export const householdRole = v.union(
  v.literal('holder'),
  v.literal('spouse'),
  v.literal('child'),
  v.literal('parent'),
  v.literal('other'),
)
export type HouseholdRole = Infer<typeof householdRole>

/**
 * Referência enviada pelo navegador: apenas indica QUAL vínculo (pessoa dentro da família do
 * titular) foi escolhido. Nunca nomes, papéis ou valores.
 */
export const personRef = v.object({ linkId: v.id('householdLinks') })
export type PersonRef = Infer<typeof personRef>

/**
 * ESTADO FINANCEIRO: o dinheiro da operação foi recebido?
 * - `unpaid`: nenhum recebimento válido para o valor da operação.
 * - `paid`: recebido dentro do prazo.
 * - `paid_late`: recebido depois do prazo.
 */
export const financialStatus = v.union(
  v.literal('unpaid'),
  v.literal('paid'),
  v.literal('paid_late'),
)
export type FinancialStatus = Infer<typeof financialStatus>

/**
 * ESTADO OPERACIONAL: o que acontece com o direito de uso das piscinas?
 * - `awaiting_payment`: aberta, dentro do prazo.
 * - `confirmed`: utilização liberada.
 * - `expired`: prazo encerrado sem recebimento.
 * - `under_review`: há recebimento que exige análise administrativa; nada é liberado.
 * - `rejected`: a análise concluiu que a utilização não será liberada.
 */
export const operationalStatus = v.union(
  v.literal('awaiting_payment'),
  v.literal('confirmed'),
  v.literal('expired'),
  v.literal('under_review'),
  v.literal('rejected'),
)
export type OperationalStatus = Infer<typeof operationalStatus>

/** Reserva da pessoa para a data (impede cobranças duplicadas). */
export const claimState = v.union(v.literal('active'), v.literal('released'))
export type ClaimState = Infer<typeof claimState>

export const reviewReason = v.union(
  /** Pagamento recebido depois do prazo. */
  v.literal('late_payment'),
  /** Valor recebido diferente do valor da operação. */
  v.literal('amount_mismatch'),
  /** Recebimento em operação já paga ou já encerrada (possível cobrança em duplicidade). */
  v.literal('unexpected_payment'),
  /** Pagamento no prazo, mas a pessoa já foi reservada por outra operação. */
  v.literal('claim_conflict'),
)
export type ReviewReason = Infer<typeof reviewReason>

export const reviewStatus = v.union(v.literal('open'), v.literal('approved'), v.literal('rejected'))
export type ReviewStatus = Infer<typeof reviewStatus>

export const operationEventType = v.union(
  v.literal('created'),
  v.literal('expired'),
  v.literal('payment_confirmed'),
  v.literal('review_opened'),
  v.literal('review_resolved'),
)
export type OperationEventType = Infer<typeof operationEventType>

export const eventActor = v.union(
  v.literal('member'),
  v.literal('system'),
  v.literal('provider'),
  v.literal('admin'),
)
export type EventActor = Infer<typeof eventActor>

export const paymentMethod = v.union(v.literal('pix'), v.literal('card'))
export type PaymentMethod = Infer<typeof paymentMethod>

export const paymentProviderName = v.union(v.literal('mock'), v.literal('stripe'))
export type PaymentProviderName = Infer<typeof paymentProviderName>

export const transactionStatus = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('canceled'),
  v.literal('expired'),
)
export type TransactionStatus = Infer<typeof transactionStatus>

/**
 * QR Code do Pix. `placeholder`: imagem demonstrativa (data URI SVG) que NÃO é escaneável, usada
 * pelo mock. `image_url`: imagem do provedor real.
 */
export const pixQrCode = v.object({
  kind: v.union(v.literal('placeholder'), v.literal('image_url')),
  value: v.string(),
})
export type PixQrCode = Infer<typeof pixQrCode>

/**
 * Tentativa de criar uma cobrança no provedor (registro ANTES da chamada externa, para que
 * chamadas simultâneas e repetidas não criem cobranças independentes).
 * - `creating`: a chamada ao provedor está em andamento (ou foi interrompida).
 * - `created`: o provedor respondeu e a transação local foi gravada.
 * - `error`: o provedor falhou; a retomada reaproveita a mesma chave de idempotência.
 */
export const chargeAttemptState = v.union(
  v.literal('creating'),
  v.literal('created'),
  v.literal('error'),
)
export type ChargeAttemptState = Infer<typeof chargeAttemptState>

export const notificationChannel = v.union(v.literal('email'), v.literal('whatsapp'))
export type NotificationChannel = Infer<typeof notificationChannel>

export const notificationKind = v.union(v.literal('receipt'), v.literal('payment_under_review'))
export type NotificationKind = Infer<typeof notificationKind>

export const notificationStatus = v.union(
  v.literal('pending'),
  v.literal('sent'),
  v.literal('failed'),
)
export type NotificationStatus = Infer<typeof notificationStatus>

const OPERATIONAL_TRANSITIONS: Readonly<Record<OperationalStatus, readonly OperationalStatus[]>> = {
  awaiting_payment: ['confirmed', 'expired', 'under_review'],
  // Confirmação no prazo que chegou depois de a expiração ter sido processada.
  expired: ['confirmed', 'under_review'],
  under_review: ['confirmed', 'rejected'],
  confirmed: [],
  rejected: [],
}

export function canTransitionOperational(from: OperationalStatus, to: OperationalStatus): boolean {
  return OPERATIONAL_TRANSITIONS[from].includes(to)
}

const FINANCIAL_TRANSITIONS: Readonly<Record<FinancialStatus, readonly FinancialStatus[]>> = {
  unpaid: ['paid', 'paid_late'],
  paid: [],
  paid_late: [],
}

export function canTransitionFinancial(from: FinancialStatus, to: FinancialStatus): boolean {
  return FINANCIAL_TRANSITIONS[from].includes(to)
}

/**
 * Transações: `succeeded` é terminal (dinheiro recebido nunca é 'desfeito' por evento fora de
 * ordem). Qualquer outro estado pode evoluir para `succeeded`, pois um recebimento efetivo não
 * pode ser descartado. Entre estados não terminais, só `pending` evolui.
 */
export function canTransitionTransaction(from: TransactionStatus, to: TransactionStatus): boolean {
  if (from === 'succeeded' || from === to) return false
  if (to === 'succeeded') return true
  return from === 'pending'
}

/** Resultado do processamento de um evento recebido do provedor de pagamento. */
export const providerEventOutcome = v.union(
  v.literal('confirmed'),
  v.literal('under_review'),
  v.literal('ignored'),
  v.literal('transaction_updated'),
  v.literal('unknown_transaction'),
)
export type ProviderEventOutcome = Infer<typeof providerEventOutcome>

export const alertStatus = v.union(v.literal('open'), v.literal('resolved'))
export type AlertStatus = Infer<typeof alertStatus>
```

## `convex/domain/confirmation.ts`

```ts
import { isExpired } from './pricing'
import type {
  FinancialStatus,
  OperationalStatus,
  ReviewReason,
  TransactionStatus,
} from './statuses'

/**
 * Decisão sobre uma notificação de pagamento do provedor. Função pura e determinística:
 * a mutation apenas executa o que ela decide, o que permite testar todos os cenários sem banco.
 *
 * Princípios:
 * 1. Notificação repetida não altera nada (idempotência).
 * 2. Dinheiro efetivamente recebido nunca é descartado, mesmo com a operação expirada.
 * 3. "No prazo" é decidido pelo instante do recebimento informado pelo provedor
 *    (`occurredAt`), não pelo momento em que a notificação chegou.
 * 4. Qualquer situação fora do caminho feliz vai para análise administrativa; nada é liberado
 *    automaticamente e nenhum reembolso é iniciado.
 */

export interface ConfirmationInput {
  readonly operation: {
    readonly financialStatus: FinancialStatus
    readonly operationalStatus: OperationalStatus
    readonly expiresAt: number
    readonly totalAmountCents: number
  }
  readonly transaction: { readonly status: TransactionStatus }
  readonly confirmation: {
    readonly status: TransactionStatus
    readonly amountCents: number
    readonly occurredAt: number
  }
}

export type ConfirmationDecision =
  /** Notificação já refletida no estado atual (repetida ou fora de ordem). */
  | { readonly kind: 'ignore' }
  /** Evento sem recebimento (falha, cancelamento, expiração no provedor). */
  | { readonly kind: 'update_transaction'; readonly status: TransactionStatus }
  /** Recebido no prazo e com valor correto: financeiro `paid`, operacional `confirmed`. */
  | { readonly kind: 'settle'; readonly reclaimClaims: boolean }
  /** Recebido, mas exige análise administrativa. */
  | {
      readonly kind: 'review'
      readonly reason: ReviewReason
      /** Novo estado financeiro; `null` mantém o atual. */
      readonly financialStatus: FinancialStatus | null
      /** Se `false`, a operação não muda: apenas a análise é aberta. */
      readonly escalateOperation: boolean
      /** A operação expirou e liberou as reservas; é preciso tentar retomá-las. */
      readonly reclaimClaims: boolean
    }

export function decideConfirmation({
  operation,
  transaction,
  confirmation,
}: ConfirmationInput): ConfirmationDecision {
  if (confirmation.status !== 'succeeded') {
    // `succeeded` nunca é rebaixado e o mesmo estado repetido não faz nada.
    if (transaction.status === 'succeeded' || transaction.status === confirmation.status) {
      return { kind: 'ignore' }
    }
    if (transaction.status !== 'pending') return { kind: 'ignore' }
    return { kind: 'update_transaction', status: confirmation.status }
  }

  if (transaction.status === 'succeeded') return { kind: 'ignore' }

  const reclaimClaims = operation.operationalStatus === 'expired'

  // Só operações abertas (`awaiting_payment`) ou recém-expiradas e sem recebimento podem ser
  // liquidadas automaticamente. Qualquer outro caso (já paga, em análise, encerrada) é um
  // recebimento inesperado: possível cobrança duplicada, que um administrador deve avaliar.
  const isSettleable =
    operation.operationalStatus === 'awaiting_payment' || operation.operationalStatus === 'expired'
  if (operation.financialStatus !== 'unpaid' || !isSettleable) {
    return {
      kind: 'review',
      reason: 'unexpected_payment',
      financialStatus: null,
      escalateOperation: false,
      reclaimClaims: false,
    }
  }

  if (confirmation.amountCents !== operation.totalAmountCents) {
    return {
      kind: 'review',
      reason: 'amount_mismatch',
      financialStatus: null,
      escalateOperation: true,
      reclaimClaims,
    }
  }

  if (isExpired(operation.expiresAt, confirmation.occurredAt)) {
    return {
      kind: 'review',
      reason: 'late_payment',
      financialStatus: 'paid_late',
      escalateOperation: true,
      reclaimClaims,
    }
  }

  return { kind: 'settle', reclaimClaims }
}
```

## `convex/domain/charges.ts`

```ts
import { isExpired } from './pricing'
import type {
  FinancialStatus,
  OperationalStatus,
  PaymentMethod,
  TransactionStatus,
} from './statuses'

/**
 * Regras puras da criação de cobranças (sem banco, sem provider). A mutation apenas carrega os
 * dados e executa o que estas funções decidem.
 *
 * Três estados diferentes, que nunca se confundem:
 * - ESTADO DA COBRANÇA (`paymentTransactions.status`): o que o provedor diz sobre UMA tentativa
 *   de pagamento (`pending | succeeded | failed | canceled | expired`).
 * - ESTADO FINANCEIRO da operação: o dinheiro foi recebido? (`unpaid | paid | paid_late`)
 * - ESTADO OPERACIONAL da operação: o direito de uso foi liberado? (`awaiting_payment |
 *   confirmed | expired | under_review | rejected`)
 * Cobrança `failed`, `canceled` ou `expired` NUNCA altera o estado financeiro: só um recebimento
 * (`succeeded`), validado por `decideConfirmation`, move a operação para `paid`/`paid_late`.
 */

export type NotPayableReason =
  | 'operation_expired'
  | 'operation_already_paid'
  | 'operation_under_review'
  | 'operation_closed'
  | 'invalid_operation_amount'

export type PayableCheck =
  { readonly ok: true } | { readonly ok: false; readonly code: NotPayableReason }

export interface PayableOperation {
  readonly financialStatus: FinancialStatus
  readonly operationalStatus: OperationalStatus
  readonly expiresAt: number
  readonly quantity: number
  readonly unitAmountCents: number
  readonly totalAmountCents: number
}

/**
 * A operação pode receber uma nova cobrança?
 *
 * A ordem importa: um recebimento já identificado (mesmo tardio) prevalece sobre "expirada",
 * para que o associado não seja orientado a pagar de novo.
 *
 * O valor é conferido de forma independente: a quantidade de pessoas gravadas precisa bater com a
 * `quantity` da operação, e o total precisa ser `quantity × unitAmountCents`, inteiro e positivo.
 * Qualquer inconsistência bloqueia a cobrança (fail closed) em vez de cobrar um valor duvidoso.
 */
export function checkOperationPayable(
  operation: PayableOperation,
  selectedPeopleCount: number,
  nowMs: number,
): PayableCheck {
  if (operation.financialStatus === 'paid' || operation.operationalStatus === 'confirmed') {
    return { ok: false, code: 'operation_already_paid' }
  }
  if (operation.financialStatus === 'paid_late' || operation.operationalStatus === 'under_review') {
    return { ok: false, code: 'operation_under_review' }
  }
  if (operation.operationalStatus === 'rejected') {
    return { ok: false, code: 'operation_closed' }
  }
  if (operation.operationalStatus === 'expired' || isExpired(operation.expiresAt, nowMs)) {
    return { ok: false, code: 'operation_expired' }
  }

  const { quantity, unitAmountCents, totalAmountCents } = operation
  const validAmount =
    Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    selectedPeopleCount === quantity &&
    Number.isSafeInteger(unitAmountCents) &&
    unitAmountCents >= 1 &&
    Number.isSafeInteger(totalAmountCents) &&
    totalAmountCents >= 1 &&
    totalAmountCents === quantity * unitAmountCents
  if (!validAmount) return { ok: false, code: 'invalid_operation_amount' }

  return { ok: true }
}

export interface ChargeAttemptSummary {
  readonly attempt: number
  readonly method: PaymentMethod
  readonly state: 'creating' | 'created' | 'error'
  /** Instante (ms) em que a tentativa foi iniciada (ou retomada). */
  readonly startedAt: number
}

export interface ChargeTransactionSummary {
  readonly method: PaymentMethod
  readonly status: TransactionStatus
}

export type ChargePlan =
  /** Já existe cobrança em aberto compatível: devolver a mesma, sem chamar o provedor. */
  | { readonly kind: 'reuse_existing' }
  /** Existe cobrança em aberto de OUTRA forma de pagamento. */
  | { readonly kind: 'conflict' }
  /** Outra chamada está criando a cobrança neste momento. */
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'too_many_attempts' }
  /** Criar (ou retomar) a tentativa `attempt`. `resume` mantém a chave de idempotência. */
  | { readonly kind: 'create'; readonly attempt: number; readonly resume: boolean }

/**
 * Decide o que fazer ao receber um pedido de cobrança, olhando as tentativas e as transações
 * anteriores da operação. Garante UMA cobrança em aberto por operação:
 *
 * - cobrança `pending` da mesma forma de pagamento → reaproveita (idempotência);
 * - cobrança `pending` de outra forma → conflito (evita dois pagamentos simultâneos);
 * - tentativa em andamento recente → `in_progress` (chamada simultânea);
 * - tentativa em andamento antiga (processo interrompido) ou terminada em erro, da mesma forma
 *   de pagamento → retoma com a MESMA chave de idempotência, para que o provedor devolva a mesma
 *   cobrança caso ela já tenha sido criada;
 * - cobrança anterior recusada/cancelada/expirada → nova tentativa, até o limite.
 *
 * Cobrança `succeeded` não chega aqui: `checkOperationPayable` já recusou a operação.
 */
export function planCharge(input: {
  readonly method: PaymentMethod
  readonly attempts: readonly ChargeAttemptSummary[]
  readonly transactions: readonly ChargeTransactionSummary[]
  readonly nowMs: number
  readonly staleAfterMs: number
  readonly maxAttempts: number
}): ChargePlan {
  const { method, attempts, transactions, nowMs, staleAfterMs, maxAttempts } = input

  const live = transactions.find((tx) => tx.status === 'pending')
  if (live) return live.method === method ? { kind: 'reuse_existing' } : { kind: 'conflict' }

  const last = attempts.reduce<ChargeAttemptSummary | null>(
    (latest, candidate) =>
      latest === null || candidate.attempt > latest.attempt ? candidate : latest,
    null,
  )

  if (last?.state === 'creating' && nowMs - last.startedAt < staleAfterMs) {
    return { kind: 'in_progress' }
  }
  if (last && last.state !== 'created' && last.method === method) {
    // Retomada: não conta como nova tentativa.
    return { kind: 'create', attempt: last.attempt, resume: true }
  }
  if (attempts.length >= maxAttempts) return { kind: 'too_many_attempts' }
  return { kind: 'create', attempt: (last?.attempt ?? 0) + 1, resume: false }
}

/** Chave de idempotência enviada ao provedor: estável para a mesma tentativa. */
export function chargeIdempotencyKey(
  operationId: string,
  method: PaymentMethod,
  attempt: number,
): string {
  return `op_${operationId}_${method}_${attempt}`
}
```

## `convex/public/members.ts`

```ts
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { action, query } from '../_generated/server'
import { isValidCpf, maskCpf, normalizeCpf } from '../domain/cpf'
import { buildFamilyView, parseMembershipNumber, type FamilyView } from '../domain/identification'
import { MAX_RAW_INPUT_LENGTH } from '../domain/limits'
import { hashCpf } from '../domain/privacy'
import { publicError, publicMessage, type PublicErrorCode } from '../domain/publicErrors'
import type { MemberStatus } from '../domain/statuses'
import { resolveMemberSelection } from '../members/family'
import { requireSession } from '../members/sessions'
import { ProviderError } from '../providers/errors'
import { getProviders } from '../providers/registry'

/**
 * FUNÇÕES PÚBLICAS: consulta cadastral e validação de seleção.
 * Tudo em `convex/public/` é alcançável pelo navegador; nada fora desta pasta é. Cada função
 * valida seus argumentos e nunca confia em titularidade ou situação enviadas pelo cliente.
 */

export interface LookupResult {
  member: {
    /** Identificador do associado, para as chamadas seguintes (junto com a prova). */
    id: Id<'members'>
    membershipNumber: string
    status: MemberStatus
    /** CPF mascarado (`***.***.***-09`). O CPF completo nunca é devolvido. */
    cpfMasked: string
  }
  holder: FamilyView<Id<'householdLinks'>>['holder']
  dependents: FamilyView<Id<'householdLinks'>>['dependents']
  /** Prova de identificação (vida curta). `null` quando o cadastro não está ativo. */
  session: { token: string; expiresAt: number } | null
  /** Texto para exibir quando o cadastro não permite prosseguir. */
  message?: string
}

/**
 * Consulta cadastral. O associado informa carteirinha e CPF.
 *
 * - Carteirinha inexistente e CPF divergente produzem a MESMA resposta (`identification_failed`).
 * - Formato inválido (CPF com dígitos errados etc.) é recusado antes de qualquer consulta; isso
 *   não revela nada sobre o cadastro.
 * - Falhas por carteirinha e volume global são limitados (ver `domain/limits.ts`).
 * - Titular inativo: como carteirinha + CPF conferiram, a situação é informada, sem prova de
 *   identificação (nada mais pode ser feito).
 * - Não devolve CPF completo, telefone, e-mail nem dados internos (`personId`, ids de vínculo da
 *   origem). Dependentes inativos aparecem com `selectable: false`.
 */
export const lookup = action({
  args: { membershipNumber: v.string(), cpf: v.string() },
  handler: async (ctx, args): Promise<LookupResult> => {
    const membershipNumber = parseMembershipNumber(args.membershipNumber)
    if (membershipNumber === null) throw publicError('invalid_membership_number')
    if (args.cpf.length > MAX_RAW_INPUT_LENGTH || !isValidCpf(args.cpf)) {
      throw publicError('invalid_cpf')
    }
    const cpf = normalizeCpf(args.cpf)

    const gate = await ctx.runMutation(internal.members.lookupGate.enter, { membershipNumber })
    if (!gate.allowed) {
      throw publicError('too_many_attempts', {
        retryAfterSeconds: Math.ceil(gate.retryAfterMs / 1000),
      })
    }

    // Falhas de configuração/provedor viram uma resposta genérica; o detalhe vai só para o log
    // (sem CPF nem carteirinha).
    let found
    try {
      found = await getProviders().members.lookupMember({ membershipNumber, cpf })
    } catch (error) {
      console.error(
        'lookup: falha no MemberProvider',
        error instanceof ProviderError ? error.code : 'unknown',
      )
      throw publicError('service_unavailable')
    }

    if (!found.found) {
      await ctx.runMutation(internal.members.lookupGate.recordFailure, { membershipNumber })
      throw publicError('identification_failed')
    }

    const secret = process.env.CPF_HASH_SECRET
    if (!secret || secret.length < 16) {
      console.error('lookup: CPF_HASH_SECRET ausente ou curto')
      throw publicError('service_unavailable')
    }
    const { member } = found

    const synced = await ctx.runMutation(internal.members.lookupGate.complete, {
      membershipNumber: member.membershipNumber,
      cpfHash: await hashCpf(cpf, secret),
      cpfMasked: maskCpf(cpf),
      status: member.status,
      phone: member.phone,
      email: member.email,
      holder: member.holder,
      dependents: member.dependents.map((dependent) => ({ ...dependent })),
    })

    const family = buildFamilyView({ memberStatus: member.status, links: synced.links })
    if (!family) throw publicError('service_unavailable')

    return {
      member: {
        id: synced.memberId,
        membershipNumber: member.membershipNumber,
        status: member.status,
        cpfMasked: maskCpf(cpf),
      },
      holder: family.holder,
      dependents: family.dependents,
      session: synced.session,
      ...(member.status === 'active' ? {} : { message: publicMessage('member_inactive') }),
    }
  },
})

export type ValidateSelectionResult =
  | {
      ok: true
      quantity: number
      people: { linkId: Id<'householdLinks'>; name: string; role: string }[]
    }
  | { ok: false; code: PublicErrorCode; message: string }

/**
 * Valida, no servidor, as pessoas selecionadas: pertencem ao grupo familiar deste titular, estão
 * ativas, não se repetem e a seleção não é vazia. Convidados não existem: só há vínculos
 * cadastrados. Não considera data nem duplicidade (ver `public/payments:checkDuplicates`).
 *
 * Seleção inválida é um resultado normal (`ok: false`); prova de identificação inválida é erro.
 */
export const validateSelection = query({
  args: {
    memberId: v.id('members'),
    identificationToken: v.string(),
    linkIds: v.array(v.id('householdLinks')),
  },
  handler: async (ctx, args): Promise<ValidateSelectionResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)
    const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
    if (!selection.ok) {
      return { ok: false, code: selection.code, message: publicMessage(selection.code) }
    }
    return {
      ok: true,
      quantity: selection.people.length,
      people: selection.people.map((person) => ({
        linkId: person.linkId,
        name: person.name,
        role: person.role,
      })),
    }
  },
})
```

## `convex/public/payments.ts`

```ts
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { action, mutation, query } from '../_generated/server'
import {
  CREATE_OPERATION_MAX_PER_MEMBER,
  CREATE_OPERATION_WINDOW_MS,
  MAX_PAYMENT_TOKEN_LENGTH,
} from '../domain/limits'
import type { OperationPresentation } from '../domain/messages'
import { hashAccessToken } from '../domain/privacy'
import { publicError, publicMessage, type PublicErrorCode } from '../domain/publicErrors'
import { paymentMethod } from '../domain/statuses'
import type {
  FinancialStatus,
  HouseholdRole,
  OperationalStatus,
  PaymentProviderName,
} from '../domain/statuses'
import { defaultUsagePolicy } from '../domain/usagePolicy'
import { resolveMemberSelection } from '../members/family'
import { requireSession } from '../members/sessions'
import { findConflicts } from '../payments/claims'
import {
  buildPaymentView,
  describeOperationState,
  type PaymentView,
  type StartPaymentResult,
} from '../payments/chargeView'
import { createOperationCore } from '../payments/operations'
import { ProviderError } from '../providers/errors'
import type { CardCharge, PixCharge } from '../providers/paymentProvider'
import { getPaymentProvider } from '../providers/registry'
import { readRateLimit, recordRateLimitHit } from '../security/rateLimit'

/**
 * FUNÇÕES PÚBLICAS: duplicidade, criação, cobrança e consulta de operação.
 * O navegador nunca envia valores nem estados: só *quem* (vínculos), *quando* (data) e *como
 * pagar* (Pix ou token de cartão). Não existe função pública que confirme pagamento ou altere
 * estado financeiro/operacional: isso só acontece por notificações autenticadas do provedor, fora desta pasta.
 */

const selectionArgs = {
  memberId: v.id('members'),
  /** Prova de identificação emitida por `public/members:lookup`. */
  identificationToken: v.string(),
  linkIds: v.array(v.id('householdLinks')),
}

export type CheckDuplicatesResult =
  | {
      ok: true
      usageDate: string
      hasConflicts: boolean
      /** Pessoas da seleção que já têm cobrança incompatível na data. */
      conflicts: { linkId: Id<'householdLinks'>; name: string }[]
    }
  | { ok: false; code: PublicErrorCode; message: string }

/**
 * Consulta de duplicidade. Informa quais pessoas SELECIONADAS (e já verificadas como membros
 * deste grupo familiar) possuem operação pendente, paga ou tardia em análise na data. Operação
 * expirada sem recebimento não bloqueia.
 *
 * É apenas informativa: entre esta consulta e a criação, outra solicitação pode ocupar a data.
 * A garantia de exclusividade está em `createOperation` (mesma transação da verificação).
 * Não revela de quem é a operação conflitante, nem de outros titulares.
 */
export const checkDuplicates = query({
  args: { ...selectionArgs, usageDate: v.string() },
  handler: async (ctx, args): Promise<CheckDuplicatesResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)

    const dateCheck = defaultUsagePolicy.checkUsageDate(args.usageDate, Date.now())
    if (!dateCheck.ok) {
      return { ok: false, code: dateCheck.code, message: publicMessage(dateCheck.code) }
    }
    const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
    if (!selection.ok) {
      return { ok: false, code: selection.code, message: publicMessage(selection.code) }
    }

    const conflicts = await findConflicts(ctx, selection.people, args.usageDate)
    return {
      ok: true,
      usageDate: args.usageDate,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map((person) => ({ linkId: person.linkId, name: person.name })),
    }
  },
})

export interface CreateOperationResult {
  operationId: Id<'paymentOperations'>
  /** Credencial para acompanhar ESTA operação (`getOperation`). Só o hash é guardado. */
  accessToken: string
  usageDate: string
  quantity: number
  /** Em centavos. Calculado pelo servidor. */
  unitAmountCents: number
  totalAmountCents: number
  /** Instante (UTC, ms) em que o prazo de pagamento termina. */
  expiresAt: number
  people: { name: string; role: HouseholdRole }[]
}

/**
 * Cria a operação de pagamento. Revalida tudo no servidor (prova de identificação, pessoas,
 * data, duplicidade), calcula quantidade e total (R$ 30,00 por pessoa), define a expiração em
 * 15 minutos e agenda a expiração. Argumentos extras (por exemplo um `totalAmountCents`
 * enviado pelo navegador) são recusados pelo validador do Convex.
 *
 * Duplicidade com operações simultâneas: a verificação e a inserção das reservas ocorrem nesta
 * mesma mutation, que é uma transação serializável com controle otimista de concorrência
 * (ver docs/business-rules.md).
 */
export const createOperation = mutation({
  args: { ...selectionArgs, usageDate: v.string() },
  handler: async (ctx, args): Promise<CreateOperationResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)

    // Proteção contra abuso: limite de operações criadas por titular. O contador só avança
    // quando a criação termina com sucesso (um erro desfaz a transação).
    const now = Date.now()
    const key = `create:${args.memberId}`
    const usage = await readRateLimit(ctx, key, now)
    if (usage.count >= CREATE_OPERATION_MAX_PER_MEMBER) {
      throw publicError('too_many_requests', {
        retryAfterSeconds: Math.ceil(usage.retryAfterMs / 1000),
      })
    }

    const created = await createOperationCore(ctx, {
      memberId: args.memberId,
      usageDate: args.usageDate,
      linkIds: args.linkIds,
    })
    await recordRateLimitHit(ctx, key, CREATE_OPERATION_WINDOW_MS, now)
    return created
  },
})

export interface OperationView {
  operationId: Id<'paymentOperations'>
  usageDate: string
  quantity: number
  unitAmountCents: number
  totalAmountCents: number
  expiresAt: number
  /**
   * Estado operacional EXIBIDO. Se o prazo já passou e a expiração agendada ainda não rodou,
   * mostra `expired` (a mutation de expiração é quem, de fato, libera as reservas).
   */
  operationalStatus: OperationalStatus
  financialStatus: FinancialStatus
  /** Código e texto para exibir ao associado (o motivo interno da análise não é exposto). */
  presentation: OperationPresentation
  people: { name: string; role: HouseholdRole }[]
  /** Número do comprovante, quando já emitido. */
  receiptNumber: string | null
  /** Cobrança mais recente da operação (para reexibir o Pix após recarregar a página). */
  payment: PaymentView | null
}

/**
 * Consulta de uma operação pela credencial dela (`operationId` + `accessToken`). Operação
 * inexistente e credencial incorreta produzem a mesma resposta (`operation_not_found`), então
 * não há como consultar operações de terceiros nem descobrir se um id existe. Não devolve
 * `memberId`, `personId`, ids de vínculo, CPF, contato nem transações do provedor.
 */
export const getOperation = query({
  args: { operationId: v.id('paymentOperations'), accessToken: v.string() },
  handler: async (ctx, args): Promise<OperationView> => {
    const operation = await ctx.db.get(args.operationId)
    const providedHash =
      args.accessToken.length > 0 && args.accessToken.length <= 128
        ? await hashAccessToken(args.accessToken)
        : null
    if (!operation || providedHash === null || operation.accessTokenHash !== providedHash) {
      throw publicError('operation_not_found')
    }

    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const receipt = await ctx.db
      .query('receipts')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .first()

    const now = Date.now()
    const state = describeOperationState(operation, now)
    const latestTransaction = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .order('desc')
      .first()

    return {
      operationId: operation._id,
      usageDate: operation.usageDate,
      quantity: operation.quantity,
      unitAmountCents: operation.unitAmountCents,
      totalAmountCents: operation.totalAmountCents,
      expiresAt: operation.expiresAt,
      operationalStatus: state.operationalStatus,
      financialStatus: state.financialStatus,
      presentation: state.presentation,
      people: people.map((person) => ({ name: person.name, role: person.role })),
      receiptNumber: receipt?.receiptNumber ?? null,
      payment: latestTransaction ? buildPaymentView(operation, latestTransaction, now) : null,
    }
  },
})

/**
 * Inicia o pagamento (Pix ou cartão) de uma operação existente.
 *
 * Recebe apenas a identificação da operação (`operationId` + `accessToken`, a mesma credencial de
 * `getOperation`), a forma de pagamento e, para cartão, o TOKEN gerado pelo SDK do provedor no
 * navegador. NUNCA recebe valor, estado, prazo, número de cartão, CVV ou dado bancário; qualquer
 * campo extra é recusado pelo validador do Convex. O valor cobrado é sempre o total armazenado da
 * operação.
 *
 * Validações (todas no servidor, em `payments/charges:begin`): a operação existe e a credencial
 * confere; está pendente (`unpaid` + `awaiting_payment`) e dentro do prazo; tem pessoas
 * selecionadas; o total é consistente (`quantidade × unitário`, inteiro e positivo); não há
 * cobrança anterior incompatível.
 *
 * Idempotência: repetir a chamada devolve a mesma cobrança (`reused: true`) sem chamar o
 * provedor; chamadas simultâneas competem pela mesma tentativa, registrada antes da chamada
 * externa, e a perdedora recebe `payment_in_progress` (basta repetir). A chave enviada ao
 * provedor é estável por operação, forma de pagamento e tentativa.
 *
 * O resultado da cobrança (ex.: cartão aprovado) entra pela porta única de eventos do provedor,
 * então um pagamento aprovado após o prazo vira `paid_late` + análise, nunca liberação
 * automática. O token de cartão não é gravado nem registrado em log.
 */
export const startPayment = action({
  args: {
    operationId: v.id('paymentOperations'),
    accessToken: v.string(),
    paymentMethod,
    /** Somente cartão: token do provedor (nunca dados do cartão). */
    paymentMethodToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    const token = args.paymentMethodToken
    if (args.paymentMethod === 'pix' && token !== undefined) {
      throw publicError('invalid_payment_method')
    }
    if (
      args.paymentMethod === 'card' &&
      (token === undefined || token.length === 0 || token.length > MAX_PAYMENT_TOKEN_LENGTH)
    ) {
      throw publicError('invalid_payment_method')
    }
    if (args.accessToken.length === 0 || args.accessToken.length > 128) {
      throw publicError('operation_not_found')
    }

    const begun = await ctx.runMutation(internal.payments.charges.begin, {
      operationId: args.operationId,
      accessTokenHash: await hashAccessToken(args.accessToken),
      method: args.paymentMethod,
    })
    if (begun.kind === 'existing') return begun.result

    // A tentativa já está registrada. A chamada ao provedor usa o valor lido da operação.
    let providerName: PaymentProviderName
    let charge: PixCharge | CardCharge
    try {
      const provider = getPaymentProvider()
      providerName = provider.name
      const base = {
        operationId: begun.operationId,
        idempotencyKey: begun.idempotencyKey,
        amountCents: begun.amountCents,
        description: begun.description,
        expiresAt: begun.expiresAt,
      }
      charge =
        args.paymentMethod === 'pix'
          ? await provider.createPixCharge(base)
          : await provider.createCardCharge({ ...base, paymentMethodToken: token ?? '' })

      if (
        typeof charge.providerTransactionId !== 'string' ||
        charge.providerTransactionId.length === 0 ||
        charge.amountCents !== begun.amountCents
      ) {
        // O provedor respondeu algo diferente do que foi pedido: não registramos como válido.
        throw new ProviderError('rejected', 'Resposta do provedor inconsistente com o pedido.')
      }
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unknown'
      await ctx.runMutation(internal.payments.charges.fail, {
        attemptId: begun.attemptId,
        errorCode: code,
      })
      // Só o código técnico vai para o log (nunca o token nem dados do cartão).
      console.error('startPayment: falha no PaymentProvider', code)
      throw publicError(
        code === 'invalid_request' && args.paymentMethod === 'card'
          ? 'invalid_payment_token'
          : 'service_unavailable',
      )
    }

    return await ctx.runMutation(internal.payments.charges.complete, {
      attemptId: begun.attemptId,
      provider: providerName,
      charge: {
        providerTransactionId: charge.providerTransactionId,
        status: charge.status,
        amountCents: charge.amountCents,
        ...('pixCopyPasteCode' in charge
          ? {
              pixCopyPasteCode: charge.pixCopyPasteCode,
              qrCode: charge.qrCode,
              chargeExpiresAt: charge.expiresAt,
            }
          : charge.failureReason !== null
            ? { failureReason: charge.failureReason }
            : {}),
      },
    })
  },
})
```

## `convex/providers/paymentProvider.ts`

```ts
import type { PaymentProviderName, PixQrCode, TransactionStatus } from '../domain/statuses'

/** Campos comuns a qualquer cobrança. O valor é sempre calculado pelo backend. */
export interface CreateChargeBase {
  /** Id da operação, enviado como metadado ao provedor. */
  readonly operationId: string
  /** Garante que repetir a chamada não gere cobrança duplicada. */
  readonly idempotencyKey: string
  /** Inteiro, em centavos (BRL). */
  readonly amountCents: number
  readonly description: string
  /** Instante limite (ms) para o pagamento; deve coincidir com `expiresAt` da operação. */
  readonly expiresAt: number
}

export type CreatePixChargeInput = CreateChargeBase

export interface CreateCardChargeInput extends CreateChargeBase {
  /**
   * Token gerado no navegador pelo SDK do provedor. O backend nunca recebe nem armazena
   * dados do cartão (escopo PCI mínimo).
   */
  readonly paymentMethodToken: string
}

export interface PixCharge {
  readonly providerTransactionId: string
  /** Pix nasce `pending`; o recebimento chega depois, por notificação do provedor. */
  readonly status: TransactionStatus
  /** Valor cobrado, em centavos, conforme o provedor. O backend confere com a operação. */
  readonly amountCents: number
  /** Payload "copia e cola" do Pix. */
  readonly pixCopyPasteCode: string
  /** QR Code para exibição (imagem do provedor ou, no mock, um placeholder não escaneável). */
  readonly qrCode: PixQrCode
  readonly expiresAt: number
}

export interface CardCharge {
  readonly providerTransactionId: string
  /**
   * `succeeded`/`failed` quando o provedor decide na própria criação; `pending` quando depende
   * de confirmação posterior (ex.: 3-D Secure). Qualquer resultado entra no backend pela mesma
   * porta de eventos (`providerEvents`), então prazo e valor continuam sendo verificados.
   */
  readonly status: TransactionStatus
  /** Valor cobrado, em centavos, conforme o provedor. O backend confere com a operação. */
  readonly amountCents: number
  /** Presente quando o provedor exige confirmação no navegador (ex.: 3-D Secure). */
  readonly clientSecret: string | null
  readonly failureReason: string | null
}

export interface PaymentStatusResult {
  readonly providerTransactionId: string
  readonly status: TransactionStatus
}

/** Requisição bruta recebida do provedor (ex.: webhook em uma HTTP action). */
export interface WebhookRequest {
  /** Corpo exatamente como recebido; necessário para verificar assinatura. */
  readonly rawBody: string
  /** Cabeçalhos com nomes em minúsculas. */
  readonly headers: Readonly<Record<string, string>>
}

/** Confirmação já autenticada e normalizada, independente do formato do provedor. */
export interface PaymentConfirmation {
  /** Identificador do evento no provedor, usado para idempotência. */
  readonly eventId: string
  readonly providerTransactionId: string
  readonly status: TransactionStatus
  /** Valor efetivamente cobrado; o backend o compara com o valor da operação. */
  readonly amountCents: number
  /** Instante (ms) do evento, segundo o provedor. */
  readonly occurredAt: number
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>
  createCardCharge(input: CreateCardChargeInput): Promise<CardCharge>
  getPaymentStatus(providerTransactionId: string): Promise<PaymentStatusResult>
  /**
   * Autentica (assinatura) e normaliza uma notificação do provedor.
   * Lança `ProviderError('invalid_signature')` se a autenticidade não puder ser comprovada.
   * Não altera nenhum dado: aplicar a confirmação é responsabilidade do backend.
   */
  processConfirmation(request: WebhookRequest): Promise<PaymentConfirmation>
}
```

## `convex/payments/operations.ts`

```ts
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../_generated/server'
import { generateAccessToken, hashAccessToken } from '../domain/privacy'
import { publicError } from '../domain/publicErrors'
import {
  PAYMENT_WINDOW_MS,
  calculateExpiresAt,
  calculateOperationAmounts,
  isExpired,
} from '../domain/pricing'
import { personRef } from '../domain/statuses'
import { defaultUsagePolicy } from '../domain/usagePolicy'
import { resolveMemberSelection } from '../members/family'
import { findConflicts, releaseClaims } from './claims'
import { recordEvent } from './events'

/**
 * Cria uma operação de pagamento. REGRA ÚNICA: tanto a função pública
 * (`public/payments:createOperation`) quanto a mutation interna abaixo chamam esta função, para
 * que nenhuma regra seja duplicada.
 *
 * Recebe apenas *quem* (vínculos) e *quando* (data). Valores, nomes, prazo e elegibilidade são
 * calculados/lidos aqui, nunca vindos do navegador.
 *
 * Toda a validação de duplicidade e a inserção das reservas acontecem NESTA transação
 * (ver `claims.ts` para a garantia de concorrência). Quem chama deve estar numa mutation.
 */
export async function createOperationCore(
  ctx: MutationCtx,
  args: {
    memberId: Id<'members'>
    usageDate: string
    linkIds: readonly Id<'householdLinks'>[]
  },
) {
  const now = Date.now()
  const policy = defaultUsagePolicy

  const dateCheck = policy.checkUsageDate(args.usageDate, now)
  if (!dateCheck.ok) throw publicError(dateCheck.code)

  const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
  if (!selection.ok) throw publicError(selection.code)
  const { member, people } = selection

  // Duplicidade: nenhuma pessoa pode ter reserva ativa (pendente, paga ou em análise) na data.
  const conflicts = await findConflicts(ctx, people, args.usageDate)
  if (conflicts.length > 0) {
    throw publicError('duplicate_usage', {
      names: conflicts.map((person) => person.name),
      linkIds: conflicts.map((person) => person.linkId),
    })
  }

  const amounts = calculateOperationAmounts(people.length, policy.unitAmountCents(args.usageDate))
  const accessToken = generateAccessToken()
  const expiresAt = calculateExpiresAt(now)

  const operationId = await ctx.db.insert('paymentOperations', {
    memberId: member._id,
    usageDate: args.usageDate,
    quantity: amounts.quantity,
    unitAmountCents: amounts.unitAmountCents,
    totalAmountCents: amounts.totalAmountCents,
    expiresAt,
    financialStatus: 'unpaid',
    operationalStatus: 'awaiting_payment',
    accessTokenHash: await hashAccessToken(accessToken),
    updatedAt: now,
  })

  for (const person of people) {
    await ctx.db.insert('operationPeople', {
      operationId,
      usageDate: args.usageDate,
      personId: person.personId,
      linkId: person.linkId,
      role: person.role,
      name: person.name,
      claim: 'active',
    })
  }

  await recordEvent(ctx, {
    operationId,
    type: 'created',
    actor: 'member',
    financialStatus: 'unpaid',
    operationalStatus: 'awaiting_payment',
  })

  await ctx.scheduler.runAfter(PAYMENT_WINDOW_MS, internal.payments.operations.expire, {
    operationId,
  })

  return {
    operationId,
    accessToken,
    usageDate: args.usageDate,
    quantity: amounts.quantity,
    unitAmountCents: amounts.unitAmountCents,
    totalAmountCents: amounts.totalAmountCents,
    expiresAt,
    people: people.map((person) => ({ name: person.name, role: person.role })),
  }
}

/** Versão interna (usada por testes e por futuras rotinas do servidor). */
export const create = internalMutation({
  args: {
    memberId: v.id('members'),
    usageDate: v.string(),
    people: v.array(personRef),
  },
  handler: (ctx, args) =>
    createOperationCore(ctx, {
      memberId: args.memberId,
      usageDate: args.usageDate,
      linkIds: args.people.map((person) => person.linkId),
    }),
})

/**
 * Expira a operação se o prazo acabou sem recebimento e libera as reservas, para que uma nova
 * tentativa não fique bloqueada. Idempotente: roda no agendamento e pode ser chamada de novo.
 * Não descarta nada: um recebimento posterior ainda é tratado em `confirmations.applyConfirmation`.
 */
export const expire = internalMutation({
  args: { operationId: v.id('paymentOperations') },
  handler: async (ctx, { operationId }) => {
    const operation = await ctx.db.get(operationId)
    if (!operation) return { expired: false }
    if (operation.operationalStatus !== 'awaiting_payment') return { expired: false }

    const now = Date.now()
    if (!isExpired(operation.expiresAt, now)) return { expired: false }

    await ctx.db.patch(operationId, { operationalStatus: 'expired', updatedAt: now })
    await releaseClaims(ctx, operationId)
    await recordEvent(ctx, {
      operationId,
      type: 'expired',
      actor: 'system',
      financialStatus: operation.financialStatus,
      operationalStatus: 'expired',
    })
    return { expired: true }
  },
})
```

## `convex/payments/charges.ts`

```ts
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { chargeIdempotencyKey, checkOperationPayable, planCharge } from '../domain/charges'
import { CHARGE_ATTEMPT_STALE_AFTER_MS, MAX_CHARGE_ATTEMPTS_PER_OPERATION } from '../domain/limits'
import { publicError } from '../domain/publicErrors'
import {
  paymentMethod,
  paymentProviderName,
  pixQrCode,
  transactionStatus,
} from '../domain/statuses'
import type { PaymentMethod } from '../domain/statuses'
import { buildStartPaymentResult, type StartPaymentResult } from './chargeView'
import { ingestProviderEvent } from './providerEvents'

/**
 * Etapas INTERNAS da criação de cobrança (`public/payments:startPayment`).
 *
 * A criação é uma action (fala com o provedor) dividida em três passos transacionais:
 *   1. `begin`    valida a operação e REGISTRA a tentativa (`chargeAttempts`) antes de qualquer
 *                 chamada externa; é o ponto de exclusão entre chamadas simultâneas;
 *   2. (action)   chama o provedor com o valor lido da operação e uma chave de idempotência;
 *   3. `complete` grava a transação local e, se o provedor já decidiu (cartão aprovado/recusado),
 *                 entrega o resultado à PORTA ÚNICA de eventos (`ingestProviderEvent`), que
 *                 aplica as regras de prazo, valor e análise. `fail` registra a falha do passo 2.
 *
 * Nada aqui é público. Nenhuma destas funções recebe valor monetário de fora: o valor sempre
 * vem de `paymentOperations.totalAmountCents`.
 */

export type BeginResult =
  | { kind: 'existing'; result: StartPaymentResult }
  | {
      kind: 'create'
      attemptId: Id<'chargeAttempts'>
      idempotencyKey: string
      operationId: Id<'paymentOperations'>
      amountCents: number
      expiresAt: number
      description: string
    }

function describeCharge(operation: Doc<'paymentOperations'>): string {
  const people = operation.quantity === 1 ? '1 pessoa' : `${operation.quantity} pessoas`
  return `Taxa médica das piscinas - ${people} - ${operation.usageDate}`
}

/**
 * Passo 1. Valida e decide (via `planCharge`) se cria, retoma, reaproveita ou recusa.
 *
 * Concorrência: a leitura de `chargeAttempts.by_operation` e de `paymentTransactions.by_operation`
 * entra no conjunto de leitura desta transação. Duas chamadas simultâneas para a mesma operação
 * conflitam: a reexecutada enxerga a tentativa `creating` da primeira e responde
 * `payment_in_progress`, ou a cobrança já criada e a reaproveita. Nunca há duas tentativas
 * ativas para a mesma operação.
 */
export const begin = internalMutation({
  args: {
    operationId: v.id('paymentOperations'),
    /** Hash do `accessToken` apresentado (o token em claro não chega a esta função). */
    accessTokenHash: v.string(),
    method: paymentMethod,
  },
  handler: async (ctx, args): Promise<BeginResult> => {
    const operation = await ctx.db.get(args.operationId)
    // Inexistente e credencial incorreta: mesma resposta.
    if (!operation || operation.accessTokenHash !== args.accessTokenHash) {
      throw publicError('operation_not_found')
    }

    const now = Date.now()
    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()

    const payable = checkOperationPayable(operation, people.length, now)
    if (!payable.ok) throw publicError(payable.code)

    const attempts = await ctx.db
      .query('chargeAttempts')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const transactions = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()

    const plan = planCharge({
      method: args.method,
      attempts,
      transactions,
      nowMs: now,
      staleAfterMs: CHARGE_ATTEMPT_STALE_AFTER_MS,
      maxAttempts: MAX_CHARGE_ATTEMPTS_PER_OPERATION,
    })

    switch (plan.kind) {
      case 'reuse_existing': {
        const live = transactions.find((tx) => tx.status === 'pending' && tx.method === args.method)
        if (!live) throw publicError('payment_in_progress')
        return { kind: 'existing', result: buildStartPaymentResult(operation, live, true, now) }
      }
      case 'conflict':
        throw publicError('payment_method_conflict')
      case 'in_progress':
        throw publicError('payment_in_progress', { retryAfterSeconds: 2 })
      case 'too_many_attempts':
        throw publicError('payment_attempts_exceeded')
      case 'create': {
        const idempotencyKey = chargeIdempotencyKey(operation._id, args.method, plan.attempt)
        let attemptId: Id<'chargeAttempts'>
        const resumed = plan.resume
          ? attempts.find((attempt) => attempt.attempt === plan.attempt)
          : undefined
        if (resumed) {
          attemptId = resumed._id
          await ctx.db.patch(attemptId, { state: 'creating', startedAt: now, errorCode: undefined })
        } else {
          attemptId = await ctx.db.insert('chargeAttempts', {
            operationId: operation._id,
            method: args.method,
            attempt: plan.attempt,
            idempotencyKey,
            state: 'creating',
            startedAt: now,
          })
        }
        return {
          kind: 'create',
          attemptId,
          idempotencyKey,
          operationId: operation._id,
          amountCents: operation.totalAmountCents,
          expiresAt: operation.expiresAt,
          description: describeCharge(operation),
        }
      }
    }
  },
})

/**
 * Passo 3. Grava a transação local e entrega o resultado à porta única de eventos.
 *
 * Idempotente: se a tentativa já foi concluída (uma retomada terminou antes), devolve a mesma
 * cobrança; se o provedor devolveu uma cobrança que já temos (mesma chave de idempotência), não
 * duplica a linha.
 *
 * A transação nasce sempre `pending`. Se o provedor já decidiu (cartão aprovado, recusado...),
 * o resultado entra por `ingestProviderEvent` com `occurredAt = agora`, de modo que um cartão
 * aprovado DEPOIS do prazo vira `paid_late` + análise, nunca liberação automática.
 */
export const complete = internalMutation({
  args: {
    attemptId: v.id('chargeAttempts'),
    provider: paymentProviderName,
    charge: v.object({
      providerTransactionId: v.string(),
      status: transactionStatus,
      amountCents: v.number(),
      pixCopyPasteCode: v.optional(v.string()),
      qrCode: v.optional(pixQrCode),
      chargeExpiresAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt) throw new Error('Tentativa de cobrança inexistente.')
    const operation = await ctx.db.get(attempt.operationId)
    if (!operation) throw new Error('Operação inexistente.')

    const now = Date.now()
    if (attempt.state === 'created' && attempt.transactionId) {
      const done = await ctx.db.get(attempt.transactionId)
      if (done) return buildStartPaymentResult(operation, done, true, now)
    }

    const { charge } = args
    const known = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_provider_transaction', (q) =>
        q.eq('provider', args.provider).eq('providerTransactionId', charge.providerTransactionId),
      )
      .unique()

    const transactionId =
      known?._id ??
      (await ctx.db.insert('paymentTransactions', {
        operationId: operation._id,
        provider: args.provider,
        providerTransactionId: charge.providerTransactionId,
        method: attempt.method,
        amountCents: charge.amountCents,
        status: 'pending',
        updatedAt: now,
        ...(charge.pixCopyPasteCode !== undefined
          ? { pixCopyPasteCode: charge.pixCopyPasteCode }
          : {}),
        ...(charge.qrCode !== undefined ? { qrCode: charge.qrCode } : {}),
        ...(charge.chargeExpiresAt !== undefined
          ? { chargeExpiresAt: charge.chargeExpiresAt }
          : {}),
        ...(charge.failureReason !== undefined ? { failureReason: charge.failureReason } : {}),
      }))

    await ctx.db.patch(attempt._id, { state: 'created', transactionId, errorCode: undefined })

    if (charge.status !== 'pending') {
      await ingestProviderEvent(ctx, {
        provider: args.provider,
        eventId: `created:${charge.providerTransactionId}`,
        providerTransactionId: charge.providerTransactionId,
        status: charge.status,
        amountCents: charge.amountCents,
        occurredAt: now,
      })
    }

    const transaction = await ctx.db.get(transactionId)
    const freshOperation = await ctx.db.get(operation._id)
    if (!transaction || !freshOperation) throw new Error('Registro de cobrança inconsistente.')
    return buildStartPaymentResult(freshOperation, transaction, false, now)
  },
})

/** Passo 2 falhou. A retomada (mesma forma de pagamento) reaproveita a chave de idempotência. */
export const fail = internalMutation({
  args: { attemptId: v.id('chargeAttempts'), errorCode: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt || attempt.state !== 'creating') return
    await ctx.db.patch(attempt._id, { state: 'error', errorCode: args.errorCode })
  },
})

export interface ChargeSnapshot {
  transactionId: Id<'paymentTransactions'>
  provider: Doc<'paymentTransactions'>['provider']
  providerTransactionId: string
  method: PaymentMethod
  status: Doc<'paymentTransactions'>['status']
  amountCents: number
  operationExpiresAt: number
}

/**
 * Cobrança alvo de uma simulação de desenvolvimento: a pendente mais recente da operação ou,
 * não havendo, a mais recente. Interna: usada só por `dev/simulate`.
 */
export const latestCharge = internalQuery({
  args: { operationId: v.id('paymentOperations') },
  handler: async (ctx, args): Promise<ChargeSnapshot | null> => {
    const operation = await ctx.db.get(args.operationId)
    if (!operation) return null
    const transactions = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .order('desc')
      .collect()
    const target = transactions.find((tx) => tx.status === 'pending') ?? transactions[0]
    if (!target) return null
    return {
      transactionId: target._id,
      provider: target.provider,
      providerTransactionId: target.providerTransactionId,
      method: target.method,
      status: target.status,
      amountCents: target.amountCents,
      operationExpiresAt: operation.expiresAt,
    }
  },
})
```

## `convex/payments/providerEvents.ts`

```ts
import { ConvexError, v } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from '../_generated/server'
import { paymentProviderName, transactionStatus } from '../domain/statuses'
import type {
  PaymentProviderName,
  ProviderEventOutcome,
  TransactionStatus,
} from '../domain/statuses'
import { applyConfirmation } from './confirmations'
import type { ConfirmationOutcome } from './confirmations'

/** Limite defensivo de leitura da fila de alertas. */
const MAX_ALERTS = 200

export interface IngestResult {
  /** `true` se este evento (mesma origem + mesmo id) já havia sido recebido. */
  duplicate: boolean
  outcome: ProviderEventOutcome
  /**
   * Resultado completo do processamento realizado AGORA (ids do comprovante/análise, etc.).
   * `null` quando o evento é um repetido já resolvido: nada foi reprocessado, portanto o
   * chamador NÃO deve enviar comprovante/avisos de novo.
   */
  result: ConfirmationOutcome | null
  /** Este recebimento abriu um alerta administrativo. */
  alertOpened: boolean
}

/** Evento normalizado do provedor (ver `PaymentProvider.processConfirmation`). */
export interface ProviderEventInput {
  provider: PaymentProviderName
  eventId: string
  providerTransactionId: string
  status: TransactionStatus
  amountCents: number
  occurredAt: number
}

/**
 * PORTA ÚNICA para eventos financeiros vindos do provedor (já autenticados e normalizados por
 * `PaymentProvider.processConfirmation`).
 *
 * 1. Registra a chegada (`providerEvents`): origem + id do evento, valores normalizados, quantas
 *    vezes chegou e o resultado. Isto acontece na MESMA transação do processamento: se algo
 *    falhar, nada é registrado pela metade e o provedor reenvia.
 * 2. Identifica repetição por (`provider`, `eventId`): um evento repetido não é reaplicado.
 * 3. Delega a decisão a `applyConfirmation`, que só confirma com uma transação NOSSA validada.
 * 4. Se a cobrança é desconhecida, registra o evento, abre um alerta administrativo e NÃO
 *    confirma nem libera nada. Não há reembolso nem liberação automática.
 *
 * Exceção deliberada à regra de "repetido não reaplica": se o evento anterior foi
 * `unknown_transaction`, a repetição tenta de novo. Isso cobre a corrida em que o webhook chega
 * antes de a transação local ser gravada; se agora a transação existe, o evento é processado e
 * o alerta é encerrado pelo sistema.
 *
 * Concorrência: a leitura do índice `by_provider_event` entra no conjunto de leitura da
 * transação; duas chegadas simultâneas do mesmo evento conflitam, e a reexecutada enxerga o
 * registro da primeira (contado como repetição, sem duplicar linha).
 */
export async function ingestProviderEvent(
  ctx: MutationCtx,
  args: ProviderEventInput,
): Promise<IngestResult> {
  if (
    args.eventId.trim() === '' ||
    args.providerTransactionId.trim() === '' ||
    !Number.isSafeInteger(args.amountCents) ||
    args.amountCents < 0 ||
    !Number.isFinite(args.occurredAt)
  ) {
    throw new ConvexError({ code: 'invalid_provider_event' })
  }

  const now = Date.now()
  const existing = await ctx.db
    .query('providerEvents')
    .withIndex('by_provider_event', (q) =>
      q.eq('provider', args.provider).eq('eventId', args.eventId),
    )
    .unique()

  const confirmation = {
    provider: args.provider,
    providerTransactionId: args.providerTransactionId,
    status: args.status,
    amountCents: args.amountCents,
    occurredAt: args.occurredAt,
  }

  if (!existing) {
    const result = await applyConfirmation(ctx, confirmation)
    const unknown = result.outcome === 'unknown_transaction'
    await ctx.db.insert('providerEvents', {
      provider: args.provider,
      eventId: args.eventId,
      providerTransactionId: args.providerTransactionId,
      status: args.status,
      amountCents: args.amountCents,
      occurredAt: args.occurredAt,
      occurrences: 1,
      lastReceivedAt: now,
      outcome: result.outcome,
      ...('operationId' in result ? { operationId: result.operationId } : {}),
      ...(unknown
        ? { alertReason: 'unknown_transaction' as const, alertStatus: 'open' as const }
        : {}),
    })
    return { duplicate: false, outcome: result.outcome, result, alertOpened: unknown }
  }

  // Repetição.
  const repeat = { occurrences: existing.occurrences + 1, lastReceivedAt: now }
  if (existing.outcome !== 'unknown_transaction') {
    await ctx.db.patch(existing._id, repeat)
    return { duplicate: true, outcome: existing.outcome, result: null, alertOpened: false }
  }

  const result = await applyConfirmation(ctx, confirmation)
  if (result.outcome === 'unknown_transaction') {
    await ctx.db.patch(existing._id, repeat)
    return { duplicate: true, outcome: 'unknown_transaction', result, alertOpened: false }
  }
  await ctx.db.patch(existing._id, {
    ...repeat,
    outcome: result.outcome,
    ...('operationId' in result ? { operationId: result.operationId } : {}),
    ...(existing.alertStatus === 'open'
      ? {
          alertStatus: 'resolved' as const,
          resolvedAt: now,
          resolvedBy: 'system',
          resolutionNote: 'Transação passou a existir; evento reprocessado.',
        }
      : {}),
  })
  return { duplicate: true, outcome: result.outcome, result, alertOpened: false }
}

export const ingest = internalMutation({
  args: {
    provider: paymentProviderName,
    eventId: v.string(),
    providerTransactionId: v.string(),
    status: transactionStatus,
    amountCents: v.number(),
    occurredAt: v.number(),
  },
  handler: (ctx, args): Promise<IngestResult> => ingestProviderEvent(ctx, args),
})

/**
 * Encerra um alerta após análise humana. NÃO altera operações, transações nem reservas:
 * decidir o que fazer com o dinheiro recebido (ex.: reembolso) é um processo manual externo.
 *
 * `internal` até existir autenticação administrativa; quando existir, uma função pública
 * deverá verificar o perfil e passar a identidade real em `resolvedBy`.
 */
export const resolveAlert = internalMutation({
  args: {
    providerEventId: v.id('providerEvents'),
    resolvedBy: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.providerEventId)
    if (!event) throw new ConvexError({ code: 'provider_event_not_found' })
    if (event.alertStatus !== 'open') throw new ConvexError({ code: 'alert_not_open' })
    await ctx.db.patch(event._id, {
      alertStatus: 'resolved',
      resolvedAt: Date.now(),
      resolvedBy: args.resolvedBy,
      resolutionNote: args.note,
    })
  },
})

/** Fila de alertas abertos para o painel administrativo (mais antigos primeiro). */
export const listOpenAlerts = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<'providerEvents'>[]> => {
    return await ctx.db
      .query('providerEvents')
      .withIndex('by_alert_status', (q) => q.eq('alertStatus', 'open'))
      .take(MAX_ALERTS)
  },
})
```

## `convex/payments/webhookProcessor.ts`

```ts
import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction, type ActionCtx } from '../_generated/server'
import type { ProviderEventOutcome } from '../domain/statuses'
import { ProviderError } from '../providers/errors'
import type { WebhookRequest } from '../providers/paymentProvider'
import { getPaymentProvider } from '../providers/registry'

/**
 * Processamento de uma notificação do provedor de pagamento (webhook). É o ÚNICO caminho pelo
 * qual um evento financeiro entra no sistema, hoje e quando existir a rota HTTP da Stripe:
 *
 *   corpo bruto + cabeçalhos
 *     → `PaymentProvider.processConfirmation`  (verifica a ASSINATURA e normaliza)
 *     → `providerEvents.ingest`                (registra, deduplica, decide, aplica)
 *
 * NÃO há rota HTTP nesta etapa (o teste `publicSurface` proíbe `http.ts`). Quando houver, a rota
 * deve apenas repassar o corpo EXATAMENTE como recebido e os cabeçalhos para
 * `processProviderNotification` e traduzir o resultado: `accepted` → 200; `rejected` com
 * `invalid_signature`/`invalid_request` → 400; `provider_unavailable` → 503 (o provedor reenvia).
 *
 * Esta função nunca recebe nem devolve dados pessoais, e não confia em nenhum campo antes de a
 * assinatura ser verificada pelo provider.
 */

export type NotificationResult =
  | {
      status: 'rejected'
      reason: 'invalid_signature' | 'invalid_request' | 'provider_unavailable'
    }
  | {
      status: 'accepted'
      /** O evento (mesma origem + id) já havia sido recebido. */
      duplicate: boolean
      outcome: ProviderEventOutcome
      /** O recebimento é de uma cobrança desconhecida e gerou alerta administrativo. */
      alertOpened: boolean
    }

function normalizeHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) normalized[name.toLowerCase()] = value
  return normalized
}

export async function processProviderNotification(
  ctx: ActionCtx,
  request: { rawBody: string; headers: Readonly<Record<string, string>> },
): Promise<NotificationResult> {
  const webhook: WebhookRequest = {
    rawBody: request.rawBody,
    headers: normalizeHeaders(request.headers),
  }

  let provider
  let confirmation
  try {
    provider = getPaymentProvider()
    confirmation = await provider.processConfirmation(webhook)
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'unknown'
    // Só o código técnico vai para o log: nunca o corpo nem os cabeçalhos.
    console.error('webhook: notificação não aceita', code)
    if (code === 'invalid_signature') return { status: 'rejected', reason: 'invalid_signature' }
    if (code === 'invalid_request') return { status: 'rejected', reason: 'invalid_request' }
    return { status: 'rejected', reason: 'provider_unavailable' }
  }

  try {
    const ingested = await ctx.runMutation(internal.payments.providerEvents.ingest, {
      provider: provider.name,
      eventId: confirmation.eventId,
      providerTransactionId: confirmation.providerTransactionId,
      status: confirmation.status,
      amountCents: confirmation.amountCents,
      occurredAt: confirmation.occurredAt,
    })
    return {
      status: 'accepted',
      duplicate: ingested.duplicate,
      outcome: ingested.outcome,
      alertOpened: ingested.alertOpened,
    }
  } catch (error) {
    if (error instanceof ConvexError) {
      // Evento autêntico, porém com valores inválidos (ex.: valor negativo).
      return { status: 'rejected', reason: 'invalid_request' }
    }
    throw error
  }
}

/** Ponto de entrada interno (para a futura rota HTTP e para a simulação de desenvolvimento). */
export const processNotification = internalAction({
  args: { rawBody: v.string(), headers: v.record(v.string(), v.string()) },
  handler: (ctx, args): Promise<NotificationResult> => processProviderNotification(ctx, args),
})
```

## `convex/dev/simulate.ts`

```ts
import { ConvexError, v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { processProviderNotification, type NotificationResult } from '../payments/webhookProcessor'
import { MOCK_WEBHOOK_SIGNATURE } from '../providers/mock/mockPaymentProvider'
import { getPaymentProvider } from '../providers/registry'

/**
 * SIMULAÇÃO DE PAGAMENTO, SOMENTE DESENVOLVIMENTO.
 *
 * Como o mock não tem relógio nem recebe dinheiro, esta função faz o papel do provedor: monta
 * uma notificação assinada (formato do mock) e a entrega ao MESMO processador que o webhook real
 * usará (`processProviderNotification`). Assim exercita a verificação de assinatura, o registro
 * do evento, a idempotência e as regras de prazo/valor/análise, sem atalhos.
 *
 * É `internalAction`: não existe para o navegador. Execute pelo painel do Convex ou pela CLI:
 *
 *   npx convex run dev/simulate:simulatePayment '{"operationId":"…","outcome":"approved"}'
 *
 * Mesmo sendo interna, recusa rodar fora de `APP_ENV=development` ou com provider diferente do
 * mock, para que uma configuração de produção nunca consiga "pagar" uma operação.
 *
 * Resultados (`outcome`):
 * - `approved`: recebimento agora (se o prazo já passou, é tardio, como na vida real);
 * - `declined`: cobrança recusada (nenhum recebimento);
 * - `pending`: confirma que segue pendente (nenhuma mudança);
 * - `approved_after_expiry`: recebimento com `occurredAt` depois do prazo → `paid_late` + análise.
 *
 * Repetir com o mesmo `eventId` simula reenvio do provedor; omitir gera um evento novo.
 */

export type SimulationOutcome = 'approved' | 'declined' | 'pending' | 'approved_after_expiry'

export interface SimulationResult {
  eventId: string
  providerTransactionId: string
  notification: NotificationResult
}

export const simulatePayment = internalAction({
  args: {
    operationId: v.id('paymentOperations'),
    outcome: v.union(
      v.literal('approved'),
      v.literal('declined'),
      v.literal('pending'),
      v.literal('approved_after_expiry'),
    ),
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SimulationResult> => {
    if (process.env.APP_ENV !== 'development') {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    let providerName: string
    try {
      providerName = getPaymentProvider().name
    } catch {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    if (providerName !== 'mock') throw new ConvexError({ code: 'simulation_disabled' })

    const target = await ctx.runQuery(internal.payments.charges.latestCharge, {
      operationId: args.operationId,
    })
    if (!target) throw new ConvexError({ code: 'no_charge_for_operation' })

    const now = Date.now()
    const status =
      args.outcome === 'declined' ? 'failed' : args.outcome === 'pending' ? 'pending' : 'succeeded'
    const occurredAt =
      args.outcome === 'approved_after_expiry'
        ? Math.max(now, target.operationExpiresAt + 1_000)
        : now
    const eventId = args.eventId ?? `sim_${args.outcome}_${crypto.randomUUID()}`

    const notification = await processProviderNotification(ctx, {
      rawBody: JSON.stringify({
        eventId,
        providerTransactionId: target.providerTransactionId,
        status,
        amountCents: target.amountCents,
        occurredAt,
      }),
      headers: { 'x-mock-signature': MOCK_WEBHOOK_SIGNATURE },
    })
    return { eventId, providerTransactionId: target.providerTransactionId, notification }
  },
})
```
