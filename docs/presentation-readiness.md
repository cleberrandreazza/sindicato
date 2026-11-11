# Prontidão para apresentação — Sede Campestre (taxa médica)

Documento executivo para a diretoria do Sindicomerciários.  
**Separação obrigatória:** o que já existe ≠ o que é só demonstrável com simulação ≠ o que depende
do sindicato ou de fornecedores externos.

**Referência técnica:** [homologation-report.md](./homologation-report.md)

---

## Entregue

Funcionalidades **implementadas e cobertas por testes automatizados** na 1ª entrega:

1. **Identificação** do associado (carteirinha + CPF) com prova de sessão de curta duração.
2. **Seleção** de titular e/ou dependentes, validada no backend.
3. **Escolha da data** de utilização (regra provisória: a partir de hoje, fuso de São Paulo).
4. **Resumo e criação** da operação financeira com prazo de **15 minutos**, valor calculado no
   servidor e idempotência (`requestId`).
5. **Checkout** Pix e cartão via **PaymentProvider mockado** (não processa dinheiro real).
6. **Confirmação autorizada** só pelo backend (eventos do provedor / simulação interna de
   desenvolvimento).
7. **Comprovante PDF** após pagamento confirmado no prazo (File Storage + número `SC-AAAA-NNNNNN`).
8. **Outbox de e-mail** com adaptador **mockado** (registra tentativa; não envia e-mail real).
9. **WhatsApp preparado** na arquitetura, com estado `not_configured` (nenhum envio).
10. **Pagamento tardio** preservado: `paid_late` + `under_review`, sem liberação automática e sem
    comprovante definitivo até análise.

A jornada pública cobre as seis etapas em rotas `/` → `/pessoas` → `/data` → `/resumo` →
`/pagamento` → `/comprovante`.

---

## Demonstrável

Pode ser apresentado **hoje** com dados fictícios e ambiente de desenvolvimento:

| Demonstração                              | Como                                                |
| ----------------------------------------- | --------------------------------------------------- |
| Fluxo completo do associado               | App + Convex em `development` com mocks             |
| Pix “pendente” e QR/código demonstrativos | Checkout mock (não pagáveis)                        |
| Cartão aprovado / recusado                | Tokens fictícios `tok_mock_*` (sem dados de cartão) |
| Confirmação e comprovante                 | Após evento autorizado / simulação interna          |
| Pagamento após o prazo                    | Cenário de análise (`under_review`)                 |
| Falha de e-mail sem desfazer pagamento    | Outbox + histórico de notificação                   |

**Deixar explícito na apresentação:** nenhum pagamento real, nenhum e-mail real e nenhum WhatsApp
estão sendo enviados.

---

## Dependente do sindicato

Informações e decisões que a instituição precisa fornecer ou aprovar antes de produção:

### Operação das piscinas

- Dias e horários de funcionamento.
- Antecedência mínima e máxima para a data de utilização.
- Feriados, manutenções e fechamentos.
- Limite de pessoas por operação (se existir).
- Critérios de isenção e faixas etárias.
- Regras oficiais de cancelamento e de pagamento tardio (além do fluxo técnico já implementado).

### Cadastro e identidade

- Acesso ao **cadastro oficial** (API ou integração).
- Identificador único oficial das pessoas.
- Formato e validação oficiais da carteirinha.
- Tratamento de titulares inativos e dependentes inelegíveis (já há comportamento técnico; textos
  finais podem ser ajustados).

### Comprovante e comunicação

- Dados institucionais do PDF (razão social, CNPJ, endereço, logotipo — **não inventados** no
  sistema atual).
- Textos finais de e-mail e da tela (hoje há rascunhos no backend).
- Escolha e contratação do **provedor de e-mail**.
- Escolha do **provedor de WhatsApp**, templates aprovados e política de **consentimento** (opt-in).

### Governança

- Quem analisa operações `under_review` e com qual SLA.
- Ambiente e responsáveis pela configuração de segredos (`APP_ENV`, secrets do Convex).

---

## Dependente de integrações externas

| Integração                  | Situação      | O que falta                                                                                                                         |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Cadastro oficial**        | Mock          | Adaptador real do `MemberProvider`                                                                                                  |
| **Stripe (ou equivalente)** | Mock          | Adaptador `PaymentProvider`, tokenização segura no navegador, webhook HTTP com **assinatura**, mapeamento de eventos, reconciliação |
| **E-mail**                  | Mock + outbox | Provedor, credenciais, anexos reais, monitoramento de falhas                                                                        |
| **WhatsApp**                | Só contrato   | Provedor, templates, consentimento, adapter `sendReceiptWhatsApp`                                                                   |

Enquanto esses itens não estiverem ativos, o sistema permanece em modo de **homologação /
demonstração**.

---

## Próximos passos (priorizados)

1. **Validar a demonstração** com a diretoria usando apenas mocks e dados fictícios (este
   documento + ambiente de desenvolvimento).
2. **Fechar decisões de negócio** da lista “Dependente do sindicato” (especialmente funcionamento,
   isenções e dados do comprovante).
3. **Contratar / credenciar** cadastro oficial, Stripe (ou outro PSP) e serviço de e-mail.
4. **Implementar webhook assinado** e desligar mocks em ambiente não-desenvolvimento
   (`APP_ENV` + providers reais).
5. **Definir WhatsApp** (ou adiar conscientemente) com templates e consentimento.
6. **Homologação visual** das etapas 3–6 em celulares reais (360–430 px) e desktop, com capturas
   atualizadas.
7. **Painel administrativo** para análise de `under_review` (fora da 1ª entrega da jornada pública).

---

## Mensagem-resumo para a diretoria

A 1ª entrega entrega a **jornada completa do associado até o comprovante**, com regras financeiras
separadas (cobrança × financeiro × operacional), proteção contra duplicidade e comprovante PDF
após confirmação válida. O que ainda **não** está pronto para cobrança real é a conexão com
**cadastro oficial, meio de pagamento real e canais reais de notificação** — e as regras
operacionais finais que só o sindicato pode definir.
