# Sede Campestre — Sindicomerciários

Aplicação web pública para pagamento da taxa médica de utilização das piscinas da sede campestre
(R$ 30 por pessoa), sem criação de conta. O associado informa carteirinha e CPF, seleciona as
pessoas e a data de utilização e paga via Pix ou cartão em até 15 minutos.

> **Estado atual:** backend completo (modelo de dados, criação de operação com prevenção de
> duplicidade, expiração, confirmação de pagamento, pagamento tardio com análise administrativa,
> API pública, contratos dos serviços externos e mocks de desenvolvimento) e as **quatro primeiras
> telas da jornada** (identificação, seleção, data e resumo/criação da operação), com testes
> automatizados. A etapa de pagamento tem só uma tela intermediária (sem cobrança Pix/cartão).
> Integrações reais (cadastro do sindicato, Stripe, e-mail/WhatsApp) ainda não existem; o
> desenvolvimento usa mocks. Este projeto **não** é um sistema geral de reservas.

| Etapa da jornada      | Situação                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| 1. Identificação      | Implementada (`/`)                                                            |
| 2. Seleção de pessoas | Implementada (`/pessoas`); valida a seleção no backend e para antes da data   |
| 3. Data de utilização | Implementada (`/data`); regra **provisória**: qualquer data de hoje em diante |
| 4. Resumo             | Implementada (`/resumo`); cria a operação no backend com idempotência         |
| 5. Pagamento          | Tela intermediária (`/pagamento`); cobrança Pix/cartão ainda não implementada |
| 6. Comprovante        | Não implementada (backend gera o comprovante; falta a tela e o envio real)    |

## Stack

React · TypeScript (strict) · Vite · TanStack Router · Tailwind CSS v4 · shadcn/ui · Convex

## Documentação

- [Regras de negócio](docs/business-rules.md) (confirmadas, pendentes, seleção, data, resumo/operação, estados, pagamento tardio, duplicidade, mensagens)
- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/data-model.md)
- [Integrações externas](docs/integrations.md)

## Requisitos

- **Node.js 22** (`.nvmrc`; `engines`: `^22.13.0 || ^24.0.0 || >=26.0.0`). Exigido pelo CLI do
  Convex, Vite, Vitest e ESLint. Com `nvm`/`fnm`: `nvm use` na raiz. Node 20 não é suportado: o
  `pnpm` avisa e o Vitest falha ao reportar erros.
