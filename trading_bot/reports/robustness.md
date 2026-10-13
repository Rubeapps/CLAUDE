# Relatório de robustez — Trend Breakout H1

Parâmetros: `{"n_break": 55, "ema_len": 200, "sl_atr": 2.0, "trail_atr": 5.0, "h_from": 8, "h_to": 22, "friday_flat": true, "friday_hour": 21}` | portfólio ['XAUUSD', 'GBPJPY', 'AUDJPY', 'USDJPY', 'EURJPY'] | máx. 2 posições abertas

## 1. Resultado por símbolo (2012-11 a 2022-03, custos incluídos)

| Símbolo | Trades | Win% | PF | Exp (R) | Total R | DD máx (R) | t-stat |
|---|---|---|---|---|---|---|---|
| XAUUSD | 834 | 34.5% | 1.18 | +0.104 | +86.7 | 25.8 | +1.55 |
| GBPJPY | 844 | 36.5% | 1.21 | +0.118 | +99.4 | 22.8 | +1.86 |
| AUDJPY | 754 | 35.4% | 1.31 | +0.174 | +131.6 | 20.7 | +2.41 |
| USDJPY | 832 | 33.7% | 1.17 | +0.100 | +83.6 | 52.9 | +1.54 |
| EURJPY | 808 | 36.0% | 1.25 | +0.141 | +114.0 | 20.4 | +2.18 |

## 2. Teste contra entradas aleatórias (300 simulações por símbolo, mesma gestão de saída)

| Símbolo | R real | R médio aleatório | Percentil 95 aleatório | p-valor |
|---|---|---|---|---|
| XAUUSD | +86.7 | -28.1 | +57.9 | 0.020 |
| GBPJPY | +99.4 | -37.6 | +48.9 | 0.013 |
| AUDJPY | +131.6 | -64.2 | +22.0 | 0.000 |
| USDJPY | +83.6 | -23.4 | +72.5 | 0.043 |
| EURJPY | +114.0 | -32.9 | +55.1 | 0.003 |

## 3. Stress de custos (portfólio, motor multi-símbolo)

| Cenário | R/ano | DD máx (R) | Sharpe |
|---|---|---|---|
| base | 41.2 | 34.3 | 1.16 |
| spread x2 | 36.1 | 38.1 | 1.02 |
| slippage 0.5 pip | 36.0 | 37.9 | 1.02 |
| comissão x1.5 | 38.4 | 36.5 | 1.08 |
| tudo pior junto | 26.9 | 54.4 | 0.76 |
| spread x3 + slip 1 pip | 11.7 | 97.3 | 0.33 |

## 4. In-sample vs out-of-sample (portfólio)

| Período | R/ano | DD máx (R) | Sharpe | pior dia (R) |
|---|---|---|---|---|
| 2012-2018 (otimização) | 33.9 | 34.3 | 0.98 | -16.3 |
| 2019-2022 (nunca visto) | 57.3 | 26.2 | 1.47 | -10.8 |
| Tudo | 41.2 | 34.3 | 1.16 | -16.3 |

R por ano: 2012: +17, 2013: +30, 2014: +76, 2015: +21, 2016: +49, 2017: +16, 2018: +13, 2019: +78, 2020: +79, 2021: +29, 2022: -5

## 5. Sensibilidade ao alinhamento das barras (H1 reconstruído de M15 com desfasamento)

| Offset | Total R (5 símbolos) | PF médio |
|---|---|---|
| 0min | +514.2 | 1.22 |
| 15min | +528.6 | 1.23 |
| 30min | +526.0 | 1.23 |
| 45min | +507.7 | 1.22 |

## 6. Walk-forward (treino 3 anos -> teste 6 meses, re-otimiza a cada 6 meses)

| Símbolo | Trades teste | R teste | PF teste | janelas positivas |
|---|---|---|---|---|
| XAUUSD | 712 | +52.8 | 1.11 | 8/13 |
| GBPJPY | 631 | +93.8 | 1.22 | 9/13 |
| AUDJPY | 553 | +50.8 | 1.14 | 7/13 |
| USDJPY | 684 | +99.6 | 1.20 | 9/13 |
| EURJPY | 644 | +24.6 | 1.06 | 7/13 |

Total walk-forward (só períodos nunca vistos pela otimização): +321.6 R em 3224 trades, PF 1.15

## 7. Monte Carlo — block bootstrap de dias (10 000 anos sintéticos, blocos de 20 dias)

| Risco/trade | Retorno mediano 1 ano | Retorno p5 | Prob. ano negativo | DD p50 | DD p95 | DD p99 | Prob. tocar -10% do início |
|---|---|---|---|---|---|---|---|
| 0.1% | +4.1% | -1.4% | 11.4% | 2.5% | 4.6% | 5.9% | 0.0% |
| 0.2% | +8.2% | -2.7% | 11.4% | 5.0% | 9.3% | 11.9% | 1.0% |
| 0.25% | +10.2% | -3.4% | 11.4% | 6.2% | 11.6% | 14.9% | 2.9% |
| 0.3% | +12.3% | -4.1% | 11.4% | 7.5% | 13.9% | 17.8% | 5.7% |
| 0.4% | +16.4% | -5.4% | 11.4% | 10.0% | 18.6% | 23.8% | 12.4% |
| 0.5% | +20.5% | -6.8% | 11.4% | 12.5% | 23.2% | 29.7% | 19.9% |
