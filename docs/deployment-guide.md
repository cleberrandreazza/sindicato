# Guia de deployment — demonstração hospedada

Preparação do ambiente **de demonstração institucional** (frontend na Vercel + Convex separado).
Este guia **não** publica produção real nem altera o deployment de desenvolvimento local.

> Estado deste repositório: a configuração (SPA, documentação, `APP_ENV=demonstration`) está
> pronta. Enquanto não existir uma URL HTTPS externa validada, **não** trate o sistema como
> publicado.

## Ambientes

| Ambiente        | Frontend                         | Convex                                       | Dados                      | Providers                      |
| --------------- | -------------------------------- | -------------------------------------------- | -------------------------- | ------------------------------ |
| Local (dev)     | `pnpm dev` → `localhost:5173`    | Deployment de desenvolvimento (ex.: `dev:…`) | Fictícios (mock)           | Mock (`APP_ENV=development`)   |
| Demonstração    | Vercel (preview ou projeto demo) | **Outro** deployment Convex, dedicado        | Somente fictícios          | Mock (`APP_ENV=demonstration`) |
| Produção futura | Vercel (projeto produção)        | Deployment Convex de produção                | Cadastro real do sindicato | Providers reais (sem mock)     |

**Regra:** não reutilizar automaticamente o deployment local (ex.: `dev:grateful-chipmunk-18`)
como backend da demonstração pública. Desenvolvimento e demonstração devem permanecer separados.

O frontend só precisa de `VITE_CONVEX_URL` apontando para o Convex do ambiente correspondente.
`VITE_CONVEX_SITE_URL` **não** é usada pelo código da aplicação (pode aparecer no `.env.local`
gerado pelo CLI; ignore-a na Vercel).

## Segurança da demonstração

Obrigatório neste ambiente:

- Somente associados fictícios do `MemberProvider` mock (sem CPF real).
- Nenhum pagamento real; Stripe/WhatsApp/e-mail reais **desligados**.
- Segredos (`CPF_HASH_SECRET`, `OPERATION_TOKEN_SECRET`) **somente** no Convex Dashboard / CLI —
  nunca em `VITE_*`, nunca versionados.
- Confirmação financeira na **produção** continua fechada. Em `APP_ENV=demonstration` + mock,
  `public/payments:simulateDemoPayment` exige `operationId` + `accessToken`, outcome simbólico
  (`approved`/`declined`) e reusa a porta do webhook mock — **nunca** aceita `payment_status=paid`
  do navegador. Em qualquer outro `APP_ENV` responde `demo_simulation_disabled`. A CLI
  `dev/simulate:simulatePayment` permanece interna.

### Limitação importante (checkout simulado hospedado)

Os mocks só são permitidos com `APP_ENV=development` ou `APP_ENV=demonstration`. Em um URL
público na Vercel com deployment de demonstração:

- Quem tem a URL e o `accessToken` da **própria** operação pode iniciar cobranças simuladas e
  usar “Simular aprovado/recusado” (autorizados no backend).
- Não há como aprovar operação alheia sem o token dela.
- Cartão mock também pode “aprovar” com tokens fictícios — **não** movimenta dinheiro.
- Produção (`APP_ENV` ≠ `demonstration`) não exibe esses controles (`demoSimulationAllowed` vem
  do servidor).

Se a diretoria exigir URL restrita: use **Vercel Deployment Protection** / senha de preview
(recurso do plano Vercel), VPN ou link temporário. **Não** implemente autenticação só no
frontend (facilmente contornável). Sem proteção de hospedagem, a demonstração é **pública** no
sentido de URL acessível a quem a tiver.

## 1. Criar o deployment Convex de demonstração

Não execute `npx convex deploy` contra produção neste passo. Não altere o `.env.local` do
desenvolvimento local se puder evitá-lo (use um segundo clone ou configure o deployment demo via
Dashboard / `CONVEX_DEPLOY_KEY` de um projeto/deploy separado).

Opções comuns:

