# Regras de negócio

Registro das regras confirmadas pelo sindicato, das pendentes e de como o sistema as aplica.
Escopo: pagamento da taxa médica das piscinas. **Não** é um sistema de reservas (sem agenda,
disponibilidade, lotação ou outros espaços).

## Regras confirmadas

**Identificação e seleção**

- Acesso público; identificação por número da carteirinha e CPF.
- Titular e dependentes são apresentados individualmente e selecionados um a um.
- O titular **não** é obrigatório. Convidados não são permitidos.
- Nenhuma pessoa vem pré-selecionada (nem o titular). Detalhes em
  [Seleção de pessoas](#seleção-de-pessoas).

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

| Regra pendente                              | Comportamento atual                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dias de funcionamento das piscinas          | Qualquer data não passada é aceita                                                                             |
| Horários de funcionamento                   | Não considerados                                                                                               |
| Antecedência mínima ou máxima               | Sem limites (exceto "não pode ser passada")                                                                    |
| Feriados e datas excepcionais               | Não considerados; nenhuma data futura é bloqueada                                                              |
| Períodos de fechamento das piscinas         | Não considerados; nenhuma data futura é bloqueada                                                              |
| Isenção para crianças                       | Não existe; todos pagam R$ 30,00                                                                               |
| Isenção para idosos                         | Não existe; todos pagam R$ 30,00                                                                               |
| Faixas etárias com preços diferentes        | Não existem; preço único                                                                                       |
| Identificador oficial de pessoa             | `personId` já modelado; o provedor real precisa fornecê-lo (ver Duplicidade)                                   |
| Horário de corte para "hoje"                | Não existe; hoje é aceito até 23:59:59 (São Paulo)                                                             |
| Fuso horário do sindicato                   | `America/Sao_Paulo` assumido                                                                                   |
| Máximo de pessoas por operação              | Não existe limite; qualquer quantidade de vínculos ativos pode ser escolhida                                   |
| Critérios de elegibilidade além do cadastro | Não existem (carência, adimplência, idade etc.); vale só a situação cadastral `active` do titular e do vínculo |
| Texto oficial para pessoa inelegível        | Rascunho: "Cadastro inativo no momento. Procure o Sindicomerciários para regularizar." (a aprovar)             |
| Dependente de titular inativo               | Bloqueado junto com o titular (a situação do titular vale para toda a operação); premissa a confirmar          |

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

## Seleção de pessoas

Segunda etapa da jornada (tela "Quem utilizará as piscinas?", rota `/pessoas`). Implementação em
[`convex/domain/selection.ts`](../convex/domain/selection.ts) (regra) e em `src/features/selection/`
(interface, que apenas exibe e coleta).

**Regras confirmadas (aplicadas hoje):**

- **Seleção individual.** O titular e cada dependente aparecem como itens separados e são
  escolhidos um a um; o cartão inteiro é o controle de seleção.
- **Sem pré-seleção.** Ao entrar na etapa nada está marcado, nem o titular. A escolha é sempre
  uma ação do associado.
- **Titular opcional.** É válido selecionar só dependentes, só o titular, ou ambos.
- **Convidados proibidos.** Só existem pessoas cadastradas (vínculos). Não há campo para incluir
  quem não consta no cadastro, e texto livre é recusado pelo backend.
- **Valor inicial por pessoa: R$ 30,00.** A tela mostra quantidade, valor unitário e total
  (R$ 30,00 × quantidade) de forma **apenas informativa**. O valor é recalculado e confirmado
  pelo backend na criação da operação; o navegador nunca envia valores.
- **Continuar exige ao menos uma pessoa.** Sem seleção o botão fica desabilitado, com a
  explicação visível; o backend também recusa seleção vazia (`empty_selection`).
- **Validação obrigatória no backend.** Antes de avançar, a seleção é validada por
  `public/members:validateSelection`. A validação da tela não substitui a do servidor, que é
  refeita ao criar a operação.
- **Qualquer mudança na seleção invalida a validação anterior.** Marcar ou desmarcar uma pessoa
  descarta o resultado (validada, recusada ou indisponível) e exige validar de novo.

**Elegibilidade (o que o sistema decide hoje):** uma pessoa é elegível (`selectable`) quando o
**titular está ativo** e o **vínculo dela com o titular está ativo**. Pessoas inelegíveis são
exibidas, desabilitadas e com motivo em linguagem simples, mas não podem ser marcadas; se, ainda
assim, chegarem ao backend, são recusadas (`link_inactive`, `member_inactive`). O backend também
recusa vínculos de outro titular (`link_not_found`) e a mesma pessoa repetida
(`duplicate_person`).

**Sessão.** A prova de identificação (30 minutos) fica **apenas em memória** no navegador: nada em
`localStorage`, `sessionStorage`, cookie ou URL. Recarregar a página ou abrir `/pessoas`
diretamente leva de volta à identificação. Prova expirada ou inválida durante a seleção também
leva de volta à identificação, com aviso. A seleção feita não é guardada ao voltar.

**Não faz parte desta etapa:** checagem de duplicidade por data, criação da
operação e pagamento. Depois que o backend valida a seleção, a jornada segue direto para a
[escolha da data](#data-de-utilização).

**Ainda pendente do sindicato** (nada foi inventado; ver a tabela de
[regras pendentes](#regras-pendentes)): limite de pessoas por operação, critérios de
elegibilidade além da situação cadastral, texto oficial da mensagem de inelegibilidade e o
tratamento de dependentes de titular inativo.

## Data de utilização

Terceira etapa da jornada (tela "Quando pretende utilizar as piscinas?", rota `/data`).
Implementação em `src/features/usage-date/`; a validação de verdade é do backend
(`usagePolicy.checkUsageDate`, ver [Datas e fuso horário](#datas-e-fuso-horário)).

> **Regra PROVISÓRIA de desenvolvimento.** Hoje o sistema aceita **qualquer data de hoje em
> diante**. Isso **não** é uma confirmação de que as piscinas funcionam ou têm vaga naquele dia:
> o sindicato ainda não informou dias, horários, feriados, períodos de fechamento nem limites de
> antecedência. Nenhum desses foi inventado, e nenhum dia da semana é bloqueado. A tela repete
> esse aviso o tempo todo ("Regra provisória") e novamente ao aceitar uma data.

**Regras confirmadas (aplicadas hoje):**

- **A data é obrigatória.** Sem data, o botão não consulta o backend e a tela pede a data.
- **Datas passadas são bloqueadas; hoje é aceito.** "Hoje" é o dia do calendário de
  `America/Sao_Paulo` (fuso ainda sujeito à confirmação do sindicato), não o do aparelho.
- **A seleção de pessoas da etapa anterior é preservada** e exibida (só as escolhidas). "Voltar"
  retorna à seleção sem perdê-la.

**Como a data é tratada.** `usageDate` é uma **data de calendário** `YYYY-MM-DD`: texto, sem hora
e sem fuso. O campo é o `<input type="date">` nativo, que já entrega esse formato; a data nunca
vira `Date` local nem instante, para que o dia não mude por conversão UTC. A exibição por extenso
("sexta-feira, 20 de novembro de 2026") é calculada em UTC a partir dos mesmos números. A mesma
data segue ao backend como veio.

**Validação.** Ao continuar, a tela confere localmente (vazia, inexistente, passada) só para
orientar e então consulta o backend por `public/payments:checkDuplicates`, contrato que **já
existia** (nenhuma função pública foi criada). O servidor valida de novo a data
(`invalid_usage_date`, `past_usage_date`), revalida a seleção e informa conflitos. A decisão final
é sempre do servidor, que repete a verificação em `createOperation`. Relógio do aparelho errado
não burla nada: o backend recusa e a tela mostra o texto dele.

**Conflito de duplicidade.** Se alguma pessoa **da própria seleção** já tem operação pendente,
paga ou em análise naquela data, a tela lista **apenas os nomes devolvidos pelo backend** e não
deixa avançar; o associado escolhe outra data ou volta e retira essas pessoas. A tela não mostra
de quem é a operação conflitante, valores nem identificadores, e o backend não os envia.

**Invalidação.** A data escolhida vale para **aquele conjunto de pessoas**. Qualquer alteração na
seleção (marcar, desmarcar ou trocar alguém) **descarta a data** e o resultado da validação.
Reenviar a mesma seleção não descarta. Mudar a data descarta o resultado da validação anterior, e
o resultado só é exibido para a data para a qual foi obtido.

**Próxima etapa:** após a data aceita, a jornada segue para o
[resumo e criação da operação](#resumo-e-criação-da-operação). A cobrança Pix/cartão ainda não
existe (tela intermediária em `/pagamento`).

**Ainda pendente do sindicato** (nada foi inventado; ver [regras pendentes](#regras-pendentes)):
dias e horários de funcionamento, antecedência mínima e máxima, feriados e datas excepcionais,
períodos de fechamento e confirmação do fuso `America/Sao_Paulo`. Quando existirem, entram na
`UsagePolicy` (backend) e a tela passa a mostrar as datas indisponíveis a partir da resposta dele.

## Resumo e criação da operação

Quarta etapa da jornada (tela "Revise sua operação", rota `/resumo`). A interface fica em
`src/features/summary/`; a criação é a mutation pública `public/payments:createOperation`
(regra única em `createOperationCore`).

**Regras confirmadas (aplicadas hoje):**

- **Revisão obrigatória.** O associado vê data, pessoas (nome e vínculo), quantidade, valor
  unitário de referência (R$ 30,00) e total estimado **antes** de confirmar.
- **Revalidação no servidor.** Ao confirmar, o backend revalida prova de identificação, titular,
  seleção, elegibilidade, data e duplicidade. O `JourneyProvider` é só memória temporária: **não**
  é autoridade. Dados inválidos ou desatualizados → a operação **não** é criada; a tela mostra
  mensagem amigável e permite corrigir (pessoas ou data), preservando a jornada quando seguro.
- **Valores só no servidor.** O navegador não envia valores. Quantidade, unitário e total são
  calculados e persistidos pelo backend (`calculateOperationAmounts` + `UsagePolicy`).
- **Prazo de 15 minutos.** Começa **exclusivamente** no instante em que a operação é criada
  (`expiresAt = agora + 15 min`, calculado no servidor). Abrir o resumo, escolher a data ou
  identificar-se **não** inicia a contagem.
- **Idempotência (`requestId`).** Cada tentativa lógica de confirmação gera um UUID em memória. Em
  timeout ou falha de comunicação, a **mesma** chave é reenviada; o backend devolve a operação
  original (`reused: true`) com o mesmo `accessToken` (HMAC derivado). Clique duplo e chamadas
  simultâneas com a mesma chave resultam em **uma** operação. A mesma chave com outros dados é
  recusada (`request_id_conflict`). Sem `requestId` o comportamento antigo permanece.
- **Duplicidade.** Se já existe operação pendente/paga/em análise para alguma pessoa da seleção na
  data, a criação é recusada (`duplicate_usage`) com os nomes devolvidos pelo backend. Isso também
  cobre o caso de F5: a jornada em memória se perde; após nova identificação, tentar criar de novo
  esbarra na operação pendente — mensagem amigável, sem sugerir que o pagamento foi feito.
- **Sem persistência no navegador.** Nada em `localStorage`, `sessionStorage`, cookie ou URL.
  Após F5 o associado se identifica de novo. A recuperação automática da operação após nova
  identificação é **evolução futura** (fora do escopo desta etapa).

**Após a criação.** A jornada guarda em memória `operationId`, `accessToken`, valores e
`expiresAt` oficiais e navega para `/pagamento` (tela intermediária: informa que a operação foi
criada; **não** gera cobrança Pix/cartão).

**Ainda pendente / evolução futura:** interface real de pagamento; recuperação da operação pendente
após nova identificação; regras de funcionamento das piscinas (ver
[Data de utilização](#data-de-utilização)).

## Checkout Pix e cartão

Quinta etapa da jornada (rota `/pagamento`). A cobrança usa o `PaymentProvider` (hoje **mock**).
Confirmação financeira só pelo fluxo autorizado do backend (`providerEvents` /
`decideConfirmation`), nunca por um `paid: true` do navegador.

**Regras confirmadas:**

- Formas: Pix e cartão. Valores e prazo oficiais vêm da operação já criada.
- O prazo de 15 minutos começa na **criação da operação**, não na cobrança. Trocar de método ou
  atualizar a tela não reinicia a contagem.
- Pix mock: QR e código demonstrativos (não pagáveis). Confirmação via simulação interna
  (`dev/simulate`), não por endpoint público.
- Cartão mock: apenas tokens fictícios; nenhum dado real de cartão é coletado ou armazenado.
- Cobrança `pending` / `succeeded` / `failed` / `canceled` / `expired` é o estado da **tentativa**.
  Financeiro (`unpaid` / `paid` / `paid_late`) e operacional (`awaiting_payment` / `confirmed` /
  `expired` / `under_review` / `rejected`) continuam separados.
- Pagamento aprovado no prazo → confirmação normal. Recusa → nova tentativa no prazo, sem duplicar
  operação. Pendente → atualizar status. Expirado → mensagem oficial, sem tratar como pago.
- Pagamento tardio: financeiro `paid_late`, operacional `under_review`; sem liberação automática
  nem reembolso automático (mensagem de análise).
- Idempotência da cobrança: repetir `startPayment` reutiliza cobrança pendente da mesma forma
  (`reused: true`); outra forma com pendente → `payment_method_conflict`.

**Pendente (checkout):** Stripe real, webhook HTTP público, textos finais do sindicato.

Auditoria da 1ª entrega: [homologation-report.md](./homologation-report.md). Apresentação à
diretoria: [presentation-readiness.md](./presentation-readiness.md).

## Comprovante definitivo e notificações

**Critérios para emitir o comprovante definitivo (PDF):** cobrança validada pelo mecanismo
autorizado; financeiro `paid` (ou `paid_late` após aprovação administrativa); operacional
`confirmed`; operação **não** em análise. O frontend não produz comprovante definitivo por conta
própria. Numeração `SC-AAAA-NNNNNN` atômica no backend; reprocessamento reutiliza o mesmo registro
e o mesmo PDF.

**Pagamento tardio:** sem PDF definitivo, sem e-mail de confirmação de utilização, sem liberação
automática, sem reembolso automático.

**E-mail:** outbox assíncrono após confirmação. Falha de envio **não** altera `paid`/`confirmed`.
Reprocessamento do evento do provedor não reenvia. Nova tentativa controlada via
`requestReceiptEmail` apenas se a última falhou.

**WhatsApp:** contrato pronto; nesta etapa o histórico registra `not_configured` (nenhum envio).

**Download:** `getReceiptDownloadUrl` exige `operationId` + `accessToken`; URL temporária do File
Storage. Token inválido → mesma resposta de operação inexistente.

## Estados da operação

Detalhes e diagrama em [data-model.md](./data-model.md#estado-financeiro--estado-operacional).
Em resumo, são **dois eixos**:

- **Financeiro**: o dinheiro foi recebido? `unpaid`, `paid`, `paid_late`.
- **Operacional**: a utilização pode ser exercida? `awaiting_payment`, `confirmed`, `expired`,
  `under_review`, `rejected`.

### Estados e transições

Há **três** estados que nunca se confundem. Cada um responde a uma pergunta diferente:

| Estado                          | Onde                                  | Pergunta                              | Valores                                                                |
| ------------------------------- | ------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| **Da cobrança** (uma tentativa) | `paymentTransactions.status`          | O que o provedor diz desta tentativa? | `pending`, `succeeded`, `failed`, `canceled`, `expired`                |
| **Financeiro** (da operação)    | `paymentOperations.financialStatus`   | O dinheiro foi recebido?              | `unpaid`, `paid`, `paid_late`                                          |
| **Operacional** (da operação)   | `paymentOperations.operationalStatus` | A utilização pode ser exercida?       | `awaiting_payment`, `confirmed`, `expired`, `under_review`, `rejected` |

Regra central: **só um recebimento (`succeeded`) validado por `decideConfirmation` move o estado
financeiro.** Recusa, cancelamento e expiração de cobrança atualizam apenas a transação; a
operação segue `unpaid` (e, enquanto no prazo, `awaiting_payment`). A expiração da operação
(`awaiting_payment` → `expired`) também não é um recebimento e não toca no financeiro.

Transições permitidas (código: `domain/statuses.ts`):

```text
Cobrança:     pending ──► succeeded            (terminal: nunca é rebaixada)
              pending ──► failed | canceled | expired
              failed | canceled | expired ──► succeeded   (dinheiro recebido não é descartado)

Financeiro:   unpaid ──► paid          (no prazo, valor correto)
              unpaid ──► paid_late     (depois do prazo)
              paid, paid_late: terminais

Operacional:  awaiting_payment ──► confirmed | expired | under_review
              expired ──► confirmed    (recebido no prazo, notificação chegou depois)
              expired ──► under_review (recebimento tardio ou divergente)
              under_review ──► confirmed | rejected   (só por análise administrativa)
              confirmed, rejected: terminais
```

Quem causa cada transição:

| Causa                                                  | Cobrança                      | Financeiro  | Operacional                         |
| ------------------------------------------------------ | ----------------------------- | ----------- | ----------------------------------- |
| `startPayment` (Pix gerado / cartão pendente)          | cria `pending`                | —           | —                                   |
| Cartão recusado, Pix cancelado ou expirado no provedor | `failed`/`canceled`/`expired` | **—**       | **— (continua aberta até o prazo)** |
| Pagamento aprovado no prazo                            | `succeeded`                   | `paid`      | `confirmed`                         |
| Pagamento aprovado depois do prazo                     | `succeeded`                   | `paid_late` | `under_review`                      |
| Valor divergente                                       | `succeeded`                   | `unpaid`    | `under_review`                      |
| Prazo de 15 min sem recebimento (função agendada)      | —                             | —           | `expired` (reservas liberadas)      |
| Análise administrativa                                 | —                             | —           | `confirmed` ou `rejected`           |

O **resultado imediato do provedor** na criação (ex.: cartão aprovado) é tratado como um evento
comum (`created:<id>`, `occurredAt` = instante da resposta), pela mesma porta dos webhooks. Não há
atalho: um cartão aprovado depois do prazo vira `paid_late` + análise, sem liberação.

### Regras da criação de cobrança

Validadas no servidor, antes de qualquer chamada ao provedor
(`domain/charges.checkOperationPayable` + `payments/charges:begin`):

1. A operação existe e a credencial (`accessToken`) confere (mesma resposta para inexistente/incorreta).
2. Está **pendente**: `unpaid` + `awaiting_payment`. Paga → `operation_already_paid`; recebimento
   tardio/em análise → `operation_under_review` (prevalece sobre "expirada", para não orientar a
   pagar de novo); encerrada → `operation_closed`.
3. **Não expirou**, pelo relógio e não só pelo status (a expiração agendada pode atrasar).
4. Possui pessoas selecionadas, e a quantidade de pessoas gravadas bate com `quantity`.
5. O valor é válido: `totalAmountCents = quantity × unitAmountCents`, inteiro e positivo. Qualquer
   inconsistência bloqueia a cobrança (`invalid_operation_amount`): melhor recusar que cobrar errado.
6. Não há cobrança anterior incompatível: no máximo **uma cobrança pendente por operação**;
   outra forma de pagamento com uma pendente → `payment_method_conflict`; tentativas limitadas a 3.

O valor cobrado é **sempre** o armazenado na operação; o navegador não envia valor.

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
| `confirmed`        | Pago e liberado                         | Pagamento confirmado. O comprovante está disponível para download e será enviado por e-mail.              |
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
- **Cartão:** apenas quatro tokens fictícios (`tok_mock_approved`, `tok_mock_declined`,
  `tok_mock_pending`, `tok_mock_unavailable`); não há 3-D Secure de verdade. No desenvolvimento, o
  navegador escolhe o resultado pelo token (simula o SDK); com um provedor real o resultado é do
  provedor.
- **Pix:** o "copia e cola" e o QR são fictícios e não pagáveis; nenhum banco os reconhece.
- **Simulação de pagamento:** CLI/painel via `dev/simulate:simulatePayment` (interna;
  `APP_ENV=development|demonstration` + mock). Na demonstração hospedada, também
  `public/payments:simulateDemoPayment` (exige `accessToken`, só `APP_ENV=demonstration` + mock;
  outcomes `approved`/`declined`; nunca aceita status financeiro do cliente). Nenhum pagamento
  real. "Pagamento tardio" na demo pública: aprovar após o prazo (mesmas regras de negócio).
- **Cobranças órfãs:** se a action cair depois de o provedor criar a cobrança e antes de gravá-la
  localmente, a retomada (mesma chave de idempotência) recupera a mesma cobrança; se ninguém
  retomar, um webhook posterior dessa cobrança vira `unknown_transaction` + alerta. Não há
  reconciliação automática (`getPaymentStatus` não é chamado por nenhuma rotina) nem expiração
  automática de tentativas `creating` órfãs.
- **Notificações:** e-mail mock registra tentativa/`sent`; WhatsApp fica `not_configured`.
- **Cobranças desconhecidas e reenvios do provedor:** só ocorrem se forem simulados nos testes.
- **Regras de funcionamento, antecedência e isenções:** inexistentes (ver pendências).
- **Comprovante:** PDF gerado no backend (File Storage); prefixo `SC` provisório. E-mail mock;
  WhatsApp `not_configured`.
- **Identificação:** há limites técnicos (5 falhas/15 min por carteirinha, 120 consultas/min
  global, 10 operações/15 min por titular), mas **não** limite por IP nem CAPTCHA (o Convex não
  expõe a origem). Um atacante pode bloquear uma carteirinha por 15 min. Ver
  [architecture.md](./architecture.md#estratégia-de-segurança-da-api).
- **API pública:** o mock devolve sempre os mesmos dados; titular inativo é **informado** (situação
  cadastral) e fica sem prova de identificação, em vez de erro genérico.
- Os limites acima são salvaguardas técnicas, **não** regras de negócio do sindicato
  (`convex/domain/limits.ts`).

## Regras da demonstração institucional (hospedada)

Ambiente separado do desenvolvimento local (`grateful-chipmunk-18`) e da futura produção.
Backend de demo: projeto Convex `sindicato-demo` / `coordinated-mink-914` com
`APP_ENV=demonstration` e providers mock. Frontend Vercel ainda pode estar pendente de
publicação. Detalhes em [deployment-guide.md](./deployment-guide.md).

| Regra                                   | Aplicação                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Somente associados fictícios            | `MemberProvider` mock; carteirinhas da tabela do README                       |
| Nenhum CPF real                         | CPFs algoritmicamente gerados para teste                                      |
| Nenhum pagamento real                   | `PAYMENT_PROVIDER=mock`; tokens/QR não bancários                              |
| Nenhuma integração WhatsApp/e-mail real | `NOTIFICATION_PROVIDER=mock`; WhatsApp `not_configured`                       |
| Confirmação financeira fechada          | API pública não confirma; simulação só `internal`                             |
| Separação de deployments                | Convex de demo ≠ Convex local; sem dados reais no demo                        |
| `APP_ENV`                               | `demonstration` (ou `development` local) para mocks; produção futura sem mock |

**Limites dos pagamentos simulados:** valor e prazo seguem as regras de negócio (R$ 30/pessoa,
15 minutos); o “pagamento” não liquida dinheiro. Cartão mock aprova/recusa conforme token; Pix
mock fica pendente até simulação autorizada (`simulateDemoPayment` na demo pública, ou CLI
interna). Rate limit: 20 simulações públicas / 15 min por operação.
