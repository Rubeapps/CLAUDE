# Apex Operations OS

Monólito Next.js 15 (App Router, TypeScript estrito) + Supabase com três motores:

| Módulo | O que faz |
| --- | --- |
| **Dropshipping P&L** | Webhook Shopify assinado (HMAC) → lucro por encomenda (COGS + portes por SKU + taxa da gateway), P&L diário com ad spend, ROAS e Break-Even ROAS. |
| **Shopify Spy Engine** | Lê `/products.json?limit=250` das lojas concorrentes (cron GitHub Actions), deteta produtos novos, mudanças de preço e ruturas de stock, alerta no Telegram. |
| **Trading Terminal & Journal** | Velas 1m em tempo real (Binance WebSocket público), calculadora de posição por risco, diário com P&L, múltiplo R, Profit Factor e curva de capital. |

Tudo corre em camadas gratuitas: Vercel/qualquer host Node, Supabase Free, GitHub Actions, Telegram Bot API e Binance market data (sem chaves).

## Arranque

1. **Supabase**: cria um projeto, abre *SQL Editor* e executa `supabase/schema.sql` , depois `supabase/migrations/002_control_features.sql` , `supabase/migrations/003_rls_performance.sql` `supabase/migrations/004_shipping_tiers.sql` `supabase/migrations/005_spy_ad_creatives.sql` `supabase/migrations/006_trading_bots_treasury.sql` `supabase/migrations/007_trading_precision.sql`, `008_shipping_by_country.sql` e `009_product_ideas.sql`.
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
4. Regista os custos em `/dropship` → *Custos por produto*: COGS por unidade e portes totais para 1, 2 e 3 unidades do mesmo produto (as variantes contam juntas; acima de 3 soma-se o incremento 3−2). O webhook cruza `line_items[].sku`.

**Portes por país:** cada produto tem portes padrão (1/2/3 un.) e, opcionalmente, portes próprios por país de entrega (lista de países editável em *Custos por produto*). O webhook usa o `shipping_address.country_code` da encomenda; país sem valor próprio usa o padrão.

**Calculadora de produto:** em `/dropship`, para qualquer produto (mesmo fora da loja) calcula lucro, CPA máximo, break-even ROAS, preço recomendado para a margem desejada e custo máximo ao fornecedor, por país e por 1/2/3 unidades. Os produtos ficam guardados.

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

## Meta Ad Intelligence (`/spy/ads`, migração 005)

- Introduz um **Meta Page ID** (ou link da Ad Library com `view_all_page_id`) ou escolhe uma loja do Spy com Page ID e carrega em *Sincronizar anúncios* (`POST /api/spy/ads/sync`).
- Usa a Graph API `/ads_archive` (anúncios **ativos** entregues na UE). Anúncios com o mesmo texto/título/domínio são agrupados num criativo e contados em `active_copies_count`.
- **Winner Score** (0–100) = min(50, dias ativos × 2.5) + min(50, cópias × 5). Em escala: ≥ 5 cópias ou ≥ 14 dias com ≥ 3 cópias. Tiers: Novo, Em teste, Estável, Winner provável, Winner escala.
- O cron do Spy também sincroniza as lojas ativas com Meta Page ID.
- **Sem token (grátis):** botão "Enviar para o Apex" (bookmarklet). Na Ad Library da marca, o botão lê os anúncios visíveis no browser do utilizador (texto, data de início, nº de cópias, links de vídeo/imagem), copia-os para o clipboard e o utilizador cola em `/spy/ads` → *Importar*. A interpretação é feita no servidor (`lib/spy/ad-library-parser.ts`, EN/PT/ES), por isso se a Meta mudar o layout só é preciso ajustar o parser. Só guarda texto e links (sem ficheiros); criativos inativos há mais de 60 dias são apagados em cada importação.
- Sincronização automática (opcional): requer `META_ACCESS_TOKEN` (app Meta com identidade verificada, gratuito). **A API não devolve o ficheiro do vídeo/imagem, o CTA nem o URL de destino completo**: o cartão mostra o link para o anúncio na Meta Library e permite colar o link do MP4 para o leitor e o download.

## Trading Bots (`/trading/bots`, migração 006)

- Sinais via webhook (ex.: TradingView) para `POST /api/trading/bot/webhook` com `{ action: "BUY"|"SELL", symbol, entryPrice, stopLoss, takeProfit }` e o segredo no header `X-Bot-Secret` **ou** no campo `"secret"` do JSON (o TradingView não envia headers personalizados).
- **BUY**: valida bot ativo, símbolo, circuit breaker diário e risco restante; dimensiona a posição pelo risco do bot; respeita LOT_SIZE / notional mínimo; compra a mercado e coloca de imediato uma **OCO** (take profit + stop loss) na Binance; regista no diário e no Telegram.
- **SELL**: cancela as ordens abertas, vende a posição do bot a mercado e fecha o trade no diário (P&L, múltiplo R, saldo). Spot não permite short.
- Bots nascem em **testnet** e desativados; passar a real exige confirmação escrita. Chaves API encriptadas com AES-256-GCM (`BOT_ENCRYPTION_KEY`) e nunca enviadas ao browser. Só a estratégia `WEBHOOK_SIGNAL` está implementada.

## Executive Playbook (`/knowledge`) e simulador

- **Academia** (separador inicial): 14 áreas do negócio (empresa, contabilidade, pessoas, marketing, oferta/conversão, operações, produto/marca, clientes, dados, fiscal/legal, tesouraria, negociação, fundador, trading), cada uma em 3 níveis — Amador/Iniciante, Pro e GOAT — com princípios dos melhores operadores, ações da semana, métricas, ligação ao Apex e fontes. Progresso "dominado" guardado por utilizador. Conteúdo em `lib/knowledge/`.

- Modelos de Buffett/Munger, Goldratt, Grove/Rabois e Dalio aplicados aos números reais (Owner Earnings, Throughput).
- P&L em cascata até ao Net Cash Profit, ciclo de conversão de caixa, cofre fiscal (IVA, IRS/IRC, rolling reserve) e checklist de conformidade guardado por utilizador.
- Simulador what-if em `/dropship` (CPA, portes, devoluções, ticket médio → lucro mensal, BE ROAS, margem de segurança).

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

- As funções correm em **Paris (`cdg1`, `vercel.json`)**: a Binance bloqueia pedidos vindos dos EUA, e o Supabase do projeto está em eu-west-3.

- `crypto` vem do módulo nativo `node:crypto`; o pacote npm `crypto` é um stub obsoleto e não é instalado.
- `app/page.tsx` e `app/(dashboard)/page.tsx` resolveriam ambos para `/` (erro no Next.js), por isso o dashboard unificado vive em `app/(dashboard)/dashboard/page.tsx` (`/dashboard`) e `/` é a landing.
- A migração 002 acrescenta `available_variants` e `scaling_detected_at` a `spy_tracked_products` (necessários para detetar movimento de stock e manter o sinal de escala 72h), `WITH CHECK` nas políticas novas e um índice único em `dropship_ad_creatives` para reimportar CSVs sem duplicar.
- Tabela extra `dropship_stores` liga o domínio myshopify ao utilizador, para o webhook saber a que conta pertence cada encomenda.
