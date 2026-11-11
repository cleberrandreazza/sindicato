# Integrações externas

Contratos TypeScript em `convex/providers/`. As regras de negócio dependem apenas das
interfaces; implementações são escolhidas pelo `registry.ts`.

```text
convex/providers/
  errors.ts                  ProviderError (código + retryable)
  memberProvider.ts          contrato
  paymentProvider.ts         contrato
  notificationProvider.ts    contrato
  registry.ts                getProviders(env)
  mock/                      implementações de desenvolvimento
```

## Erros

Qualquer provider lança `ProviderError` com `code`
(`configuration | invalid_request | invalid_signature | rejected | unavailable`) e `retryable`
(verdadeiro por padrão só para `unavailable`). As regras de negócio decidem repetir, falhar ou
registrar sem conhecer o provedor.

## MemberProvider

Fonte da verdade do cadastro do sindicato.

```ts
lookupMember({ membershipNumber, cpf }): Promise<
  { found: false } | { found: true; member: ProviderMember }
>
```

- Entrada já validada pelo backend (CPF com 11 dígitos e dígitos verificadores corretos).
- `found: false` serve para carteirinha inexistente **e** CPF divergente.
- `ProviderMember`: `membershipNumber`, `holder` (`ProviderPerson`: `personId`, `name`), `status`
  (situação cadastral), `phone?`, `email?`, `dependents[]` (`ProviderDependentLink`: `linkId`,
  `person` com `personId` e `name`, `role`, `status`).
- **`personId` é obrigatório e é a identidade da pessoa:** estável (nunca muda), único (uma
  pessoa, um id, mesmo que conste em várias famílias ou como titular e dependente) e
  independente do vínculo (`linkId`) e do titular. A prevenção global de duplicidade depende
  dele. **Pendente:** confirmar com o sindicato que o cadastro oficial tem esse identificador.
  Sem ele, a duplicidade entre titulares diferentes não pode ser garantida.
- O retorno é gravado por `members/sync` (`syncMemberFromProvider`, chamado pela consulta pública
  via `members/lookupGate:complete`; pessoas, vínculos, papéis).
- O provider **não** decide elegibilidade; o backend decide. Titular inativo é informado ao
  associado (situação cadastral) mas não recebe prova de identificação nem pode selecionar ninguém.
