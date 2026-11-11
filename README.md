# Sede Campestre — Sindicomerciários

Aplicação web pública para pagamento da taxa médica de utilização das piscinas da sede campestre
(R$ 30 por pessoa), sem criação de conta. O associado informa carteirinha e CPF, seleciona as
pessoas e a data de utilização e paga via Pix ou cartão em até 15 minutos.

> **Estado atual:** estrutura do projeto, modelo de dados, regras de negócio no backend
> (criação de operação com prevenção de duplicidade, expiração, confirmação de pagamento e
> pagamento tardio com análise administrativa), contratos dos serviços externos e mocks de
> desenvolvimento, com testes automatizados. Telas, entradas públicas e integrações reais ainda
> não existem. Este projeto **não** é um sistema geral de reservas.

## Stack

React · TypeScript (strict) · Vite · TanStack Router · Tailwind CSS v4 · shadcn/ui · Convex

## Documentação

- [Regras de negócio](docs/business-rules.md) (confirmadas, pendentes, estados, pagamento tardio, duplicidade, mensagens)
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

### Variáveis do backend (deployment Convex)

Ficam no deployment, não no `.env.local`. Para desenvolvimento local:

```bash
pnpm exec convex env set APP_ENV development
pnpm exec convex env set CPF_HASH_SECRET "$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
```

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

Pagamento simulado: cartão `tok_mock_approved` (aprova) e `tok_mock_declined` (recusa). Pix
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
    providers/    providers globais (Convex)
  components/
    ui/           componentes shadcn/ui
    shared/       componentes reutilizáveis do projeto
  features/       módulos por funcionalidade (member-identification, dependents,
                  pool-payment, payment-status, receipts, admin)
  lib/            utilitários e configuração (cn, env)
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
tests/            domain/ (funções puras) e convex/ (mutations com convex-test)
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
