# Zaynara OS

Hub operacional privado da Zaynara: Next.js 16 + Supabase + Vercel, 100 % free tier.
Arquitetura e decisões em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

| Módulo | Estado |
|---|---|
| 1. Segurança e acesso (Magic Link, Google, lista branca) | ✅ |
| 3. Dashboard financeiro (Shopify + Meta Ads + tabela do fornecedor) | ✅ |
| 4. Despesas e subscrições + alertas Resend | Fase 4 |
| 5. Operações: Kanban + SOPs | Fase 4 |
| 2. O Cérebro (RAG fiscal) | Fase 5 |

## Setup

1. **Supabase** (projeto grátis)
   1. SQL Editor → corre por ordem `supabase/migrations/0001_init.sql`, `0002_supplier_costs.sql`, `0003_business_settings.sql`.
   2. Authentication → Sign In / Providers → desliga **Allow new users to sign up**.
   3. Authentication → Users → **Add user** com o teu email (é a única conta).
   4. Authentication → URL Configuration → Site URL = o teu domínio Vercel; Redirect URLs = `https://<domínio>/auth/callback` e `http://localhost:3000/auth/callback`.
   5. (Opcional) Google: Providers → Google, com Client ID/Secret do Google Cloud.
   6. Faz login uma vez e depois corre `supabase/seed/supplier_rates.sql` (tabela de custos + definições).
2. **Shopify**: cria uma app no Dev Dashboard com os scopes `read_orders`, `read_products` e `read_inventory`, e instala-a na loja.
3. **Meta**: Business Settings → System Users → gera um token com `ads_read` para a conta de anúncios.
4. Copia `.env.example` para `.env.local` e preenche.
5. `npm install && npm run dev`

Na Vercel: importa a pasta `zaynara-os` como *Root Directory* e copia as variáveis do `.env.local`.

## Scripts

```bash
npm run dev        # desenvolvimento
npm test           # testes da lógica financeira (node:test)
npm run lint
npm run typecheck  # corre `npx next typegen` primeiro num clone novo
npm run build
```

## Como o lucro é calculado

```
Receita líquida = total atual das encomendas (após devoluções) − IVA cobrado
COGS + Portes   = tabela do fornecedor (país × quantidade, preço em vigor na data)
Taxas           = taxas reais da Shopify Payments (+ IVA sobre as taxas, se isento)
Anúncios        = gasto do Meta (+ IVA 23 % não dedutível, se isento)
Lucro líquido   = Receita líquida − COGS − Portes − Taxas − Anúncios
ROAS            = Receita bruta ÷ gasto do Meta
```

Encomendas canceladas e de teste ficam de fora. Encomendas para países sem tarifa
(ex: Portugal, Países Baixos) aparecem em "Qualidade dos dados" e não entram no COGS.

> ⚠️ **Aviso fiscal.** As regras de IVA aqui implementadas (isenção do art. 53.º
> do CIVA, IVA de 23 % não dedutível sobre anúncios e taxas de serviços
> estrangeiros) são uma leitura geral e **não substituem um contabilista
> certificado**. Confirma o teu enquadramento antes de tomar decisões com base
> nestes números.
