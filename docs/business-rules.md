# Regras de negócio

Registro das regras confirmadas pelo sindicato, das pendentes e de como o sistema as aplica.
Escopo: pagamento da taxa médica das piscinas. **Não** é um sistema de reservas (sem agenda,
disponibilidade, lotação ou outros espaços).

## Regras confirmadas

**Identificação e seleção**

- Acesso público; identificação por número da carteirinha e CPF.
- Titular e dependentes são apresentados individualmente e selecionados um a um.
- O titular **não** é obrigatório. Convidados não são permitidos.

**Cobrança**

- R$ 30,00 por pessoa, multiplicado pela quantidade de pessoas selecionadas.
- A data de utilização é obrigatória e **datas passadas são bloqueadas** (a data de hoje é aceita).
- Pagamento em até 15 minutos; modalidades Pix e cartão; pagamentos inicialmente simulados.
- O comprovante é gerado após a confirmação e enviado por e-mail e WhatsApp.

**Duplicidade**

- A mesma pessoa não pode ter dois pagamentos aprovados para a mesma data.
- Operações pendentes também bloqueiam cobranças simultâneas duplicadas.
- Operação expirada sem recebimento não bloqueia nova tentativa.
- Pagamento recebido, ainda que tardio, bloqueia novas cobranças enquanto estiver em análise.

**Pagamento tardio**

- Pagamento efetivamente recebido após os 15 minutos é registrado e encaminhado para análise
  administrativa. Não é descartado, não libera a utilização automaticamente e não gera
  reembolso automático.

## Regras pendentes

O sindicato ainda não forneceu as regras abaixo. **Nenhuma foi inventada**: o comportamento atual
é o mais neutro possível e a arquitetura permite configurá-las depois.

| Regra pendente                       | Comportamento atual                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Dias de funcionamento das piscinas   | Qualquer data não passada é aceita                                           |
| Horários de funcionamento            | Não considerados                                                             |
| Antecedência mínima ou máxima        | Sem limites (exceto "não pode ser passada")                                  |
| Isenção para crianças                | Não existe; todos pagam R$ 30,00                                             |
| Isenção para idosos                  | Não existe; todos pagam R$ 30,00                                             |
| Faixas etárias com preços diferentes | Não existem; preço único                                                     |
| Identificador oficial de pessoa      | `personId` já modelado; o provedor real precisa fornecê-lo (ver Duplicidade) |
| Horário de corte para "hoje"         | Não existe; hoje é aceito até 23:59:59 (São Paulo)                           |
| Fuso horário do sindicato            | `America/Sao_Paulo` assumido                                                 |

### Testes que dependem de regras ainda não definidas

Cada teste abaixo documenta uma **premissa**, não uma regra confirmada. Se o sindicato decidir
diferente, o teste deve ser revisto junto com `usagePolicy`/cadastro, e não "consertado" às cegas:

| Teste                                                                 | Premissa                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `usagePolicy.test.ts` › não restringe dias da semana nem antecedência | Sem calendário de funcionamento nem janela de antecedência        |
| `usagePolicy.test.ts` › aplica R$ 30,00 para qualquer data            | Sem isenções nem faixas etárias                                   |
| `time.test.ts` › às 23:59:59 locais, hoje ainda é permitido           | Sem horário de corte; fuso `America/Sao_Paulo`                    |
| `duplicates.test.ts` › duplicidade global por personId                | O cadastro oficial fornecerá um `personId` estável e único        |
| `people.test.ts` › uma pessoa (Clara) é dependente de dois titulares  | Idem; é cenário fictício do mock, não um fato do cadastro real    |
| `providerEvents.test.ts` › qualquer status … gera alerta              | Decisão técnica provisória: alertar até para falhas desconhecidas |