- [pnpm](https://pnpm.io/) 10 (`corepack enable` ativa a versão definida em `packageManager`)

## Instalação

```bash
pnpm install
cp .env.example .env.local
```

## Execução

```bash
pnpm dev          # frontend em http://localhost:5173
pnpm dev:convex   # backend Convex
```

O frontend sobe sem o Convex. Na primeira execução de `pnpm dev:convex`, o CLI cria/associa um
deployment e grava `VITE_CONVEX_URL` em `.env.local` automaticamente.

### Tela de identificação do associado

A rota `/` é a primeira etapa da jornada (carteirinha + CPF) e consome `public/members:lookup`.
Para experimentá-la ponta a ponta: `pnpm dev:convex`, defina as variáveis abaixo e, em outro
terminal, `pnpm dev`; use os dados fictícios da tabela mais adiante. Sem `VITE_CONVEX_URL` a tela
abre, mas a consulta responde "Não foi possível consultar agora".

Organização (`src/features/identification/`): `api/` (única chamada ao Convex), `lib/`
(máscara, preenchimento e interpretação das respostas; funções puras), `hooks/` (estado da tela),
`components/` (apresentação). O layout compartilhado das telas da jornada está em
`src/components/layout/journey-layout.tsx`. Capturas de tela em `docs/screenshots/`
(`<largura>-<n>-<estado>.png`). Regras de negócio continuam só no backend: o front apenas
classifica as respostas (`identification_failed` → "não encontrado", cadastro inativo,
`too_many_attempts`, demais falhas → "tente novamente").

### Tela de seleção de pessoas

A rota `/pessoas` é a segunda etapa ("Quem utilizará as piscinas?"). Parte da identificação
(botão "Escolher pessoas") e usa `public/members:validateSelection` antes de avançar.

- **Identificadores:** a seleção usa o `linkId` do vínculo (o `personId` nunca é enviado ao
  navegador, por decisão da API pública). Nomes e valores nunca vão ao backend.
- **Sessão:** a prova de identificação e a seleção ficam só em memória (`JourneyProvider`, em
  `src/app/providers/`); nada em `localStorage`, `sessionStorage`, cookie ou URL. Recarregar a
  página, abrir `/pessoas` direto ou ter a prova recusada (`session_invalid`) leva de volta a `/`
  com um aviso (`?motivo=sessao-expirada` ou `?motivo=identificacao-necessaria`).
- **Valores:** o resumo (R$ 30,00 por pessoa) é informativo e usa a função pura de preço do
  backend; o valor cobrado é sempre recalculado no servidor ao criar a operação.
- **Elegibilidade:** quem o backend marca como não selecionável aparece desabilitado, com
  justificativa; o front não decide elegibilidade.
- **Seleção:** nenhuma pessoa vem marcada; o titular é opcional; não há convidados. Qualquer
  mudança na seleção invalida a validação anterior. Regras completas em
  [docs/business-rules.md](docs/business-rules.md#seleção-de-pessoas).
- **Mobile:** em telas estreitas o resumo e o botão ficam fixos na base, respeitando a área
  segura do aparelho (`viewport-fit=cover` + `env(safe-area-inset-bottom)`), sem cobrir conteúdo.
- **Próxima etapa:** validada a seleção, a jornada segue para a [data de utilização](#tela-de-data-de-utilização).

Organização: `src/features/selection/` (`api/`, `lib/`, `hooks/`, `components/`), no mesmo padrão
da identificação. Capturas em `docs/screenshots/<largura>-s<n>-<estado>.png`.

### Tela de data de utilização

A rota `/data` é a terceira etapa ("Quando pretende utilizar as piscinas?"). Exige associado
identificado e pessoas selecionadas (senão volta para `/` ou `/pessoas`).

> **Regra provisória de desenvolvimento:** qualquer data de hoje em diante é aceita. Isso **não**
> confirma que as piscinas funcionam ou estão disponíveis no dia: dias e horários de
> funcionamento, antecedência, feriados e períodos de fechamento ainda não foram informados pelo
> sindicato e **não foram inventados**. A tela exibe esse aviso e o repete ao aceitar a data.

- **Data de calendário:** `usageDate` é texto `YYYY-MM-DD` (campo `<input type="date">`), sem
  `Date`, hora nem fuso, para o dia não mudar por conversão UTC. "Hoje" usa o calendário de
  `America/Sao_Paulo` (a confirmar). Datas passadas são bloqueadas; hoje é aceito.
- **Validação:** usa o contrato existente `public/payments:checkDuplicates` (nenhuma função
  pública nova): o backend valida a data, revalida a seleção e informa conflitos. Em conflito, a
  tela lista só os nomes devolvidos pelo backend.
- **Estado:** a data fica em memória no `JourneyProvider`. Qualquer mudança na seleção de pessoas
  descarta a data e a validação. "Voltar" preserva a seleção.
- **Próxima etapa:** após aceita, o resumo ainda não existe (botão desabilitado).

Organização: `src/features/usage-date/` (`api/`, `lib/`, `hooks/`, `components/`).

### Tela de resumo e criação da operação

A rota `/resumo` é a quarta etapa ("Revise sua operação"). Exige associado identificado, pessoas
selecionadas e data escolhida. Ao confirmar ("Continuar para pagamento"), o frontend chama
`public/payments:createOperation` — **única autoridade** sobre valores, prazo e elegibilidade.

- **Valores:** o resumo mostra R$ 30,00 por pessoa como referência; o total oficial vem na resposta
  do backend. O navegador **nunca** envia valores.
- **Prazo:** os 15 minutos começam **somente** quando a operação é criada no servidor
  (`expiresAt` na resposta). Abrir o resumo não inicia a contagem.
- **Idempotência:** cada tentativa lógica gera um `requestId` (UUID) em memória. Em timeout ou
  falha de comunicação, a mesma chave é reenviada; o backend devolve a operação original
  (`reused: true`) com o mesmo `accessToken` (derivado por HMAC). Não há `localStorage` /
  `sessionStorage` / cookie / URL. Após F5 a jornada se perde; se já houver operação pendente,
  uma nova tentativa incompatível é recusada com mensagem amigável (`duplicate_usage`).
- **Segredo do deployment:** `OPERATION_TOKEN_SECRET` (≥ 32 caracteres) é obrigatório para
  criar com `requestId`. Ver variáveis abaixo.
- **Próxima etapa:** `/pagamento` informa que a operação foi criada e que a cobrança ainda não
  está disponível (não chama o PaymentProvider).

Organização: `src/features/summary/` (`api/`, `lib/`, `hooks/`, `components/`).

### Variáveis do backend (deployment Convex)

Ficam no deployment, não no `.env.local`. Para desenvolvimento local:

```bash
pnpm exec convex env set APP_ENV development
pnpm exec convex env set CPF_HASH_SECRET "$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
pnpm exec convex env set OPERATION_TOKEN_SECRET "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
```

`OPERATION_TOKEN_SECRET` (≥ 32 caracteres) deriva o `accessToken` quando a criação usa
`requestId` (idempotência). Para rotacionar: copie o valor atual para
`OPERATION_TOKEN_SECRET_PREVIOUS` e grave o novo em `OPERATION_TOKEN_SECRET`. Detalhes em
[docs/architecture.md](docs/architecture.md).

Com `APP_ENV=development`, os providers usam mocks por padrão. Sem essa variável, mocks são
recusados (proteção contra uso acidental em produção). Detalhes em
[docs/integrations.md](docs/integrations.md).

## Dados fictícios de teste (somente desenvolvimento)

Fornecidos pelo `MemberProvider` mock (`convex/providers/mock/mockMembers.ts`). Nomes,
telefones e e-mails (`example.com`) são inventados; os CPFs foram gerados algoritmicamente para
testes e não representam pessoas reais.

| Carteirinha | CPF              | Associado             | Situação | Dependentes   |
| ----------- | ---------------- | --------------------- | -------- | ------------- |
| `100001`    | `100.000.001-08` | Ana Teste Almeida     | Ativo    | 2             |
| `100002`    | `100.000.002-80` | Carlos Exemplo Souza  | Ativo    | 0             |
| `100003`    | `100.000.003-61` | Daniela Modelo Lima   | Ativo    | 5 (1 inativo) |
| `900004`    | `900.000.004-18` | Igor Inativo Ferreira | Inativo  | 1             |

Cada pessoa tem um `personId` estável (`mock-person-NNNN`), distinto do id do vínculo. **Clara
Teste Almeida** é dependente de Ana (`100001`) e de Daniela (`100003`) com o mesmo `personId`: serve
para testar que a mesma pessoa não paga duas vezes na mesma data, mesmo por titulares diferentes.

Para experimentar a API pública (`convex/public/`), consulte com carteirinha e CPF acima; o
contrato completo está em [docs/architecture.md](docs/architecture.md#api-pública-contrato-com-o-frontend).
Operações podem ser criadas, consultadas e **cobradas** (`startPayment`, Pix ou cartão com token
fictício). Nenhum pagamento acontece sozinho: para "pagar" no desenvolvimento use a simulação
interna (só com `APP_ENV=development` e provider mock):

```bash
npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved"}'
# outcome: approved | declined | pending | approved_after_expiry
```

Detalhes e a lista do que depende da integração real em
[docs/integrations.md](docs/integrations.md#webhook-e-integração-futura-stripe).

Pagamento simulado: cartão `tok_mock_approved` (aprova), `tok_mock_declined` (recusa),
`tok_mock_pending` (pendente) e `tok_mock_unavailable` (provedor fora do ar). Pix
nasce pendente; a confirmação simulada está descrita em
[docs/integrations.md](docs/integrations.md#mocks).

## Scripts

| Comando             | Descrição                                 |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Servidor de desenvolvimento (Vite)        |
| `pnpm dev:convex`   | Backend Convex em modo de desenvolvimento |
| `pnpm build`        | Verificação de tipos e build de produção  |
| `pnpm preview`      | Pré-visualiza o build                     |
| `pnpm typecheck`    | Verificação de tipos (`tsc -b`)           |
| `pnpm test`         | Testes automatizados (Vitest)             |
| `pnpm test:watch`   | Testes em modo observação                 |
| `pnpm lint`         | ESLint                                    |
| `pnpm lint:fix`     | ESLint com correção automática            |
| `pnpm format`       | Formata com Prettier                      |
| `pnpm format:check` | Verifica a formatação                     |

## Estrutura

```text
src/
  app/
    router/       criação e registro do router
    providers/    providers globais (Convex e JourneyProvider: identificação e seleção em memória)
  components/
    ui/           componentes shadcn/ui
    shared/       componentes reutilizáveis do projeto
    layout/       estrutura das telas da jornada (JourneyLayout)
  features/       módulos por funcionalidade: identification, selection, usage-date e summary
                  (prontos); payment (tela intermediária); previstos: pool-payment, receipts, admin
  lib/            utilitários e configuração (cn, env, cliente Convex, with-timeout, public-error)
  services/       adaptadores do frontend (chamadas ao Convex), quando necessário
  types/          tipos compartilhados
  routes/         rotas por arquivo (TanStack Router)
convex/
  schema.ts       schema do banco
  domain/         regras puras: statuses, pricing, time, usagePolicy, selection, confirmation,
                  messages, cpf, privacy
  payments/       mutations internas: operations, providerEvents, reviews
                  (+ helpers: confirmations, claims, events, receipts)
  providers/      contratos (member/payment/notification), registry e mock/
  members/        sync (pessoas, vínculos e papéis a partir do MemberProvider)
  notifications/  funções Convex (próximas etapas)
tests/            domain/ (funções puras), convex/ (mutations com convex-test) e web/
                  (interface: funções puras e componentes com Testing Library + jsdom)
docs/             regras de negócio, arquitetura, modelo de dados e integrações
```

Alias de importação: `@` aponta para `src` (ex.: `import { cn } from '@/lib/utils'`).

## Convenções

- `src/routeTree.gen.ts` é gerado pelo plugin do TanStack Router e deve ser versionado.
- Componentes shadcn/ui: `pnpm dlx shadcn@latest add <componente>`.
- Arquivos em `convex/` usam camelCase (o Convex não aceita hífen em nomes de módulo).
- Toda lógica financeira vive no backend; valores em centavos inteiros.
- Integrações externas (Stripe, WhatsApp, cadastro do sindicato) entram por interfaces em
  `convex/providers/`, com mocks inicialmente.
- Variáveis `VITE_*` são públicas; segredos nunca devem ficar no frontend.
