# Zaynara OS — Arquitetura (Fase 1)

Hub operacional privado: Next.js (App Router) + Supabase + Vercel, 100 % free tier.

## Estrutura de diretórios

```
zaynara-os/
├── app/
│   ├── layout.tsx                    # <html>, fontes, ThemeProvider (dark mode), Toaster
│   ├── globals.css                   # Tailwind + tokens shadcn (light/dark)
│   ├── (auth)/
│   │   └── login/page.tsx            # Magic Link + botão Google
│   ├── auth/
│   │   ├── callback/route.ts         # troca o code OAuth/Magic Link por sessão
│   │   └── signout/route.ts
│   ├── (hub)/                        # tudo aqui exige sessão
│   │   ├── layout.tsx                # Sidebar + header; valida user no servidor (2ª barreira)
│   │   ├── page.tsx                  # redirect → /dashboard
│   │   ├── dashboard/                # Módulo 3
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx           # skeletons enquanto Shopify/Meta respondem
│   │   ├── brain/                    # Módulo 2
│   │   │   ├── page.tsx              # chat
│   │   │   └── documents/page.tsx    # upload de PDFs + estado da indexação
│   │   ├── expenses/                 # Módulo 4
│   │   │   ├── page.tsx
│   │   │   └── actions.ts            # Server Actions (CRUD)
│   │   └── operations/               # Módulo 5
│   │       ├── page.tsx              # Kanban + SOPs (tabs)
│   │       └── actions.ts
│   └── api/
│       ├── chat/route.ts             # streaming RAG → fallback Tavily
│       ├── documents/ingest/route.ts # PDF → chunks → embeddings → pgvector
│       └── cron/
│           └── expenses/route.ts     # diário: roll-forward + alertas Resend
├── components/
│   ├── ui/                           # gerados pelo shadcn (não editar à mão)
│   ├── layout/                       # app-sidebar, theme-provider, theme-toggle, user-menu
│   ├── brain/                        # chat-window, message-bubble, source-citation, upload-dropzone
│   ├── dashboard/                    # kpi-card, profit-revenue-chart, low-stock-table, date-range-picker
│   ├── expenses/                     # expenses-table, expense-form-dialog, due-badge
│   └── operations/                   # kanban-board, kanban-column, task-card, task-dialog, sop-list
├── lib/
│   ├── env.ts                        # validação Zod das env vars (falha cedo no build)
│   ├── utils.ts                      # cn(), formatadores € / datas PT
│   ├── supabase/
│   │   ├── client.ts                 # browser client (@supabase/ssr)
│   │   ├── server.ts                 # server client c/ cookies (RLS ativo)
│   │   ├── admin.ts                  # service-role — só cron/ingestão, "server-only"
│   │   └── proxy.ts                  # refresh de sessão usado pelo proxy.ts
│   ├── ai/
│   │   ├── models.ts                 # ChatGoogleGenerativeAI + GoogleGenerativeAIEmbeddings
│   │   ├── retriever.ts              # chama hybrid_search_documents (RPC)
│   │   ├── web-search.ts             # Tavily
│   │   ├── prompts.ts                # system prompts (regra anti-alucinação fiscal)
│   │   └── rag-chain.ts              # orquestra: pgvector → limiar → fallback → resposta citada
│   ├── ingestion/
│   │   ├── pdf.ts                    # extração de texto + nº de página
│   │   └── splitter.ts               # RecursiveCharacterTextSplitter afinado p/ artigos
│   ├── integrations/
│   │   ├── shopify.ts                # GraphQL Admin: orders, unitCost, inventory, payouts
│   │   └── meta-ads.ts               # Insights API: spend diário
│   ├── finance/
│   │   ├── metrics.ts                # funções PURAS: lucro líquido, ROAS, séries diárias
│   │   └── metrics.test.ts           # testes (lógica determinística = testável)
│   └── email/
│       ├── resend.ts
│       └── templates/expense-alert.tsx
├── types/
│   └── database.types.ts             # `supabase gen types typescript`
├── supabase/
│   └── migrations/0001_init.sql      # Passo 1
├── proxy.ts                          # (Next 16; "middleware.ts" no Next 15) → redirect /login sem sessão
├── vercel.json                       # cron: /api/cron/expenses diário
├── components.json                   # config shadcn
└── .env.example
```

## Decisões principais

- **Defesa em profundidade na autenticação:** `proxy.ts` redireciona para `/login`;
  o layout `(hub)` volta a validar com `supabase.auth.getUser()`; `ALLOWED_EMAILS`
  bloqueia qualquer conta fora da lista; RLS garante isolamento mesmo que tudo o resto falhe.
  Desliga *sign-ups* no Supabase Auth.
- **Service role só em dois sítios:** cron e ingestão. Tudo o resto corre com a sessão do
  utilizador e passa pelo RLS.
- **RAG híbrido:** pesquisa semântica + full-text português com RRF. Referências exatas
  ("art. 53.º CIVA") falham muitas vezes só com embeddings. A decisão de fallback usa a
  similaridade semântica bruta vs `RAG_MIN_SIMILARITY`.
- **`effective_date` nas fontes:** a resposta fiscal indica de quando é a lei citada.
- **Finanças sem IA:** `lib/finance/metrics.ts` recebe dados normalizados e devolve números.
  Funções puras com testes.

## Restrições do free tier a ter em conta

| Serviço | Limite relevante | Mitigação |
|---|---|---|
| Vercel Hobby | Cron no máximo 1×/dia; funções com timeout curto | Alertas de despesas são diários; ingestão de PDFs grandes em lotes com `status` em `document_sources` |
| Supabase Free | Pausa após 7 dias sem atividade; 500 MB DB; 1 GB Storage; 50 MB/ficheiro | O cron diário mantém o projeto ativo; embeddings a 768 dims |
| Gemini Free | Limites RPM/RPD; os dados podem ser usados para melhorar os modelos | Batch de embeddings na ingestão; não enviar dados pessoais de clientes |
| Tavily Free | ~1 000 créditos/mês | Só é chamado quando o pgvector não tem evidência |
| Resend Free | 100 emails/dia | Deduplicação via `alert_sent_for_date` |