**Onde configurar no futuro:** [`convex/domain/usagePolicy.ts`](../convex/domain/usagePolicy.ts)
define a interface `UsagePolicy` (`checkUsageDate`, `unitAmountCents`) e a implementação
`defaultUsagePolicy`. As mutations dependem da interface; para aplicar novas regras basta fornecer
outra implementação (por exemplo, lida de uma tabela de configuração), sem mexer em duplicidade,
pagamentos ou estados. Isenções e faixas por idade exigirão `birthDate` nos dependentes e
valor por pessoa (ver [data-model.md](./data-model.md#decisões-e-justificativas), item 6).

**Premissa adotada, a confirmar:** "hoje" é calculado no fuso `America/Sao_Paulo`
(`BUSINESS_TIME_ZONE`). Isso afeta o bloqueio de datas passadas e o ano do comprovante.

### Datas e fuso horário

Estratégia completa em [data-model.md](./data-model.md#datas-e-fuso-horário) e implementada em
[`convex/domain/time.ts`](../convex/domain/time.ts). Em resumo:

- **Data de utilização** = data de calendário `YYYY-MM-DD`, sem hora nem fuso, nunca convertida.
- **Prazos e recebimentos** = instantes UTC (ms). Os 15 minutos não dependem de fuso.
- **"Hoje"** = o dia do instante atual no calendário de São Paulo. Uma data é passada se for
  anterior a hoje; **hoje é permitido** (sem horário de corte: horário de funcionamento é regra
  pendente).
- Às 23:59:59 de São Paulo, "hoje" ainda vale; às 00:00:00 do dia seguinte, o dia anterior passa a
  ser passado. A meia-noite UTC **não** vira o dia em São Paulo (21:00 locais).
- A validação de data passada ocorre só na criação da operação. Uma operação criada para hoje às
  23:50 continua válida após a meia-noite: o direito já foi pago/reservado para aquele dia.

## Estados da operação

Detalhes e diagrama em [data-model.md](./data-model.md#estado-financeiro--estado-operacional).
Em resumo, são **dois eixos**:

- **Financeiro**: o dinheiro foi recebido? `unpaid`, `paid`, `paid_late`.
- **Operacional**: a utilização pode ser exercida? `awaiting_payment`, `confirmed`, `expired`,
  `under_review`, `rejected`.

## Tratamento de pagamentos e confirmações

Uma notificação do provedor, já autenticada e normalizada, é avaliada pela função pura
[`decideConfirmation`](../convex/domain/confirmation.ts) e aplicada atomicamente por
`payments/confirmations.applyConfirmation`. Toda notificação entra por uma **porta única**,
`payments/providerEvents.ingest`, que registra o evento recebido e só então delega a decisão
(ver [Eventos recebidos do provedor](#eventos-recebidos-do-provedor)).

**"No prazo" é decidido pelo instante do recebimento informado pelo provedor (`occurredAt`)**,
não pela hora em que a notificação chegou. O prazo termina em `expiresAt` (recebimento exatamente
nesse instante já é tardio).

| Cenário                                                        | Transação   | Financeiro  | Operacional    | Outros efeitos                                                     |
| -------------------------------------------------------------- | ----------- | ----------- | -------------- | ------------------------------------------------------------------ |
| Pago no prazo, valor correto                                   | `succeeded` | `paid`      | `confirmed`    | Comprovante emitido                                                |
| Pago no prazo, mas a notificação chegou após a expiração       | `succeeded` | `paid`      | `confirmed`    | Reservas retomadas; comprovante emitido                            |
| …e outra operação já reservou a pessoa nesse intervalo         | `succeeded` | `paid`      | `under_review` | Análise `claim_conflict`                                           |
| Pago depois do prazo (operação expirada ou ainda não expirada) | `succeeded` | `paid_late` | `under_review` | Análise `late_payment`; reservas ativas; **sem** comprovante       |
| Valor recebido diferente do valor da operação                  | `succeeded` | `unpaid`    | `under_review` | Análise `amount_mismatch`                                          |
| Novo recebimento em operação já paga, em análise ou rejeitada  | `succeeded` | inalterado  | inalterado     | Análise `unexpected_payment` (possível duplicidade)                |
| Notificação repetida de recebimento                            | inalterada  | inalterado  | inalterado     | Ignorada                                                           |
| Falha/cancelamento/expiração no provedor                       | atualizada  | inalterado  | inalterado     | Operação segue aberta até o prazo                                  |
| Falha chegando depois de um sucesso (fora de ordem)            | `succeeded` | inalterado  | inalterado     | Ignorada (`succeeded` é terminal)                                  |
| Cobrança desconhecida                                          | —           | —           | —              | `unknown_transaction`; evento registrado + alerta; nada confirmado |

### Fluxo do pagamento tardio

1. A operação expira aos 15 minutos sem recebimento: `unpaid` / `expired`, reservas liberadas.
2. O provedor notifica um recebimento com `occurredAt` posterior ao prazo.
3. A transação passa a `succeeded` (o dinheiro **não** é descartado).
4. A operação vai para `paid_late` / `under_review`; as reservas das pessoas são **retomadas**
   para impedir nova cobrança enquanto a análise durar.
5. Abre-se um `paymentReviews` (`late_payment`, `open`) e registra-se o evento no histórico.
6. O associado vê a mensagem de confirmação tardia (abaixo). A utilização **não** é liberada.
7. Um administrador decide (`payments/reviews.resolve`):
   - **Aprovar:** operação `confirmed`, comprovante emitido. Se uma das pessoas já foi reservada
     por outra operação, a aprovação é recusada (`claim_conflict`) para não violar a unicidade.
   - **Rejeitar:** operação `rejected`, reservas liberadas. **Nenhum reembolso é iniciado pelo
     sistema**; a devolução é tratada manualmente, fora dele.

### Notificações repetidas e confirmação duplicada

Duas camadas independentes:

- **Registro do evento (`providerEvents`)**: a identidade de um evento é origem + `eventId`. Um
  evento repetido só incrementa `occurrences`; não é reaplicado e não gera segundo comprovante,
  segunda análise nem segundo histórico.
- **Estado terminal da transação**: eventos _diferentes_ da mesma cobrança (ex.: dois
  `succeeded` com ids distintos) encontram a transação já `succeeded` e são ignorados.

Ambas são lidas e alteradas na mesma mutation; chegadas simultâneas conflitam e a reexecutada
enxerga o resultado da primeira.

### Eventos recebidos do provedor

Todo evento financeiro (webhook) passa por `providerEvents.ingest`, que **registra a chegada**
(origem, id do evento, `providerTransactionId`, status, valor, `occurredAt`, resultado) na mesma
transação em que o processa. Garantias:

- **Repetição:** mesmo (origem, `eventId`) → `duplicate: true`, `occurrences + 1`, sem
  reprocessar (resultado `result: null`; o chamador **não** reenvia comprovantes).
- **Transação desconhecida:** se não existe `paymentTransactions` com a mesma origem e
  `providerTransactionId`, o evento é registrado como `unknown_transaction` e um **alerta
  administrativo** é aberto (`alertStatus = open`). Vale para qualquer status (também falhas).
- **Nunca confirma sem transação validada:** só uma transação criada pelo nosso backend permite
  confirmar. Valor igual ao de uma operação aberta **não** basta; a origem também precisa bater.
- **Nunca libera nada sozinho:** um evento desconhecido não altera operações, reservas,
  transações, comprovantes nem notificações, e não inicia reembolso.
- **Corrida webhook × gravação da transação:** se um evento desconhecido se repete depois de a
  transação passar a existir, ele é processado normalmente e o alerta é encerrado pelo
  `system`. Sem isso, um webhook rápido demais ficaria preso como "desconhecido".
- **Tratamento humano:** `providerEvents.resolveAlert` encerra o alerta registrando quem decidiu
  e uma nota; **não** muda nenhuma operação. O que fazer com o dinheiro é processo manual.
  `listOpenAlerts` alimenta o painel administrativo (ainda inexistente; funções internas).

## Prevenção de duplicidade

**Regra:** a mesma **pessoa** (titular ou dependente, identificada por `personId`) não pode estar
em duas operações "vivas" para a mesma data, **mesmo que cobrada por titulares diferentes**. Uma
operação está viva se estiver pendente, paga ou com recebimento em análise.

**Modelo:** cada pessoa selecionada vira uma linha em `operationPeople` com `claim = active`
enquanto a operação a bloqueia, e `released` quando deixa de bloquear. O índice
`by_person_date_claim [personId, usageDate, claim]` permite perguntar: "existe reserva ativa
para esta pessoa nesta data?" A chave é o `personId` (identidade), nunca o id do vínculo: uma
filha de dois titulares tem dois vínculos e um só `personId`. Dentro de uma mesma seleção, a
repetição também é detectada por `personId`.

| Situação da operação                         | Bloqueia nova cobrança?                   |
| -------------------------------------------- | ----------------------------------------- |
| Pendente (`awaiting_payment`)                | Sim                                       |
| Paga (`confirmed`)                           | Sim                                       |
| Pagamento tardio em análise (`under_review`) | Sim                                       |
| Expirada sem recebimento (`expired`)         | **Não** (reservas liberadas na expiração) |
| Análise rejeitada (`rejected`)               | Não (reservas liberadas)                  |

**Consistência no backend Convex:**

1. Toda a verificação e a inserção ocorrem **dentro da mesma mutation** (`payments/operations.create`).
   O navegador nunca decide nada: só envia quem e quando.
2. Mutations do Convex são **transações serializáveis com controle otimista de concorrência**.
   A consulta de reserva ativa registra no conjunto de leitura o intervalo do índice
   (`personId`, `usageDate`, `'active'`). Se outra transação inserir uma reserva nesse intervalo
   antes de esta confirmar, o Convex detecta o conflito e **reexecuta** a mutation, que então
   enxerga a reserva existente e recusa com `duplicate_usage`.
3. Duas solicitações simultâneas, portanto, não conseguem ambas passar: no máximo uma confirma.
4. A mesma lógica protege as demais mudanças de reserva (liberar, retomar na confirmação
   tardia, aprovar análise).
5. Uma consulta feita em outra chamada (por exemplo, a tela) é apenas informativa e **nunca**
   substitui a validação da mutation.

**Como foi verificado:**

- Testes automatizados (`tests/convex/duplicates.test.ts`) cobrem os cenários lógicos, inclusive
  disparos simultâneos. Atenção: o `convex-test` não reproduz o controle otimista real; ele
  valida a lógica, não a concorrência.
- A concorrência real foi verificada contra um backend Convex local: **50 chamadas HTTP
  simultâneas** para a mesma pessoa e data resultaram em **1 operação criada e 49 recusas**
  (`duplicate_usage`), com 1 reserva ativa. Esse teste foi manual e não faz parte da suíte.

- A concorrência entre **titulares diferentes** disputando a mesma pessoa (mesmo `personId`,
  vínculos distintos) também foi verificada no backend local: dos disparos simultâneos que
  chegaram à função, **1 criou a operação e todos os demais receberam `duplicate_usage`**. Também
  manual, fora da suíte. (Parte dos disparos falhou no cliente CLI antes de chegar à função.)

**Limitação conhecida (pendente do sindicato):** a prevenção **global** é tão confiável quanto o
`personId` fornecido pelo cadastro oficial. O modelo já separa identidade, vínculo e papel
(ver [data-model.md](./data-model.md#identidade-vínculo-e-papel)), mas o `MemberProvider` real
precisa entregar um identificador de pessoa **estável, único por pessoa e independente do
vínculo**. Se isso não existir, a duplicidade entre titulares diferentes não pode ser garantida
(só a do mesmo titular). Os testes que usam `personId` compartilhado dependem dessa premissa.

## Mensagens apresentadas ao associado

Definidas em [`convex/domain/messages.ts`](../convex/domain/messages.ts) e usadas pela tela,
por e-mail e por WhatsApp (mesmo texto). O backend devolve um `code` e a `message`; o motivo
interno da análise não é exposto.

**Confirmação tardia** (`under_review_late_payment`) — mensagem de referência fornecida pelo
sindicato, mais a última frase para tornar explícita a dependência de validação:

> Seu pagamento foi identificado, mas a confirmação chegou com um pequeno atraso. Não se preocupe:
> identificamos o recebimento e nossa equipe está verificando a situação. Não realize um novo
> pagamento neste momento. Você receberá uma atualização assim que a análise for concluída. A
> utilização das piscinas só será liberada após a validação da nossa equipe.

Garante: pagamento identificado, confirmação atrasada, operação em análise, **não pagar de novo**,
utilização dependente de validação administrativa. Não promete liberação nem reembolso.

**Demais mensagens** (rascunhos, a aprovar pelo sindicato):

| Código             | Quando                                  | Texto                                                                                                     |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `awaiting_payment` | Dentro do prazo                         | Aguardando a confirmação do pagamento. Conclua o pagamento dentro de 15 minutos.                          |
| `confirmed`        | Pago e liberado                         | Pagamento confirmado. O comprovante será enviado por e-mail e WhatsApp.                                   |
| `expired`          | Prazo encerrado sem recebimento         | O prazo de 15 minutos terminou. Se já pagou, não pague novamente… Se ainda deseja, faça nova solicitação. |
| `under_review`     | Análise por outro motivo (sem "atraso") | Pagamento identificado, em verificação, não pagar de novo, utilização depende de validação.               |
| `rejected`         | Análise concluída sem liberação         | A análise foi concluída e a utilização não foi liberada. Entre em contato com o sindicato.                |

## Limitações do mock

O ambiente de desenvolvimento usa providers simulados (ver [integrations.md](./integrations.md#mocks)).
Não representam o comportamento real e **nunca** devem ser habilitados em produção (o registry os
recusa sem `APP_ENV=development`).

- **Associados:** apenas 4 cadastros fictícios fixos; nenhuma sincronização, nenhum dado real.
- **Pagamentos:** sem estado e sem relógio. Nenhuma confirmação chega sozinha, nem tardia: Pix
  nasce `pending` e a confirmação, no prazo ou atrasada, é **simulada** informando `occurredAt` ao
  chamar `processConfirmation` e entregar o resultado a `providerEvents.ingest`.
  `getPaymentStatus` deriva o resultado do id.
- **Cartão:** apenas dois tokens (`tok_mock_approved`, `tok_mock_declined`); não há 3-D Secure.
- **Notificações:** nada é enviado; devolve apenas um id simulado.
- **Cobranças desconhecidas e reenvios do provedor:** só ocorrem se forem simulados nos testes.
- **Regras de funcionamento, antecedência e isenções:** inexistentes (ver pendências).
- **Comprovante:** o registro e o número existem; o arquivo PDF ainda não é gerado. O prefixo
  `SC` da numeração é provisório.
- **Identificação:** não há limitação de tentativas (rate limit) nem CAPTCHA.
