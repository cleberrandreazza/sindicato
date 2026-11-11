# Guia de deployment — demonstração hospedada

Preparação do ambiente **de demonstração institucional** (frontend na Vercel + Convex separado).
Este guia **não** publica produção real com pagamentos nem altera o deployment de desenvolvimento
local (`dev:grateful-chipmunk-18`).

> **Estado atual (backend):** o Convex de demonstração **já existe e está implantado** (schema,
> funções, variáveis mock). URL: `https://coordinated-mink-914.convex.cloud`. Lookup fictício
> validado (`100001` / `100.000.001-08`). Providers reais (Stripe / e-mail / WhatsApp) **não**
> estão ativos.
>
> **Estado atual (frontend):** `vercel.json` está pronto para o **primeiro deployment** de
> demonstração. O push em `master` deve iniciar o build na Vercel **se** o repositório
> `cleberrandreazza/sindicato` já estiver importado e `VITE_CONVEX_URL` configurada. Até existir
> uma URL HTTPS validada, **não** trate o sistema como publicado.

## Ambientes

| Ambiente        | Frontend                      | Convex                                                           | Dados             | Providers                      |
| --------------- | ----------------------------- | ---------------------------------------------------------------- | ----------------- | ------------------------------ |
| Local (dev)     | `pnpm dev` → `localhost:5173` | `grateful-chipmunk-18` (projeto original)                        | Fictícios (mock)  | Mock (`APP_ENV=development`)   |
| Demonstração    | Vercel (1º deploy)            | **Projeto** `sindicato-demo` → deployment `coordinated-mink-914` | Somente fictícios | Mock (`APP_ENV=demonstration`) |
| Produção futura | Vercel (projeto produção)     | Deployment sem mocks                                             | Cadastro real     | Providers reais                |

**Regra:** nunca apontar a Vercel de demonstração para `grateful-chipmunk-18`. Desenvolvimento e
demonstração permanecem separados.

Frontend: só `VITE_CONVEX_URL`. `VITE_CONVEX_SITE_URL` **não** é lida pelo código.

## Deployment Convex de demonstração (já criado)

