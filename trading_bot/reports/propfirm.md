# Simulação prop firm

Portfólio: XAUUSD, GBPJPY, AUDJPY, USDJPY, EURJPY | máx. 2 posições abertas | parâmetros `{'n_break': 55, 'ema_len': 200, 'sl_atr': 2.0, 'trail_atr': 5.0, 'h_from': 8, 'h_to': 22, 'friday_flat': True, 'friday_hour': 21}`

Cada linha = desafios iniciados a cada 5 dias de negociação de 2012-11 a 2022-03, seguindo a sequência REAL de dias (mantém correlações e sequências de perdas). Perda total 10% estática; perda diária 5%; sem limite de tempo; mín. 4 dias.

## Regra diária tipo FTMO (base = saldo no início do dia)

| Risco/trade | Fase 1 (+10%) passa | falha diária | falha total | dias (mediana) | Fase 2 (+5%) passa | dias (mediana) | Financiada: prob. violar em 12 meses | Lucro médio 12 meses |
|---|---|---|---|---|---|---|---|---|
| 0.1% | 100% | 0% | 0% | 514 | 100% | 257 | 0% | +4.2% |
| 0.2% | 100% | 0% | 0% | 257 | 100% | 114 | 0% | +8.4% |
| 0.25% | 100% | 0% | 0% | 210 | 100% | 89 | 0% | +10.5% |
| 0.3% | 100% | 0% | 0% | 166 | 100% | 68 | 0% | +12.6% |
| 0.4% | 96% | 0% | 4% | 110 | 96% | 45 | 5% | +17.1% |
| 0.5% | 89% | 0% | 11% | 76 | 89% | 30 | 12% | +22.2% |
| 0.75% | 73% | 1% | 27% | 36 | 80% | 16 | 30% | +35.5% |

## Regra diária exigente (base = máx(saldo, equity) no início do dia — conta lucro flutuante)

| Risco/trade | Fase 1 (+10%) passa | falha diária | falha total | dias (mediana) | Fase 2 (+5%) passa | dias (mediana) | Financiada: prob. violar em 12 meses | Lucro médio 12 meses |
|---|---|---|---|---|---|---|---|---|
| 0.1% | 100% | 0% | 0% | 514 | 100% | 257 | 0% | +4.2% |
| 0.2% | 100% | 0% | 0% | 257 | 100% | 114 | 0% | +8.4% |
| 0.25% | 100% | 0% | 0% | 210 | 100% | 89 | 0% | +10.5% |
| 0.3% | 100% | 0% | 0% | 166 | 100% | 68 | 0% | +12.6% |
| 0.4% | 88% | 8% | 4% | 106 | 91% | 43 | 16% | +17.3% |
| 0.5% | 67% | 23% | 11% | 70 | 80% | 26 | 53% | +19.5% |
| 0.75% | 41% | 37% | 21% | 27 | 65% | 14 | 100% | +0.0% |

