# Decisões pendentes — Sindicomerciários

Documento para a diretoria e áreas técnicas do sindicato.  
Para cada pendência: **o que precisamos**, **por quê** e **o que depende disso no sistema**.

Nenhuma regra abaixo foi inventada no software: o comportamento atual é o mais neutro possível
até a instituição decidir.

Referências: [business-rules.md](./business-rules.md), [presentation-readiness.md](./presentation-readiness.md).

---

## 1. Regras de negócio

| Pendência                                               | Por que precisamos                              | O que depende no sistema                                 |
| ------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Critérios finais de isenção (crianças, idosos, etc.)    | Hoje todos pagam R$ 30,00                       | Cálculo do valor na criação da operação e textos da tela |
| Limite máximo de pessoas por operação                   | Evitar abuso ou conflito com a operação da sede | Validação na seleção / criação                           |
| Política oficial de cancelamento                        | Associado e equipe precisam de regra clara      | Fluxos futuros de cancelamento e mensagens               |
| Textos finais ao associado (erros, confirmação, atraso) | Há rascunhos técnicos                           | Mensagens unificadas em tela, e-mail e WhatsApp          |
| SLA da análise de pagamento tardio                      | Operações ficam em `under_review`               | Processo administrativo e expectativa do associado       |

---

## 2. Cadastro de associados

| Pendência                                         | Por que precisamos                                         | O que depende no sistema                                |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Acesso ao **cadastro oficial** (API / integração) | Substituir o mock de desenvolvimento                       | `MemberProvider` real; identificação e lista de pessoas |
| Identificador único oficial de cada pessoa        | Impedir duplicidade entre famílias e sistemas              | Chave de reserva por pessoa/data                        |
| Formato e validação oficiais da carteirinha       | Alinhar entrada do associado ao documento real             | Máscara, validação e mensagens de erro                  |
| Regras de titular inativo / dependente inelegível | Já há comportamento técnico; textos e exceções podem mudar | Seleção e criação da operação                           |
| Fonte da verdade para e-mail e telefone           | Notificações usam o contato do titular                     | Destino do e-mail (e futuro WhatsApp)                   |

---

## 3. Pagamentos

| Pendência                                                       | Por que precisamos                               | O que depende no sistema                               |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Escolha do provedor (ex.: Stripe) e contrato                    | Sem PSP real não há cobrança real                | `PaymentProvider`, tokens de cartão, Pix real          |
| Regras oficiais de **pagamento tardio** (além do fluxo técnico) | Confirmar o que a equipe faz após `under_review` | Análise administrativa, comprovante, comunicação       |
| Aceitar só Pix, só cartão, ou ambos em produção                 | Impacta UX e contratos                           | Opções na tela de pagamento                            |
| Política se o associado pagar duas vezes por engano             | Evitar litígio e reembolsos improvisados         | Análise / processo manual (reembolso não é automático) |
| Ambiente e chaves de produção do PSP                            | Segurança e conformidade                         | Variáveis do deployment; webhook assinado              |

---

## 4. Notificações

| Pendência                                                  | Por que precisamos         | O que depende no sistema                               |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| Provedor e conta de **e-mail** institucionais              | Hoje o envio é mockado     | `NotificationProvider` real; anexo do PDF              |
| Remetente, assunto e corpo oficiais                        | Credibilidade e LGPD       | Templates de e-mail                                    |
| Provedor de **WhatsApp**, templates aprovados e **opt-in** | Canal preparado, sem envio | Adapter WhatsApp; estado deixa de ser `not_configured` |
| Decisão: WhatsApp nesta fase ou depois                     | Escopo e custo             | Priorização do roadmap                                 |
| Quem recebe cópia interna (financeiro / sede)              | Governança                 | Extensão futura de notificações internas               |

---

## 5. Dados institucionais

| Pendência                                           | Por que precisamos                 | O que depende no sistema                |
| --------------------------------------------------- | ---------------------------------- | --------------------------------------- |
| Razão social, CNPJ, endereço, telefone oficiais     | Não inventamos no PDF atual        | Layout definitivo do comprovante        |
| Logotipo e identidade aprovados para o PDF          | Alinhar à marca do sindicato       | Arte do comprovante (sem inventar logo) |
| Prefixo/formato definitivo do número do comprovante | Hoje `SC-AAAA-NNNNNN` é provisório | Numeração e documentação                |
| Textos legais do comprovante (se houver)            | Conformidade                       | Conteúdo do PDF e do e-mail             |

---

## 6. Operação das piscinas

| Pendência                           | Por que precisamos                                                      | O que depende no sistema                  |
| ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Dias de funcionamento               | Evitar datas inviáveis                                                  | Política de data (`usagePolicy`)          |
| Horários de funcionamento           | Orientar o associado (e futuras regras)                                 | Textos e, se necessário, validações       |
| Antecedência mínima e máxima        | Controle operacional da sede                                            | Bloqueio de datas na etapa 3 e no backend |
| Feriados, manutenções e fechamentos | Não liberar datas fechadas                                              | Calendário de bloqueios                   |
| Capacidade / lotação das piscinas   | **Fora** do escopo atual de pagamento; só se o sindicato quiser evoluir | Futuro módulo (não é a 1ª entrega)        |

---

## Como usar este documento na reunião

1. Percorrer as seções e marcar **responsável** e **prazo** por linha.
2. Priorizar o que bloqueia produção: cadastro oficial, PSP, e-mail, dados do comprovante,
   funcionamento das piscinas.
3. Itens de WhatsApp e lotação podem ser adiados conscientemente sem impedir a cobrança online
   da taxa médica, desde que cadastro + pagamento + e-mail estejam resolvidos.

## O que já está decidido (não reabrir sem necessidade)

- Taxa de R$ 30,00 por pessoa (sem isenção até nova regra).
- Prazo de 15 minutos para pagar após criar a operação.
- Pix e cartão como modalidades previstas.
- Pagamento tardio vai para análise; não libera uso automaticamente; não reembolsa sozinho.
- Sem convidados; sem pré-seleção; duplicidade por pessoa/data.
- Escopo da 1ª entrega: **pagamento da taxa médica das piscinas**, não reservas gerais da sede.
