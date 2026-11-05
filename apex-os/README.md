# Apex Operations OS

Monólito Next.js 15 (App Router, TypeScript estrito) + Supabase com três motores:

| Módulo | O que faz |
| --- | --- |
| **Dropshipping P&L** | Webhook Shopify assinado (HMAC) → lucro por encomenda (COGS + portes por SKU + taxa da gateway), P&L diário com ad spend, ROAS e Break-Even ROAS. |
| **Shopify Spy Engine** | Lê `/products.json?limit=250` das lojas concorrentes (cron GitHub Actions), deteta produtos novos, mudanças de preço e ruturas de stock, alerta no Telegram. |
| **Trading Terminal & Journal** | Velas 1m em tempo real (Binance WebSocket público), calculadora de posição por risco, diário com P&L, múltiplo R, Profit Factor e curva de capital. |

Tudo corre em camadas gratuitas: Vercel/qualquer host Node, Supabase Free, GitHub Actions, Telegram Bot API e Binance market data (sem chaves).

## Arranque

1. **Supabase**: cria um projeto, abre *SQL Editor* e executa `supabase/schema.sql` , depois `supabase/migrations/002_control_features.sql` e `supabase/migrations/003_rls_performance.sql`.
   Em *Authentication → URL Configuration* adiciona `<SITE_URL>/auth/callback` aos redirect URLs.
2. **Variáveis**: `cp .env.example .env.local` e preenche.
3. **Correr**:
   ```bash
   npm install
   npm run dev
   ```
4. **Verificações**: `npm run typecheck` · `npm test` (testes das fórmulas) · `npm run build`.

## Shopify (encomendas)

1. Em `/dropship` → *Ligação Shopify*, liga o domínio `loja.myshopify.com`.
2. No Shopify: *Settings → Notifications → Webhooks*, cria webhooks JSON para *Order creation*, *Order update* e *Order cancellation* apontados a `<SITE_URL>/api/webhooks/shopify`.
3. Copia a chave de assinatura para `SHOPIFY_WEBHOOK_SECRET`.
4. Regista os custos por SKU em `/dropship` (o webhook cruza `line_items[].sku`).

Taxas por gateway em `lib/calculations/unit-economics.ts` (`GATEWAY_FEE_RULES`; por omissão 1.5% + 0.25). Encomendas `refunded`/`voided` ficam fora do P&L.

## Spy Engine (cron)

O workflow está em `.github/workflows/spy-cron.yml` **na raiz do repositório** (o GitHub só lê workflows daí). Corre a cada 30 min e chama `POST /api/cron/spy-runner` com `Authorization: Bearer $CRON_SECRET`.
Secrets do repositório: `APEX_BASE_URL` e `CRON_SECRET`.

- O primeiro scan de cada loja grava o catálogo base e envia só uma mensagem (evita centenas de alertas).
- Máx. 10 alertas por loja e execução; o resto vai num resumo.
- Botão *Scan* na UI corre o mesmo motor com a sessão do utilizador (RLS).

Teste manual:
```bash
curl -X POST "$APEX_BASE_URL/api/cron/spy-runner?summary=true" -H "Authorization: Bearer $CRON_SECRET"
```

## Segurança e isolamento

- RLS ativo em todas as tabelas; páginas e Server Actions usam o cliente anon + sessão e filtram também por `user_id`.
- Webhook e cron (sem sessão) usam a service role, sempre com filtro explícito por `user_id`/`target_id`.
- HMAC e Bearer comparados em tempo constante (`timingSafeEqual`).

## Funcionalidades de controlo (migração 002)

| Funcionalidade | Onde | Regra |
| --- | --- | --- |
| **War Chest** | `/dashboard` | Lucro líquido dividido em reinvestir / reserva+impostos / injeção no trading (`calculateWarChestAllocation`, % somam 100). |
| **Ad Fatigue Radar** | `/dropship` | CSV do Meta Ads lido no browser. Hook rate = 3s plays / impressões; Hold rate = ThruPlays / 3s plays; fadiga = frequência ≥ 2.2 ou (CPA > break-even CPA e CTR < 1%). Guardado em `dropship_ad_creatives`. |
| **Meta Ad Library** | `/spy` | `meta_page_id` por loja → link direto para os anúncios ativos da página. |
| **Sinal de escala** | cron Spy | `is_scaling` = tag best-seller OU mudança de stock (variantes disponíveis) nas últimas 72h. Alerta `[SPY]`. |
| **Anti-FOMO + Circuit Breaker** | `/trading` | 4 confirmações + estado mental antes de executar; cooldown de 30 min após perda; bloqueio total quando a perda da sessão (00:00 UTC) ≥ `max_daily_loss_percent`, com contagem decrescente. Tudo revalidado no servidor em `logTrade`. Alerta `[CIRCUIT BREAKER]` ao disparar. |

Fórmulas puras em `lib/calculations/engine.ts`. Alertas via `sendTelegramAlert(mensagem, "INFO" | "DROPSHIP" | "SPY" | "CIRCUIT BREAKER")`.

## Notas de implementação

- `crypto` vem do módulo nativo `node:crypto`; o pacote npm `crypto` é um stub obsoleto e não é instalado.
- `app/page.tsx` e `app/(dashboard)/page.tsx` resolveriam ambos para `/` (erro no Next.js), por isso o dashboard unificado vive em `app/(dashboard)/dashboard/page.tsx` (`/dashboard`) e `/` é a landing.
- A migração 002 acrescenta `available_variants` e `scaling_detected_at` a `spy_tracked_products` (necessários para detetar movimento de stock e manter o sinal de escala 72h), `WITH CHECK` nas políticas novas e um índice único em `dropship_ad_creatives` para reimportar CSVs sem duplicar.
- Tabela extra `dropship_stores` liga o domínio myshopify ao utilizador, para o webhook saber a que conta pertence cada encomenda.
