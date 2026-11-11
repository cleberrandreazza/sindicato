# Arquitetura

Aplicação pública (sem contas de associados) para pagamento da taxa médica das piscinas da sede
campestre: R$ 30,00 por pessoa, via Pix ou cartão, com 15 minutos para concluir.

> Escopo: **não** é um sistema de reservas. Não há agenda, disponibilidade, lotação nem outros
> espaços. Regras em [business-rules.md](./business-rules.md).

## Camadas

```mermaid
flowchart LR
  subgraph Browser
    UI[React + TanStack Router]
  end
  subgraph Convex
    PUB[API pública<br/>convex/public/]
    FN[Mutations internas<br/>payments/*]
    DOM[domain/<br/>funções puras]
    DB[(Tabelas)]
    REG[providers/registry]
  end
  subgraph Externos
    MP[MemberProvider]
    PP[PaymentProvider]
    NP[NotificationProvider]
  end
  UI -->|entrada mínima| PUB
  PUB --> REG
  PUB --> FN
  FN --> DOM
  FN --> DB
  REG --> MP
  REG --> PP
  REG --> NP
  PP -. webhook .-> PUB
```

| Camada                | Local                                 | Responsabilidade                                                                                                                                                    |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface             | `src/`                                | Exibir dados e coletar entradas. Não calcula valores nem decide elegibilidade.                                                                                      |
| API pública           | `convex/public/`                      | **Única** superfície alcançável pelo navegador (6 funções). Valida argumentos e identificação; não decide. Ver [API pública](#api-pública-contrato-com-o-frontend). |
| Mutations internas    | `convex/payments/`, `convex/members/` | Consistência e regras que exigem transação: criar operação, expirar, aplicar confirmação, concluir análise.                                                         |
| Domínio               | `convex/domain/`                      | Funções puras e testáveis: decisão de confirmação, seleção, política de uso, preço, estados, mensagens, CPF.                                                        |
| Contratos e providers | `convex/providers/`                   | Interfaces, mocks e `registry.ts`.                                                                                                                                  |
| Dados                 | `convex/schema.ts`                    | Ver [data-model.md](./data-model.md).                                                                                                                               |

**Funções internas por padrão.** Fora de `convex/public/`, tudo é `internal*`: não é alcançável
pelo navegador. As funções públicas são finas: validam a prova de identificação e delegam à
mesma lógica (`createOperationCore`, `resolveMemberSelection`, `findConflicts`) que as versões
internas usam, sem duplicar regras.

**Núcleo puro + execução transacional.** Decisões complexas (ex.: `decideConfirmation`,
`resolveSelection`) são funções puras sem acesso a banco, testadas isoladamente. As mutations
apenas carregam dados, chamam a decisão e a executam de forma atômica.

## Estrutura do backend

```text
convex/
  schema.ts
  domain/
    statuses.ts       enums, validators, máquinas de estado
    pricing.ts        taxa, prazo de 15 min, cálculo de totais
    time.ts           datas de calendário x instantes, fuso America/Sao_Paulo
    usagePolicy.ts    regras de uso configuráveis (data, valor unitário)
    selection.ts      seleção individual por vínculo; duplicidade por personId
    confirmation.ts   decisão sobre notificações de pagamento
    messages.ts       textos exibidos ao associado
    cpf.ts, privacy.ts
  public/             ÚNICA superfície pública (guardada por teste)
    members.ts        lookup (action), validateSelection (query)
    payments.ts       checkDuplicates (query), createOperation (mutation), getOperation (query),
                      startPayment (action: cria a cobrança Pix/cartão)
  dev/
    simulate.ts       (interna, só APP_ENV=development + mock) simula o provedor via webhook assinado
  security/
    rateLimit.ts      contadores de janela fixa e purga agendada
  members/
    sync.ts           upsert de titular, pessoas (personId) e vínculos
    lookupGate.ts     (interna) limites da consulta, falhas e conclusão (sync + sessão)
    sessions.ts       prova de identificação (emitir, exigir, purgar)
    family.ts         resolveMemberSelection: validação única da seleção por vínculo
  payments/
    operations.ts     createOperationCore, create (interna), expire
    charges.ts        (interna) begin / complete / fail: criação idempotente da cobrança
    chargeView.ts     o que o associado vê de uma cobrança e do estado da operação
    webhookProcessor.ts  processProviderNotification: assinatura → porta única (base do webhook)
    confirmations.ts  applyConfirmation (helper; só chamado por providerEvents)
    providerEvents.ts ingest (porta única de eventos do provedor), resolveAlert
    reviews.ts        resolve (análise administrativa)
    claims.ts         reservas por pessoa/data (duplicidade)
    events.ts         histórico de alterações
    receipts.ts       emissão idempotente e numeração
  providers/          contratos, registry e mock/
tests/                domain/ (puros) e convex/ (convex-test)
```

## Fluxos

### 1. Identificação do associado (`public/members:lookup`)

```mermaid
sequenceDiagram
  participant B as Navegador
  participant F as Action (pública)
  participant M as MemberProvider
  participant D as Banco
  B->>F: carteirinha + CPF
  F->>F: valida formato e dígitos do CPF
  F->>M: lookupMember
  M-->>F: found / member + holder + dependentes (cada um com personId)
  alt não encontrado ou CPF diverge
    F-->>B: identification_failed (mesma resposta; conta como falha da carteirinha)
  else encontrado
    F->>D: sincroniza (people, householdLinks, cpfHash, cpfMasked) e emite prova
    F-->>B: titular, situação, dependentes (individual), prova (só se ativo)
  end
```

O titular e cada dependente são devolvidos como itens separados (cada um é um vínculo, com
`personId` próprio); o titular é opcional. Identidade, vínculo e papel são coisas distintas: ver
[data-model.md](./data-model.md#identidade-vínculo-e-papel).

### 2. Criação da operação

1. O navegador envia **`memberId`, prova de identificação, data e as pessoas escolhidas**
   (`linkIds`). Nunca valores, nomes ou prazos.
2. `public/payments:createOperation` verifica a prova e o limite de criações e chama
   `createOperationCore` (a mesma lógica da mutation interna `create`).
3. Em **uma única transação**, a mutation: valida a data (não passada no calendário de São
   Paulo), carrega titular e vínculos do banco, resolve a seleção (`resolveSelection`),
   **verifica duplicidade** por `personId` e data (global, entre titulares), calcula valores (`UsagePolicy` + `calculateOperationAmounts`), grava operação,
   pessoas e reservas, registra o evento `created` e agenda a expiração.
4. Retorna `operationId` + `accessToken` (só o hash é guardado) + valores calculados.

### 3. Cobrança (`public/payments:startPayment`)

```mermaid
sequenceDiagram
    participant B as Navegador
    participant A as startPayment (action)
    participant M as charges.begin (mutation)
    participant P as PaymentProvider
    participant C as charges.complete (mutation)
    participant I as ingestProviderEvent
    B->>A: operationId + accessToken + pix | card (+ token do cartão)
    A->>M: hash da credencial + forma de pagamento
    M->>M: valida operação (existe, pendente, no prazo, pessoas, valor)
    M->>M: planCharge: reaproveita, recusa ou REGISTRA a tentativa (creating)
    alt já existe cobrança compatível
        M-->>A: existing (sem chamar o provedor)
    else nova tentativa
        M-->>A: create (valor e prazo lidos da OPERAÇÃO + chave de idempotência)
        A->>P: createPixCharge / createCardCharge
        P-->>A: cobrança (pending / succeeded / failed)
        A->>C: grava a transação local
        opt provedor já decidiu (cartão aprovado/recusado)
            C->>I: evento created:<id> com occurredAt = agora
        end
        C-->>A: StartPaymentResult
    end
    A-->>B: payment + estado da operação + reused
```

Três passos transacionais separados porque a chamada ao provedor não pode ficar dentro de uma
mutation:

1. **`begin`** (mutation): valida e **registra a tentativa** (`chargeAttempts`) antes de qualquer
   chamada externa. É o ponto de exclusão: leitura e escrita acontecem na mesma transação, então
   duas chamadas simultâneas conflitam e a segunda enxerga a tentativa da primeira.
2. **Chamada ao provedor** (action): valor, descrição e prazo vêm da operação; a chave de
   idempotência é `op_<operationId>_<forma>_<tentativa>`. A resposta é conferida (mesmo valor, id
   não vazio); divergência é tratada como falha e não é registrada como cobrança válida.
3. **`complete`** (mutation): grava a transação (`pending`) e, se o provedor já decidiu, entrega o
   resultado à **mesma porta única** dos webhooks (`ingestProviderEvent`). Assim um cartão aprovado
   é tratado exatamente como um Pix pago: no prazo → `paid`/`confirmed`; fora do prazo →
   `paid_late` + análise; valor divergente → análise.

**Idempotência e concorrência.** Uma única cobrança em aberto por operação:

| Situação                                                                  | Resultado                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cobrança pendente da mesma forma de pagamento                             | Devolve a mesma (`reused: true`), sem chamar o provedor            |
| Cobrança pendente de outra forma                                          | `payment_method_conflict`                                          |
| Outra chamada criando agora (tentativa `creating` < 60 s)                 | `payment_in_progress` (a tela repete)                              |
| Tentativa `creating` antiga (action interrompida) ou em `error`           | Retoma com a **mesma chave** (o provedor devolve a mesma cobrança) |
| Cobrança anterior recusada/cancelada/expirada                             | Nova tentativa (nova chave), até 3 por operação                    |
| Operação paga, em análise, encerrada, expirada ou com valor inconsistente | Recusa, sem tocar no provedor                                      |

Cartão **recusado** não bloqueia: a operação continua pendente e pode ser tentada de novo dentro do
prazo. Trocar de Pix para cartão exige que o Pix pendente termine (limitação consciente: evitar
dois pagamentos simultâneos; não há cancelamento de cobrança no contrato ainda).

**Verificado em backend Convex local** (HTTP, concorrência real): 20 chamadas simultâneas
(10 Pix + 10 cartão pendente) para a mesma operação resultaram em **uma única cobrança** (um Pix);
4 chamadas tiveram sucesso, todas descrevendo a mesma cobrança, e as outras 16 foram recusadas com
`payment_in_progress` ou `payment_method_conflict`. O `convex-test` **não** reproduz essa
concorrência; os testes automatizados a simulam suspendendo a primeira chamada dentro do provedor.

### 4. Confirmação

Hoje o único gatilho é a **simulação de desenvolvimento** (`dev/simulate:simulatePayment`, função
interna), que monta uma notificação assinada e a entrega a `processProviderNotification`: o mesmo
processador que a futura rota HTTP da Stripe usará. Não existe rota pública de confirmação.

```mermaid
sequenceDiagram
    participant P as Provedor
    participant H as HTTP action (futura) / dev.simulate
    participant PP as PaymentProvider
  participant I as providerEvents.ingest
  P->>H: POST webhook (corpo bruto + assinatura)
  H->>PP: processConfirmation
  PP-->>H: PaymentConfirmation (ou invalid_signature)
  H->>I: provider, eventId, transação, status, valor, occurredAt
  I->>I: registra o evento (providerEvents)
  alt mesmo evento já recebido
    I-->>H: duplicate (não reaplica)
  else cobrança desconhecida
    I-->>H: unknown_transaction (alerta administrativo; nada confirmado)
  else transação nossa
    I->>I: applyConfirmation → decideConfirmation (função pura)
    I-->>H: ignored / transaction_updated / confirmed / under_review
  end
  H->>H: agenda notificações conforme o resultado
```

O registro do evento e o processamento ocorrem na **mesma transação**. Detalhes, tabela de
cenários e tratamento de eventos desconhecidos em
[business-rules.md](./business-rules.md#tratamento-de-pagamentos-e-confirmações).

### 5. Notificações (parcialmente futuro)

Uma action por canal e por tipo, independentes entre si:

- `confirmed` → comprovante por e-mail e WhatsApp (`kind: receipt`).
- `under_review` → atualização por e-mail e WhatsApp (`kind: payment_under_review`) com a
  mensagem de `domain/messages.ts` (`LATE_PAYMENT_MESSAGE` quando o motivo é atraso).
- Conclusão da análise: também deverá notificar o associado (texto a definir com o sindicato).

Cada tentativa gera uma linha em `notifications`. O destino real é lido do titular no momento
do envio. Contratos já existem (`sendReceipt*`, `sendPaymentUpdate*`); as actions de envio serão
implementadas junto com as integrações.

## API pública (contrato com o frontend)

Tudo o que o navegador pode chamar está em `convex/public/`; **nada fora dessa pasta é
alcançável**. Um teste (`tests/domain/publicSurface.test.ts`) varre o código e falha se uma
`query`/`mutation`/`action` aparecer em outro lugar ou se a lista de funções públicas mudar,
forçando revisão de segurança. No frontend: `api.public.members.*` e `api.public.payments.*`.
Valores monetários em **centavos**; instantes em ms UTC; `usageDate` é `YYYY-MM-DD`.

### Modelo de acesso (sem login)

Não há conta nem login. A consulta cadastral (carteirinha + CPF) devolve uma **prova de
identificação** (`session.token`, 30 min; só o hash é guardado em `identificationSessions`). As
demais funções recebem `memberId` **e** a prova, e verificam que ela foi emitida para aquele
titular: um `memberId` sozinho não dá acesso a nada. Cada operação criada tem ainda uma
**credencial própria** (`accessToken`) para acompanhamento; as duas credenciais não se
substituem. As pessoas são identificadas por **`linkId`** (vínculo com o titular), nunca pelo
`personId` global.

> Revisão da decisão 11 (antes: "reautenticar com carteirinha + CPF a cada operação"): reenviar o
> CPF em toda chamada ampliaria sua exposição. A prova de curta duração mantém o espírito (sem
> sessão persistente nem conta) com menos exposição do CPF.

### `public/members:lookup` (action): consulta cadastral

|                |                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Argumentos** | `{ membershipNumber: string, cpf: string }`                                                                                                              |
| **Retorno**    | `{ member: { id, membershipNumber, status, cpfMasked }, holder: Person, dependents: Person[], session: { token, expiresAt } \| null, message?: string }` |
| `Person`       | `{ linkId, name, role, status, selectable }`; `selectable` = titular ativo **e** vínculo ativo                                                           |
| **Erros**      | `invalid_membership_number`, `invalid_cpf`, `identification_failed`, `too_many_attempts`, `service_unavailable`                                          |

- Valida o formato antes de consultar (carteirinha: 1 a 20 letras/números, premissa a confirmar;
  CPF: 11 dígitos com dígitos verificadores). Formato inválido **não** conta como tentativa.
- Consulta o `MemberProvider` configurado e sincroniza titular, pessoas e vínculos.
- Carteirinha inexistente e CPF divergente dão **a mesma resposta** (`identification_failed`).
- Titular **inativo**: como carteirinha e CPF conferiram, informa `status: 'inactive'` e uma
  `message`, **sem** `session`; ninguém é selecionável. (Revisa a linha antiga do fluxo, que
  tratava inativo como erro genérico: o requisito agora é informar a situação cadastral.)
- **Não retorna**: CPF completo, telefone, e-mail, `personId`, ids de vínculo da origem, hash.

### `public/members:validateSelection` (query): validação das pessoas

|                      |                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Argumentos**       | `{ memberId, identificationToken, linkIds: Id<'householdLinks'>[] }`                         |
| **Retorno**          | `{ ok: true, quantity, people: { linkId, name, role }[] }` ou `{ ok: false, code, message }` |
| **Erros (lançados)** | `session_invalid`                                                                            |

Valida no servidor: seleção não vazia (`empty_selection`); todos os `linkIds` pertencem **a este
titular** (vínculo de outra família, mesmo da mesma pessoa, é `link_not_found`); vínculos ativos
(`link_inactive`); sem repetição (`duplicate_person`); titular ativo (`member_inactive`).
Convidados não existem: só há vínculos cadastrados, e texto livre é recusado pelo validador de id.
Seleção inválida é resultado normal (`ok: false`); prova inválida é erro. Não considera data nem
duplicidade.

### `public/payments:checkDuplicates` (query): consulta de duplicidade

|                      |                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Argumentos**       | `{ memberId, identificationToken, linkIds, usageDate }`                                                  |
| **Retorno**          | `{ ok: true, usageDate, hasConflicts, conflicts: { linkId, name }[] }` ou `{ ok: false, code, message }` |
| **Erros (lançados)** | `session_invalid`                                                                                        |

Valida data (`invalid_usage_date`, `past_usage_date`) e seleção, e informa quais pessoas já têm
operação **pendente, paga ou tardia em análise** na data. Expirada sem recebimento não bloqueia.
A chave é o `personId`, então vale **entre titulares**, mas a resposta só fala de pessoas da
seleção do próprio titular: não revela o outro titular nem a operação. **É apenas informativa**
(ver Consistência).

### `public/payments:createOperation` (mutation): criação da operação

|                |                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Argumentos** | `{ memberId, identificationToken, linkIds, usageDate }`. **Nada mais.**                                                                                                                                                   |
| **Retorno**    | `{ operationId, accessToken, usageDate, quantity, unitAmountCents, totalAmountCents, expiresAt, people: { name, role }[] }`                                                                                               |
| **Erros**      | `session_invalid`, `past_usage_date`, `invalid_usage_date`, `empty_selection`, `duplicate_person`, `link_not_found`, `link_inactive`, `member_inactive`, `duplicate_usage` (com `linkIds` e `names`), `too_many_requests` |

Revalida tudo numa única transação: prova, data, seleção e duplicidade; calcula `quantity`, total
(R$ 30,00 por pessoa) e `expiresAt = agora + 15 min`; grava operação, pessoas, reservas e o evento
`created`; agenda a expiração. Qualquer campo extra (`totalAmountCents`, `financialStatus`,
`expiresAt`...) é recusado pelo validador do Convex. O `accessToken` é devolvido **uma única vez**.

### `public/payments:getOperation` (query): consulta da operação

|                |                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Argumentos** | `{ operationId, accessToken }`                                                                                                                                                                                     |
| **Retorno**    | `{ operationId, usageDate, quantity, unitAmountCents, totalAmountCents, expiresAt, operationalStatus, financialStatus, presentation: { code, message }, people: { name, role }[], receiptNumber: string \| null }` |
| **Erros**      | `operation_not_found`                                                                                                                                                                                              |

Inexistente e credencial incorreta dão **a mesma resposta**: não há como consultar operação de
terceiros nem descobrir se um id existe. O `operationalStatus` exibido vira `expired` quando o
prazo passou (mesmo antes da execução agendada que libera as reservas). Mantém os dois eixos: um
pagamento tardio aparece como `financialStatus: 'paid_late'` + `operationalStatus: 'under_review'`
com a mensagem oficial. **Não retorna**: `memberId`, `personId`, ids de vínculo, hash, transações
do provedor, motivo interno da análise.

### `public/payments:startPayment` (action): iniciar o pagamento

|                |                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Argumentos** | `{ operationId, accessToken, paymentMethod: 'pix' \| 'card', paymentMethodToken?: string }`. **Nada mais.** O token existe só para cartão (proibido no Pix).                                                                                                                                            |
| **Retorno**    | `{ payment: PaymentView, operation: { operationalStatus, financialStatus, presentation }, reused: boolean }`                                                                                                                                                                                            |
| `PaymentView`  | `{ paymentId, method, status, amountCents, message, pix: { copyPasteCode, qrCode: { kind, value }, expiresAt } \| null }`                                                                                                                                                                               |
| **Erros**      | `operation_not_found`, `operation_expired`, `operation_already_paid`, `operation_under_review`, `operation_closed`, `invalid_operation_amount`, `payment_method_conflict`, `payment_in_progress`, `payment_attempts_exceeded`, `invalid_payment_method`, `invalid_payment_token`, `service_unavailable` |

- A credencial é a mesma de `getOperation` (`operationId` + `accessToken`); inexistente e incorreta
  dão a mesma resposta (`operation_not_found`).
- **O valor nunca vem do navegador.** `amountCents` do resultado é o total armazenado da operação;
  qualquer campo extra (`amountCents`, `status`, `expiresAt`, `cardNumber`...) é recusado pelo
  validador do Convex (no `convex-test` a mensagem é _Unexpected field_; no backend real, _Object
  contains extra field_).
- `status` é o estado **da cobrança** (`pending | succeeded | failed | canceled | expired`).
  `succeeded` quer dizer "o provedor aprovou"; quem diz se a utilização foi liberada é
  `operation` (um cartão aprovado fora do prazo volta `succeeded` com a operação em
  `paid_late`/`under_review`). `failed`/`canceled`/`expired` significam **nenhum recebimento**.
- `pix` só vem enquanto a cobrança Pix está pendente. `qrCode.kind` é `placeholder` (mock: desenho
  `DEMONSTRAÇÃO`, em data URI SVG, **não escaneável**) ou `image_url` (provedor real).
- `message` é o texto de resultado pronto para exibir (mesma fonte de `domain/messages.ts`).
- Cartão: o navegador envia **apenas o token** gerado pelo SDK do provedor (no mock:
  `tok_mock_approved`, `tok_mock_declined`, `tok_mock_pending`, `tok_mock_unavailable`). Dados do
  cartão nunca chegam ao backend; o token não é gravado nem registrado em log.
- `reused: true` indica que a cobrança já existia e foi apenas devolvida.
- Não devolve: id do provedor, chave de idempotência, hashes, `memberId`.

`getOperation` também devolve `payment: PaymentView | null` (a cobrança mais recente), para
reexibir o Pix depois de recarregar a página.

### O que NÃO existe no público

Confirmar pagamento, alterar estados, concluir análise, aplicar eventos do provedor, simular
pagamentos, listar alertas e rotas HTTP/webhook (o teste de superfície proíbe `http.ts`). A
confirmação só acontece por notificações autenticadas do provedor, fora de `convex/public/`.

### Estratégia de segurança da API

| Risco                                          | Medida                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usar `memberId` alheio                         | Prova obrigatória e verificada contra o titular; falha idêntica para qualquer causa (`session_invalid`).                                                     |
| Selecionar pessoas de outra família/convidados | Só `linkId`, lido do banco **entre os vínculos deste titular**; texto livre e ids de outras tabelas são rejeitados.                                          |
| Manipular valores ou estados                   | Validadores estritos recusam campos extras; valores calculados no servidor; nenhuma função pública escreve estado de pagamento.                              |
| Enumerar carteirinhas/CPFs                     | Mesma resposta para "não existe" e "CPF diverge"; formato validado localmente; limites por carteirinha e globais.                                            |
| Descobrir operação alheia                      | Credencial própria por operação; mesma resposta para inexistente e incorreta.                                                                                |
| Vazar dados                                    | Respostas montadas campo a campo (sem `...doc`); CPF só mascarado; sem contato, `personId` nem hashes. Testes serializam e procuram esses valores.           |
| Abuso                                          | `rateLimits`: 5 falhas/15 min por carteirinha; 120 consultas/min global; 10 operações/15 min por titular. Linhas expiradas são purgadas por função agendada. |
| Detalhes de erro                               | Falha de configuração/provedor vira `service_unavailable`; detalhe só no log, sem CPF nem carteirinha.                                                       |
| Confirmar pagamento pelo navegador             | Não existe função pública para isso; só a porta única de eventos (`internal`), que exige notificação autenticada pelo provider.                              |
| Simulação em produção                          | `dev/simulate` é `internal` **e** recusa rodar sem `APP_ENV=development` ou com provider ≠ mock (`simulation_disabled`).                                     |
| Dados de cartão                                | Só o token do SDK trafega; não é gravado, devolvido nem logado.                                                                                              |
| Cobrança duplicada                             | Tentativa registrada antes da chamada externa + chave de idempotência estável + uma cobrança em aberto por operação.                                         |

**Limitações da proteção na v1.** Funções públicas do Convex **não recebem o IP do cliente**,
então não há limite por origem. Consequências: (1) um atacante pode **bloquear temporariamente
uma carteirinha** (5 erros = 15 min); (2) pode consumir o limite global e degradar a consulta
para todos por 1 minuto. Mitigação definitiva: CAPTCHA/Turnstile na tela e/ou proxy que repasse a
origem. Também não há mitigação de **temporização** entre "não existe" e "CPF diverge" (com um
provedor real, os tempos podem diferir).

### Consistência na criação (duplicidade simultânea)

Uma consulta (`checkDuplicates`) seguida de inserção em chamadas separadas **não** garante
exclusividade: duas solicitações podem consultar ao mesmo tempo, ver a data livre e inserir. A
garantia vem de fazer **verificação e inserção na mesma mutation** (`createOperation`): o Convex
executa mutations como transações serializáveis com controle otimista de concorrência; a leitura
do índice `by_person_date_claim [personId, usageDate, claim]` entra no conjunto de leitura, e se
outra transação inserir uma reserva nesse intervalo antes desta confirmar, esta é reexecutada,
enxerga a reserva e recusa com `duplicate_usage`. Não foi necessária estratégia adicional (lock,
fila). `checkDuplicates` serve só para avisar cedo; **a decisão é sempre a da criação**.

**Verificado** contra um backend Convex local, pela API pública via HTTP: 20 chamadas
simultâneas de `createOperation`, vindas de **dois titulares diferentes** para a **mesma pessoa**
e data, resultaram em **1 operação criada e 19 recusas `duplicate_usage`**. A suíte automatizada
(`convex-test`) não simula o controle otimista; ela cobre a lógica (incluindo 5 criações
concorrentes → 1 vencedora), não a serialização real.

## Decisões arquiteturais

1. **Backend é a única autoridade financeira.** Valor, quantidade, prazo e elegibilidade são
   calculados e validados no Convex.
2. **Providers por interface + registry.** Regras de negócio dependem só das interfaces.
3. **Seguro por padrão.** Mocks só funcionam com `APP_ENV=development`.
4. **Duplicidade garantida dentro da transação** (verificação e inserção na mesma mutation,
   índice de reservas ativas), apoiada na serialização do Convex. Ver
   [business-rules.md](./business-rules.md#prevenção-de-duplicidade).
5. **Dois eixos de estado** (financeiro e operacional).
6. **Dinheiro recebido nunca é descartado.** Qualquer recebimento fora do caminho feliz vai para
   análise administrativa; sem liberação automática e sem reembolso automático.
7. **"No prazo" pelo instante do recebimento** (`occurredAt`), não pela chegada da notificação.
8. **Regras pendentes isoladas em `UsagePolicy`.** Dias, horários, antecedência, isenções e
   faixas etárias entram trocando a implementação, sem tocar nas mutations.
9. **Núcleo de decisão puro** (`decideConfirmation`, `resolveSelection`, `time.ts`): testável sem banco.
10. **Funções `internal` por padrão**; a superfície pública é só `convex/public/`, guardada por teste.
11. **Sem conta de associado, mas com prova de identificação de curta duração** (30 min,
    emitida pela consulta carteirinha + CPF, vinculada ao titular). Substitui a ideia de reenviar o
    CPF a cada chamada.
12. **Credencial por operação (`accessToken`)** para acompanhar status sem expor terceiros.
13. **CPF nunca em claro** (HMAC + máscara); erros de identificação genéricos.
14. **Dinheiro em centavos inteiros.**
15. **Node 22 padronizado** (`.nvmrc`, `engines`): o CLI do Convex, o Vitest 5 e o ESLint 10
    exigem 22+. Nomes de arquivo em `convex/` em camelCase.
16. **Identidade ≠ vínculo ≠ papel.** `personId` identifica a pessoa; o vínculo liga a um titular;
    o papel descreve a relação. A duplicidade usa `personId`.
17. **Instantes em UTC, datas em calendário.** Uma única ponte explícita (`businessCalendarDate`)
    para o fuso de São Paulo. Ver [data-model.md](./data-model.md#datas-e-fuso-horário).
18. **Todo evento do provedor é registrado antes de ser decidido.** Cobrança desconhecida gera
    alerta e nunca confirma nem libera nada.
19. **Três estados distintos**: da cobrança (provedor), financeiro e operacional. Só um
    recebimento (`succeeded`) validado por `decideConfirmation` move o estado financeiro; recusa,
    cancelamento e expiração de cobrança nunca o tocam. Ver
    [business-rules.md](./business-rules.md#estados-e-transições).
20. **Resultado imediato do provedor também é um evento.** Cartão aprovado/recusado na criação
    entra por `ingestProviderEvent` (a mesma porta do webhook), então prazo, valor e análise valem
    igualmente; não há atalho para "liberar".
21. **Tentativa registrada antes da chamada externa** (`chargeAttempts`) + chave de idempotência
    estável: concorrência e repetição não criam cobranças independentes.

## Ambiente

Node **22** (`.nvmrc` = `22`; `engines`: `^22.13.0 || ^24.0.0 || >=26.0.0`, a interseção das
exigências de Convex, Vite, Vitest e ESLint). Com Node 20 o `pnpm` avisa e o Vitest 5 falha ao
reportar erros (`Map.groupBy`). Gerenciador: pnpm. Nenhuma dependência foi adicionada para
padronizar o ambiente; foi removida uma dependência acidental (`cn`).

## Testes

Vitest (`pnpm test`). `tests/domain/` roda em Node e cobre as funções puras;
`tests/convex/` usa `convex-test` (ambiente `edge-runtime`) para exercitar as mutations reais
com um banco em memória, usando apenas dados fictícios. `convex-test` valida a lógica, mas
**não simula o controle otimista de concorrência** do Convex; essa garantia foi verificada
manualmente contra um backend local (ver business-rules.md).

## Segurança

- Identificação exige carteirinha **e** CPF; sem listagem nem busca parcial.
- Respostas não distinguem carteirinha inexistente de CPF incorreto. Detalhes em
  [Estratégia de segurança da API](#estratégia-de-segurança-da-api).
- CPF completo não é persistido nem devolvido; apenas `cpfMasked`.
- Nenhum dado clínico.
- Dados financeiros só são acessíveis com `operationId` + `accessToken`.
- O navegador não envia valores; argumentos desconhecidos são rejeitados pelos validators.
- Logs não devem conter CPF, e-mail ou telefone.
- **Administração (futuro):** `paymentReviews.resolve` já existe como função interna. O painel a
  exporá por um wrapper único (`adminQuery`/`adminMutation`) que exige identidade autenticada e
  papel; `resolvedBy` receberá a identidade. Falta escolher o provedor de autenticação.
- **Abuso na identificação:** limites técnicos por carteirinha, globais e por titular
  implementados (`convex/domain/limits.ts`); **CAPTCHA ainda não definido** (sem IP no Convex).

## Dependências de integrações futuras

| Ponto                       | Depende de                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MemberProvider` real       | Acesso ao cadastro do sindicato; **identificador estável e único de pessoa** (`personId`)                    |
| `PaymentProvider` real      | Conta e chaves do provedor (Stripe), webhook público                                                         |
| Registro da transação       | Garantir que toda cobrança criada no provedor tenha linha local (webhook de cobrança desconhecida só alerta) |
| `NotificationProvider` real | Provedor de e-mail e WhatsApp Business (templates aprovados)                                                 |
| Comprovante em PDF          | Layout e dados oficiais do sindicato                                                                         |
| Painel administrativo       | Autenticação; consome `paymentReviews.by_status` e `providerEvents.by_alert_status`                          |
| Regras de uso               | Dias, horários, antecedência, isenções, faixas etárias                                                       |
| Proteção contra abuso       | CAPTCHA/Turnstile e/ou proxy com a origem (limites por IP); os limites atuais são só por carteirinha/global  |

Detalhes dos contratos em [integrations.md](./integrations.md).
