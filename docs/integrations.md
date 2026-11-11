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
- O retorno é gravado por `members/sync:upsertFromProvider` (pessoas, vínculos, papéis).
- O provider **não** decide elegibilidade; o backend rejeita `status !== 'active'`.

## PaymentProvider

| Método                     | Função                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `createPixCharge(input)`   | Cria cobrança Pix; devolve `pixCopyPasteCode` e `expiresAt`.                                |
| `createCardCharge(input)`  | Cobra cartão a partir de `paymentMethodToken`; devolve status e, se houver, `clientSecret`. |
| `getPaymentStatus(id)`     | Consulta a situação (reconciliação, polling de segurança).                                  |
| `processConfirmation(req)` | Autentica a assinatura e normaliza o webhook em `PaymentConfirmation`.                      |

Regras do contrato:

- `amountCents` é sempre calculado pelo backend a partir da operação.
- `idempotencyKey` obrigatório: repetir a chamada não duplica a cobrança.
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
  conforme `result` (só notificar quando `result !== null`).

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
  retornam `found: false`.
- **PaymentProvider mock:** sem estado; o resultado fica codificado no id da transação
  (`mock_<método>_<resultado>_<idempotencyKey>`).
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