- **Uso pela API pública** (`public/members:lookup`, ver
  [architecture.md](./architecture.md#api-pública-contrato-com-o-frontend)):
  - O backend valida o formato e o CPF **antes** de chamar o provider; formato inválido nunca chega
    a ele.
  - Qualquer exceção do provider (`unavailable`, `configuration`, exceção inesperada) vira
    `service_unavailable` para o navegador; só o código do erro é registrado em log, sem carteirinha
    nem CPF.
  - `found: false` e CPF divergente produzem **a mesma resposta** pública.
  - Variáveis de ambiente necessárias no deployment: `APP_ENV` (`development` para usar mocks),
    `CPF_HASH_SECRET` (≥ 16 caracteres; sem ele a consulta responde `service_unavailable`),
    `MEMBER_PROVIDER` quando diferente do padrão.
  - O contrato assume que `phone`/`email` do provider são usados só no backend (comprovante); a API
    pública não os devolve.

## PaymentProvider

| Método                     | Função                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPixCharge(input)`   | Cria cobrança Pix; devolve `providerTransactionId`, `status`, `amountCents`, `pixCopyPasteCode`, `qrCode`, `expiresAt`.                     |
| `createCardCharge(input)`  | Cobra cartão a partir de `paymentMethodToken`; devolve `providerTransactionId`, `status`, `amountCents`, `clientSecret?`, `failureReason?`. |
| `getPaymentStatus(id)`     | Consulta a situação (reconciliação, polling de segurança).                                                                                  |
| `processConfirmation(req)` | Autentica a assinatura e normaliza o webhook em `PaymentConfirmation`.                                                                      |

Regras do contrato:

- `amountCents` é sempre calculado pelo backend a partir da operação (`paymentOperations.totalAmountCents`,
  lido dentro da transação que valida a operação); o navegador nunca o informa.
- A **resposta** também traz `amountCents`: o backend a compara com o pedido e, se divergir (ou
  vier sem id), trata como falha e **não** registra a cobrança.
- `idempotencyKey` obrigatório: repetir a chamada não duplica a cobrança. É estável por operação,
  forma de pagamento e tentativa (`op_<operationId>_<pix|card>_<n>`): uma retomada após falha ou
  interrupção usa a **mesma** chave, então o provedor deve devolver a mesma cobrança. Um adaptador
  real deve repassá-la ao provedor (ex.: cabeçalho `Idempotency-Key` da Stripe).
- `status` da cobrança criada: Pix nasce `pending`. Cartão pode voltar `succeeded`, `failed` ou
  `pending` (ex.: 3-D Secure). **Qualquer resultado entra no backend como evento** (id
  `created:<providerTransactionId>`, `occurredAt` = instante da resposta) pela mesma porta dos
  webhooks, então prazo, valor e análise são verificados também aqui.
- `qrCode`: `{ kind: 'placeholder' | 'image_url', value }`. O mock usa `placeholder` (data URI
  SVG não escaneável); um adaptador real usa `image_url`.
- `expiresAt` da cobrança deve coincidir com o da operação (limite de 15 min).
- Dados de cartão nunca passam pelo backend; apenas o token do SDK do provedor.
- `processConfirmation` **não grava nada**; apenas valida e normaliza. O backend confere o
  valor, localiza a transação e aplica a mudança de forma idempotente
  (`payments/providerEvents.ingest` → `applyConfirmation`, que usa `decideConfirmation`).
- `PaymentConfirmation.occurredAt` **deve ser o instante em que o provedor recebeu o dinheiro**
  (não o momento em que o webhook foi entregue): é ele que decide se o pagamento foi no prazo
  ou tardio. Adaptadores reais devem mapear esse campo com cuidado (ex.: data do evento de
  pagamento no provedor).
- `eventId` é **obrigatório** e, junto com a origem, identifica o evento em `providerEvents`:
  um mesmo evento reenviado é detectado e não reaplicado. Além disso, a idempotência por estado
  da transação (`succeeded` é terminal) protege contra eventos _diferentes_ da mesma cobrança.
  Adaptadores reais devem mapear `eventId` para o id estável do evento do provedor (ex.: `evt_...`
  do Stripe), nunca para um valor gerado a cada entrega.
- O provedor pode reenviar eventos e entregá-los fora de ordem; ambos são tolerados (sucesso
  nunca é rebaixado por um evento de falha atrasado).
- Toda cobrança criada no provedor deve ter uma linha local em `paymentTransactions` para que a
  confirmação seja localizada. Evento de cobrança desconhecida é **registrado** em
  `providerEvents` com `outcome = unknown_transaction` e abre um **alerta administrativo**, pois
  pode haver dinheiro recebido sem registro local. Nada é confirmado, liberado ou reembolsado
  automaticamente. Ver [business-rules.md](./business-rules.md#eventos-recebidos-do-provedor).
- A rota HTTP do webhook (futura) deve: `processConfirmation` → `providerEvents.ingest` → agir
  conforme `result` (só notificar quando `result !== null`). Esse caminho já existe, sem a rota,
  em `payments/webhookProcessor.processProviderNotification` (ver
  [Webhook e integração futura](#webhook-e-integração-futura-stripe)).

## Webhook e integração futura (Stripe)

**Não existe rota HTTP de confirmação** (o teste `publicSurface` proíbe `http.ts`), e nenhuma
função pública altera estado financeiro. O que está pronto para receber a Stripe:

```text
rota HTTP (futura)  ──►  processProviderNotification(rawBody, headers)  ──►  providerEvents.ingest
                          (convex/payments/webhookProcessor.ts)              (porta única)
                            1. PaymentProvider.processConfirmation: ASSINATURA + normalização
                            2. ingest: registra, deduplica, decide, aplica
```

`processProviderNotification` nunca recebe dados pessoais e devolve, para a rota traduzir:

| Resultado                                          | Quando                                                                                 | HTTP sugerido            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `accepted` (`duplicate`, `outcome`, `alertOpened`) | Assinatura válida e evento processado (inclusive repetido ou de cobrança desconhecida) | 200                      |
| `rejected: invalid_signature`                      | Assinatura ausente ou inválida                                                         | 400                      |
| `rejected: invalid_request`                        | Corpo malformado ou valores inválidos                                                  | 400                      |
| `rejected: provider_unavailable`                   | Provider mal configurado/indisponível                                                  | 503 (o provedor reenvia) |

Como cada requisito da integração futura é atendido:

| Requisito                        | Onde                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Validação da assinatura          | `PaymentProvider.processConfirmation` (no mock, cabeçalho `x-mock-signature`); a rota repassa o **corpo bruto** |
| Identificação do evento          | `eventId` obrigatório → `providerEvents.by_provider_event`                                                      |
| Idempotência                     | Evento repetido não é reaplicado; `succeeded` é terminal (protege eventos _diferentes_ da mesma cobrança)       |
| Eventos desconhecidos            | Registrados + alerta administrativo; nada confirmado; reprocessados se a transação local passar a existir       |
| Confirmações fora de ordem       | Falha/expiração depois de sucesso é ignorada; sucesso depois de expiração local retoma as reservas              |
| Confirmações tardias             | `occurredAt` > prazo → `paid_late` + análise; nunca liberação automática nem reembolso                          |
| Corrida webhook × gravação local | O evento que chega antes da transação local fica `unknown_transaction` e é reaplicado na repetição              |

**Dependerá da integração real (nada disso existe):**

- Adaptador `StripePaymentProvider` registrado em `registry.ts` (`PAYMENT_PROVIDER=stripe`): mapear
  `createPixCharge`/`createCardCharge` para PaymentIntents (Pix e cartão em BRL habilitados na
  conta), repassar a `idempotencyKey`, devolver `image_url` do QR e o `copia e cola` reais.
- Verificação real da assinatura (`Stripe-Signature` + segredo do endpoint) em `processConfirmation`,
  sobre o corpo **bruto**; tolerância de timestamp contra replay.
- Mapeamento correto de `eventId` (`evt_...`), `providerTransactionId` (`pi_...`) e, principalmente,
  de `occurredAt` para o **instante em que o dinheiro foi recebido** (não a entrega do webhook):
  é ele que separa `paid` de `paid_late`.
- A rota HTTP (`httpRouter`) que chama `processProviderNotification` e traduz o resultado; só então
  o teste `publicSurface` deverá ser ajustado conscientemente.
- Token de cartão do SDK da Stripe no navegador (Elements) e fluxo 3-D Secure (`clientSecret`):
  hoje o contrato devolve `clientSecret`, mas `startPayment` ainda **não o repassa ao navegador**.
- Cancelamento de cobrança pendente no provedor (permitiria trocar de Pix para cartão sem esperar
  o prazo) e expiração do Pix alinhada a 15 minutos.
- Reconciliação (`getPaymentStatus`) para cobranças cujo webhook nunca chegou e para tentativas
  `creating` órfãs (ver [business-rules.md](./business-rules.md#limitações-do-mock)).
- Notificações (e-mail/WhatsApp) e comprovante em PDF: continuam fora desta etapa.

## Simulação de pagamento (somente desenvolvimento)

`convex/dev/simulate.ts` faz o papel do provedor. É `internalAction`: não aparece na API do
navegador, e ainda assim recusa rodar sem `APP_ENV=development` ou com provider diferente do mock
(`simulation_disabled`). Monta uma notificação **assinada** e a entrega ao mesmo processador do
webhook, de modo que exercita assinatura, registro, idempotência e regras de prazo/valor/análise.

```bash
# Painel do Convex (Functions) ou CLI. `outcome`: approved | declined | pending | approved_after_expiry
npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved"}'
# Reenvio do mesmo evento (idempotência): repita o mesmo eventId
npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved","eventId":"evt-1"}'
```

| `outcome`               | Efeito                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `approved`              | Recebimento agora. No prazo → `paid`/`confirmed` + comprovante; se o prazo já passou → tardio |
| `declined`              | Cobrança `failed`; **nenhum recebimento**; operação continua pendente                         |
| `pending`               | Reafirma pendência; nada muda                                                                 |
| `approved_after_expiry` | Recebimento com `occurredAt` após o prazo → `paid_late` + `under_review`; nada é liberado     |

Alvo: a cobrança pendente mais recente da operação (ou a mais recente, se nenhuma estiver pendente).
Erros: `simulation_disabled`, `no_charge_for_operation`.

## NotificationProvider

| Método                                          | Função                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `sendReceiptEmail({to, content})`               | Envia o comprovante por e-mail.                            |
| `sendReceiptWhatsApp({toPhone, content})`       | Envia o comprovante por WhatsApp.                          |
| `sendPaymentUpdateEmail({to, content})`         | Envia atualização sobre pagamento em análise por e-mail.   |
| `sendPaymentUpdateWhatsApp({toPhone, content})` | Envia atualização sobre pagamento em análise por WhatsApp. |

- `toPhone` em E.164. O conteúdo do comprovante traz número, titular, data, nomes, total e
  `receiptUrl` opcional.
- A atualização (`PaymentUpdateNotificationContent`) traz `memberName`, `usageDate` e o texto
  pronto em `message`, vindo de `domain/messages.ts`: para confirmação tardia, `LATE_PAYMENT_MESSAGE`.
  O provider não monta texto de negócio; apenas o entrega. Assim a tela, o e-mail e o WhatsApp
  dizem exatamente a mesma coisa.
- Ao receber `under_review` em `ingest(...).result` (não nulo), o chamador (webhook) deve agendar o envio
  da atualização nos dois canais, gravando `notifications.kind = 'payment_under_review'`.
  **Ainda não implementado**: apenas contrato, schema e mock. O WhatsApp real exigirá template
  aprovado para mensagens iniciadas pela empresa.
- Canais independentes: falha em um não impede o outro. Cada tentativa vira uma linha em
  `notifications`.

## Seleção de implementação (`registry.ts`)

Variáveis do **deployment Convex** (não do `.env.local`):

| Variável                | Valores                   | Observação                                                      |
| ----------------------- | ------------------------- | --------------------------------------------------------------- |
| `APP_ENV`               | `development`             | Sem isso, mocks são **recusados** e nada é assumido por padrão. |
| `MEMBER_PROVIDER`       | `mock`                    | Em `development`, o padrão é `mock`.                            |
| `PAYMENT_PROVIDER`      | `mock` (futuro: `stripe`) | idem                                                            |
| `NOTIFICATION_PROVIDER` | `mock`                    | idem                                                            |
| `CPF_HASH_SECRET`       | string ≥ 16 chars         | Segredo do HMAC do CPF (`domain/privacy.ts`).                   |

Para adicionar uma integração real:

1. Criar a classe implementando a interface (ex.: `stripe/stripePaymentProvider.ts`).
2. Registrá-la no mapa de fábricas correspondente em `registry.ts`.
3. Selecionar com a variável de ambiente (`PAYMENT_PROVIDER=stripe`).
4. Ampliar, se necessário, `paymentProviderName` em `domain/statuses.ts` (já inclui `stripe`).

Nenhuma regra de negócio muda.

## Mocks

Somente desenvolvimento. Não registram dados pessoais.

- **MemberProvider mock:** 4 associados fictícios (ver README). Carteirinha ou CPF errados
  retornam `found: false`. Limitações para a API pública: devolve sempre os mesmos dados (as
  situações cadastrais não mudam), sem latência, sem indisponibilidade e sem divergência de
  temporização; portanto não exercita o tratamento de `service_unavailable` fora dos testes (que
  simulam falhas) nem permite avaliar vazamento por tempo de resposta. O formato aceito de
  carteirinha (1 a 20 letras/números) é uma **premissa** a confirmar com o cadastro real.
- **PaymentProvider mock:** sem estado; o resultado fica codificado no id da transação
  (`mock_<método>_<resultado>_<idempotencyKey>`), o que o torna idempotente (mesma chave, mesma
  cobrança).
  - Pix: devolve `amountCents`, um "copia e cola" fictício (`MOCK-PIX-NAO-PAGAVEL:<sufixo opaco>`,
    que **não** segue o formato EMV `000201…` de um Pix real e não embute id interno) e um QR
    placeholder (desenho `DEMONSTRAÇÃO` em SVG, não escaneável).
  - Tokens de cartão fictícios: `tok_mock_approved` (aprova na criação), `tok_mock_declined`
    (recusa, `card_declined`), `tok_mock_pending` (cobrança pendente com `clientSecret` fictício) e
    `tok_mock_unavailable` (simula indisponibilidade); qualquer outro é `invalid_request`.
    **Nenhum dado de cartão existe**; só tokens.
  - Pix: nasce `pending`. A confirmação é simulada enviando a `processConfirmation` um corpo
    JSON `{ eventId, providerTransactionId, status, amountCents, occurredAt }` com o cabeçalho
    `x-mock-signature: mock-signature`.
  - Cartão: token `tok_mock_approved` aprova; `tok_mock_declined` recusa
    (`failureReason: 'card_declined'`); qualquer outro é `invalid_request`.
  - **Pagamento tardio:** o mock não tem relógio e nunca entrega uma confirmação atrasada por
    conta própria. Para simular, informe um `occurredAt` posterior a `expiresAt` da operação.
    Os cenários (no prazo, tardio, repetido, divergente) são exercitados nos testes de
    `tests/convex/lifecycle.test.ts`.
- **NotificationProvider mock:** valida o formato do destino e devolve um `providerMessageId`
  simulado para comprovante e para atualização de pagamento; nada é enviado.

Limitações completas do mock em [business-rules.md](./business-rules.md#limitações-do-mock).

## Contrato de erros da API pública (para o frontend)

Erros de regra chegam como `ConvexError` com `data = { code, message, ...extras }`. Mostre
`message` (texto aprovado para o associado) e decida o fluxo por `code`. Erros de validação de
argumentos (`Validator error`, ex.: campo extra ou id malformado) indicam bug do cliente e não
devem ser exibidos ao associado.

| `code`                                     | Quando                                                            | Extras                       |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------- |
| `invalid_membership_number`, `invalid_cpf` | Formato inválido (não conta como tentativa)                       |                              |
| `identification_failed`                    | Carteirinha inexistente **ou** CPF divergente (indistinguíveis)   |                              |
| `too_many_attempts`                        | Falhas demais na carteirinha / limite global                      | `retryAfterSeconds`          |
| `service_unavailable`                      | Cadastro indisponível ou falha de configuração                    |                              |
| `session_invalid`                          | Prova de identificação ausente, expirada ou de outro titular      | Peça nova consulta cadastral |
| `member_inactive`                          | Titular inativo                                                   |                              |
| `empty_selection`, `duplicate_person`      | Seleção vazia ou com pessoa repetida                              |                              |
| `link_not_found`, `link_inactive`          | Pessoa não vinculada a este titular / dependente inativo          |                              |
| `invalid_selection`                        | Seleção grande demais (acima de 200 vínculos)                     |                              |
| `invalid_usage_date`, `past_usage_date`    | Data inexistente/mal formatada ou anterior a hoje (São Paulo)     |                              |
| `duplicate_usage`                          | Alguém da seleção já tem operação ativa na data                   | `linkIds`, `names`           |
| `too_many_requests`                        | Criações demais por titular (10 em 15 min)                        | `retryAfterSeconds`          |
| `operation_not_found`                      | Operação inexistente **ou** credencial incorreta                  |                              |
| `operation_expired`                        | Prazo de 15 minutos encerrado (mesmo antes da expiração agendada) |                              |
| `operation_already_paid`                   | Pagamento já identificado                                         |                              |
| `operation_under_review`                   | Recebimento (ex.: tardio) em verificação: não pagar de novo       |                              |
| `operation_closed`                         | Solicitação encerrada pela análise                                |                              |
| `invalid_operation_amount`                 | Valor/pessoas da operação inconsistentes (fail closed)            |                              |
| `payment_method_conflict`                  | Já há cobrança pendente de outra forma de pagamento               |                              |
| `payment_in_progress`                      | Outra chamada está criando a cobrança: repetir em instantes       | `retryAfterSeconds`          |
| `payment_attempts_exceeded`                | Mais de 3 tentativas de cobrança na operação                      |                              |
| `invalid_payment_method`                   | Token no Pix, ou cartão sem token/token grande demais             |                              |
| `invalid_payment_token`                    | O provedor recusou o token de cartão                              |                              |

A API pública chega até a criação da **cobrança** (`startPayment`). Confirmação, notificações
(e-mail/WhatsApp) e comprovante em PDF não têm função pública.

## Pontos que dependem de integrações reais

- **Cadastro do sindicato:** modo de acesso, latência, formato da carteirinha, se dependentes
  têm CPF ou data de nascimento, como cada vínculo real mapeia para `relationship`, e um
  **identificador único de pessoa** (necessário para detectar duplicidade entre titulares) e
  de **data de nascimento** (se houver isenções ou faixas etárias).
- **Stripe:** habilitar Pix e cartão em BRL; definir `PaymentIntent` vs Checkout; endpoint
  público de webhook (HTTP action) e segredo de assinatura; expiração do Pix alinhada a 15 min.
- **E-mail:** provedor, domínio remetente (SPF/DKIM), modelo da mensagem.
- **WhatsApp:** API oficial (WhatsApp Business/Cloud API), templates aprovados e opt-in.
- **Comprovante em PDF:** geração e armazenamento no Convex File Storage; `receiptUrl` assinado.