1. **Projeto Convex separado** (recomendado): criar outro projeto no [Dashboard Convex](https://dashboard.convex.dev)
   só para demonstração; associar o repositório ou fazer deploy com deploy key desse projeto.
2. **Production deployment do mesmo projeto**, usado **apenas** como demo (ainda sem Stripe real):
   só se a equipe aceitar que `prod` neste projeto = demo. Documente isso explicitamente e **não**
   coloque dados reais.

Checklist após criar o deployment:

```bash
# Confirme o alvo no CLI (nome do deployment) ANTES de qualquer env set / deploy.
pnpm exec convex env set APP_ENV demonstration
pnpm exec convex env set MEMBER_PROVIDER mock
pnpm exec convex env set PAYMENT_PROVIDER mock
pnpm exec convex env set NOTIFICATION_PROVIDER mock
pnpm exec convex env set CPF_HASH_SECRET "<segredo-demo-≥16-caracteres>"
pnpm exec convex env set OPERATION_TOKEN_SECRET "<segredo-demo-≥32-caracteres>"
```

Depois publique o schema e as funções **para esse deployment** (comando conforme o fluxo escolhido:
`npx convex deploy` com deploy key da demo, ou sync do Dashboard). **Não** rode deploy sem
confirmar o nome do deployment.

Dados fictícios: o mock de associados **não** exige seed no banco; carteirinhas da tabela do
[README](../README.md#dados-fictícios-de-teste-somente-desenvolvimento) já respondem após o
`APP_ENV` permitir mocks.

## 2. Variáveis do frontend (Vercel)

| Variável              | Obrigatória | Notas                                              |
| --------------------- | ----------- | -------------------------------------------------- |
| `VITE_CONVEX_URL`     | Sim         | URL HTTPS do deployment Convex de **demonstração** |
| `VITE_*` com segredos | Não         | Proibido; o bundle do navegador é público          |

`VITE_CONVEX_SITE_URL` não precisa ser configurada (código não a lê).

## 3. Conectar o GitHub à Vercel

1. Em [vercel.com](https://vercel.com), importe o repositório `cleberrandreazza/sindicato`.
2. Framework: Vite (detectado). Build: `pnpm build`. Output: `dist`. Install: `pnpm install`.
3. O arquivo [`vercel.json`](../vercel.json) define rewrite SPA (`/(.*)` → `/index.html`) para o
   TanStack Router (rotas `/pessoas`, `/pagamento`, etc. no refresh).
4. Em **Environment Variables**, defina `VITE_CONVEX_URL` = URL do Convex de demonstração
   (Production e Preview, se ambos usarem o mesmo backend demo).
5. Dispare o deploy. Anote a URL HTTPS gerada.
6. Opcional: ative Deployment Protection / Password Protection se o plano permitir.

Preview deployments da Vercel também precisam de `VITE_CONVEX_URL` (variáveis em Preview).
Evite apontar Preview para o Convex de **produção futura** com dados reais.

## 4. Verificações pós-deploy

1. Abrir a URL HTTPS; `/` carrega sem erro de console crítico.
2. Refresh em `/pessoas` (ou outra rota profunda) não deve 404 (rewrite SPA).
3. Lookup com carteirinha `100001` e CPF `100.000.001-08` (dados fictícios).
4. Percorrer jornada até checkout mock; Pix pendente; cartão com `tok_mock_approved` se for
   demonstrar aprovação imediata.
5. Confirmar que **não** há cobrança real nem envio real de e-mail/WhatsApp.
6. Mobile: validar formulários, CPF, seleção, data, resumo, checkout, QR e comprovante em
   360 / 390 / 430 / 768 / 1024 / 1440 px (DevTools ou aparelhos).

## 5. Atualizar a demonstração

1. Merge/push em `master` (ou branch ligada ao projeto Vercel).
2. Vercel reconstrói o frontend automaticamente.
3. Se o schema/funções Convex mudaram, faça deploy **apenas** no deployment de demonstração
   (confirme o nome antes).
4. Não rode `convex deploy` “no automático” contra produção real.

## 6. Evitar publicação acidental em produção

- Trate “produção” como deployment **sem** `APP_ENV` mock-allowed e **sem** `*_PROVIDER=mock`.
- Nunca copie `VITE_CONVEX_URL` de produção para o ambiente de demo (e vice-versa).
- Nunca coloque `CPF_HASH_SECRET` / `OPERATION_TOKEN_SECRET` em variáveis `VITE_*` ou no Git.
- Não force push; não use `--prod` Convex sem confirmação explícita do alvo.
- Mantenha o `.env.local` de desenvolvimento fora do Git (já ignorado).

## 7. Desenvolvimento local (inalterado)

```bash
pnpm install
cp .env.example .env.local   # se ainda não existir
pnpm dev:convex              # associa/usa o deployment de desenvolvimento
pnpm exec convex env set APP_ENV development   # se deployment novo
# … demais env set do README
pnpm dev
```

O deployment local continua com `APP_ENV=development`. A demonstração hospedada usa
`APP_ENV=demonstration` em **outro** Convex. Os dois não devem compartilhar URL na Vercel
sem decisão consciente.