| Campo      | Valor                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Team       | `cleberandreazza`                                                                             |
| Projeto    | `sindicato-demo` ([Dashboard](https://dashboard.convex.dev/t/cleberandreazza/sindicato-demo)) |
| Deployment | `coordinated-mink-914` (referência CLI: `cleberandreazza:sindicato-demo:demo`)                |
| URL Cloud  | `https://coordinated-mink-914.convex.cloud`                                                   |
| Dashboard  | https://dashboard.convex.dev/t/cleberandreazza/sindicato-demo/coordinated-mink-914            |

### Variáveis no Convex de demonstração (nomes apenas)

Configuradas no deployment (valores **não** versionados; segredos gerados só para a demo):

| Nome                     | Valor esperado           |
| ------------------------ | ------------------------ |
| `APP_ENV`                | `demonstration`          |
| `MEMBER_PROVIDER`        | `mock`                   |
| `PAYMENT_PROVIDER`       | `mock`                   |
| `NOTIFICATION_PROVIDER`  | `mock`                   |
| `CPF_HASH_SECRET`        | exclusivo da demo (≥ 16) |
| `OPERATION_TOKEN_SECRET` | exclusivo da demo (≥ 32) |

Não reutilizar secrets do desenvolvimento. Nunca colocar esses valores em `VITE_*`.

### Atualizar funções no Convex de demo

Arquivo local **gitignored** `.env.demo.local` guarda `CONVEX_DEPLOY_KEY` do deployment de
demonstração (criado com `npx convex deployment token create … --save-env .env.demo.local`).

```bash
# Confirme o alvo no log: coordinated-mink-914 / sindicato-demo
pnpm exec convex deploy --env-file .env.demo.local
```

**Não** use `pnpm exec convex deploy` sem `--env-file` a partir deste clone: com
`CONVEX_DEPLOYMENT` do `.env.local`, o CLI mira a produção do **projeto de desenvolvimento**,
não o `sindicato-demo`.

Alternativa sem arquivo local: gerar deploy key no Dashboard do `sindicato-demo` e exportar
`CONVEX_DEPLOY_KEY` só na sessão / CI.

### Dados fictícios (sem seed)

O `MemberProvider` mock responde sem seed no banco. Carteirinhas de demonstração:

| Carteirinha | CPF              | Associado             |
| ----------- | ---------------- | --------------------- |
| `100001`    | `100.000.001-08` | Ana Teste Almeida     |
| `100002`    | `100.000.002-80` | Carlos Exemplo Souza  |
| `100003`    | `100.000.003-61` | Daniela Modelo Lima   |
| `900004`    | `900.000.004-18` | Igor Inativo Ferreira |

Validação já feita no backend de demo:

```bash
pnpm exec convex run --deployment cleberandreazza:sindicato-demo:demo \
  public/members:lookup '{"membershipNumber":"100001","cpf":"10000000108"}'
```

## Segurança da demonstração

- Somente associados fictícios; nenhum CPF real; nenhum pagamento real.
- Segredos só no Convex Dashboard / CLI.
- `simulateDemoPayment` só com `APP_ENV=demonstration` + mock + `accessToken` da operação.
- Funções internas (`dev/simulate`, `providerEvents.ingest`, etc.) **não** estão na superfície
  pública.
- **Acesso da diretoria:** URL **pública** (sem Deployment Protection / senha na Vercel), conforme
  pedido institucional. Ausência de senha **não** autoriza expor funções internas — a proteção
  continua sendo a superfície pública fechada + gates de `APP_ENV`.

## Frontend (Vercel) — primeiro deployment de demonstração

### Pré-requisitos no painel Vercel (uma vez)

Se o projeto **ainda não** estiver importado:

1. Em [vercel.com](https://vercel.com), **Import** → `cleberrandreazza/sindicato`.
2. Framework: **Vite** (já em [`vercel.json`](../vercel.json)).
3. Build: `pnpm build` · Output: `dist` · Install: `pnpm install`.
4. Environment Variables (Production **e** Preview):
   - `VITE_CONVEX_URL` = `https://coordinated-mink-914.convex.cloud`
   - **Não** definir `VITE_CONVEX_SITE_URL` nem qualquer segredo em `VITE_*`.
5. **Não** ativar Deployment Protection / senha (acesso da diretoria sem autenticação).
6. Branch de produção: `master` (deploy automático no push).

Se o projeto **já** estiver conectado e a variável acima definida, o push em `master` inicia o
deployment automaticamente. **Não** é necessário `vercel deploy` pelo CLI neste fluxo.

### Variáveis

| Variável               | Obrigatória | Valor                                       |
| ---------------------- | ----------- | ------------------------------------------- |
| `VITE_CONVEX_URL`      | Sim         | `https://coordinated-mink-914.convex.cloud` |
| `VITE_CONVEX_SITE_URL` | Não         | Não configurar (código não usa)             |
| Segredos em `VITE_*`   | Proibido    | —                                           |

### Configuração no repositório (`vercel.json`)

- Framework Vite, `pnpm build` → `dist`, `pnpm install`.
- Rewrite SPA: `/(.*)` → `/index.html` (TanStack Router: `/pessoas`, `/pagamento`, etc.).

### Após o deploy

1. Abrir a URL HTTPS do deployment no Dashboard Vercel.
2. Confirmar que refresh em rota profunda não retorna 404.
3. Executar o [checklist](#checklist-de-validação-pós-publicação-reproduzível).
4. Só então comunicar a URL à diretoria.

## Checklist de validação pós-publicação (reproduzível)

Executar na URL Vercel (quando existir) ou, para o backend, via CLI no deployment de demo:

1. Identificação: carteirinha `100001`, CPF `100.000.001-08`.
2. Seleção: titular + dependente(s).
3. Data: hoje ou futura.
4. Resumo: conferir quantidade e R$ 30,00/pessoa.
5. Criação da operação (sem valor inventado pelo cliente).
6. Checkout Pix simulado (QR/código não pagáveis).
7. Aprovação via botões de demonstração (`simulateDemoPayment`).
8. Comprovante com número `SC-…`.
9. Download do PDF (mesmo `accessToken`).
10. Nova jornada: recusa simulada → sem comprovante definitivo.
11. Expiração: operação fora do prazo de 15 min (mensagem oficial).
12. Token inválido / de outra operação → `operation_not_found` (sem vazamento).

Automatizado (sempre, neste repositório):

```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build
```

## Atualizar a demonstração

1. Push em `master` → Vercel reconstrói o frontend (após o projeto existir).
2. Mudanças em `convex/`: `pnpm exec convex deploy --env-file .env.demo.local`.
3. Não rode `convex deploy` “no automático” contra a produção futura com dados reais.

## Desenvolvimento local (inalterado)

```bash
pnpm install
pnpm dev:convex   # grateful-chipmunk-18 / APP_ENV=development
pnpm dev
```

`.env.local` continua apontando para o deployment de desenvolvimento. `.env.demo.local` é só
para operações no Convex de demonstração e **não** deve ser commitado.
