"""Bateria de robustez para a estratégia final. Escreve reports/robustness.md"""
import sys, time, json
import numpy as np, pandas as pd
import multiprocessing as mp
from research.data import load, resample
from research.strategies import backtest
from research.metrics import summary
from research import robustness as rb
from research.evalport import evaluate_p, BASKET
from research.config import MAX_OPEN
evaluate = lambda P, **kw: evaluate_p(P, max_open=MAX_OPEN, **kw)

from research.config import P
OUT = []
def w(s=""): print(s); OUT.append(s)

def _rand(s):
    return s, rb.random_entry_pvalue(load(s, "h1"), s, "trend_breakout", P, n_sims=300, seed=7)

if __name__ == "__main__":
    t0 = time.time()
    w("# Relatório de robustez — Trend Breakout H1\n")
    w(f"Parâmetros: `{json.dumps(P)}` | portfólio {BASKET} | máx. {MAX_OPEN} posições abertas\n")
    # 1) por símbolo
    w("## 1. Resultado por símbolo (2012-11 a 2022-03, custos incluídos)\n")
    w("| Símbolo | Trades | Win% | PF | Exp (R) | Total R | DD máx (R) | t-stat |")
    w("|---|---|---|---|---|---|---|---|")
    for s in BASKET:
        tr, _, _ = backtest(load(s, "h1"), s, "trend_breakout", **P)
        m = summary(tr)
        w(f"| {s} | {m['n']} | {m['win']:.1%} | {m['pf']:.2f} | {m['exp']:+.3f} | {m['total']:+.1f} | {m['maxdd']:.1f} | {m['t']:+.2f} |")
    # 2) entradas aleatórias
    w("\n## 2. Teste contra entradas aleatórias (300 simulações por símbolo, mesma gestão de saída)\n")
    w("| Símbolo | R real | R médio aleatório | Percentil 95 aleatório | p-valor |")
    w("|---|---|---|---|---|")
    with mp.get_context("fork").Pool(4) as pool:
        for s, r in pool.map(_rand, BASKET):
            w(f"| {s} | {r['real']:+.1f} | {r['rand_mean']:+.1f} | {r['rand_p95']:+.1f} | {r['pvalue']:.3f} |")
    # 3) custos
    w("\n## 3. Stress de custos (portfólio, motor multi-símbolo)\n")
    w("| Cenário | R/ano | DD máx (R) | Sharpe |")
    w("|---|---|---|---|")
    for name, cost in [("base", {}), ("spread x2", dict(spread_mult=2.0)), ("slippage 0.5 pip", dict(slip_pips=0.5)),
                       ("comissão x1.5", dict(comm_mult=1.5)), ("tudo pior junto", dict(spread_mult=2.0, slip_pips=0.5, comm_mult=1.5)),
                       ("spread x3 + slip 1 pip", dict(spread_mult=3.0, slip_pips=1.0, comm_mult=1.5))]:
        m, _, _ = evaluate(P, cost=cost)
        w(f"| {name} | {m['R_yr']:.1f} | {m['maxdd']:.1f} | {m['sharpe']:.2f} |")
    # 4) por período
    w("\n## 4. In-sample vs out-of-sample (portfólio)\n")
    w("| Período | R/ano | DD máx (R) | Sharpe | pior dia (R) |")
    w("|---|---|---|---|---|")
    for name, a, b in [("2012-2018 (otimização)", None, "2019-01-01"), ("2019-2022 (nunca visto)", "2019-01-01", None), ("Tudo", None, None)]:
        m, _, _ = evaluate(P, start=a, end=b)
        w(f"| {name} | {m['R_yr']:.1f} | {m['maxdd']:.1f} | {m['sharpe']:.2f} | {m['worst_day']:.1f} |")
    m, d, trades = evaluate(P)
    yr = trades.groupby(trades.exit_time.dt.year).r.sum()
    w("\nR por ano: " + ", ".join(f"{y}: {v:+.0f}" for y, v in yr.items()))
    # 5) barras desfasadas (H1 construído a partir de M15 com offset de 15/30/45 min)
    w("\n## 5. Sensibilidade ao alinhamento das barras (H1 reconstruído de M15 com desfasamento)\n")
    w("| Offset | Total R (5 símbolos) | PF médio |")
    w("|---|---|---|")
    for off in ["0min", "15min", "30min", "45min"]:
        tot, pfs = 0, []
        for s in BASKET:
            m15 = load(s, "m15")
            g = m15.set_index("time").resample("1h", offset=off, label="left", closed="left").agg(
                {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna().reset_index()
            tr, _, _ = backtest(g, s, "trend_breakout", **P)
            sm = summary(tr); tot += sm["total"]; pfs.append(sm["pf"])
        w(f"| {off} | {tot:+.1f} | {np.mean(pfs):.2f} |")
    # 6) walk-forward com re-otimização
    w("\n## 6. Walk-forward (treino 3 anos -> teste 6 meses, re-otimiza a cada 6 meses)\n")
    space = dict(n_break=[35, 55, 80], ema_len=[100, 200], sl_atr=[1.5, 2.0, 3.0], trail_atr=[3.0, 5.0, 8.0])
    fixed = dict(h_from=8, h_to=22, friday_flat=True)
    w("| Símbolo | Trades teste | R teste | PF teste | janelas positivas |")
    w("|---|---|---|---|---|")
    wf_all = []
    for s in BASKET:
        tr, ch = rb.walk_forward(s, "h1", "trend_breakout", space, fixed)
        sm = summary(tr) if len(tr) else dict(n=0, total=0, pf=0)
        wf_all.append(tr)
        w(f"| {s} | {sm['n']} | {sm['total']:+.1f} | {sm['pf']:.2f} | {(ch.test_total > 0).sum()}/{len(ch)} |")
    wf = pd.concat(wf_all)
    w(f"\nTotal walk-forward (só períodos nunca vistos pela otimização): {wf.r.sum():+.1f} R em {len(wf)} trades, PF {summary(wf)['pf']:.2f}")
    # 7) Monte Carlo: block bootstrap dos dias reais (blocos de 20 dias preservam sequências de perdas)
    w("\n## 7. Monte Carlo — block bootstrap de dias (10 000 anos sintéticos, blocos de 20 dias)\n")
    dret = d.eq_close.diff().fillna(0).to_numpy()
    dlow = (np.minimum(d.eq_min, d.eq_close) - d.eq_close.shift(1).fillna(0)).to_numpy()
    rng = np.random.default_rng(1)
    nb, B = 13, 20   # 13 blocos x 20 dias ~ 1 ano
    starts = rng.integers(0, len(dret) - B, size=(10000, nb))
    idx = (starts[:, :, None] + np.arange(B)[None, None, :]).reshape(10000, -1)
    paths = np.cumsum(dret[idx], axis=1)
    lows = np.concatenate([np.zeros((10000, 1)), paths[:, :-1]], axis=1) + dlow[idx]
    peak = np.maximum.accumulate(np.maximum(paths, 0), axis=1)
    w("| Risco/trade | Retorno mediano 1 ano | Retorno p5 | Prob. ano negativo | DD p50 | DD p95 | DD p99 | Prob. tocar -10% do início |")
    w("|---|---|---|---|---|---|---|---|")
    for risk in [0.1, 0.2, 0.25, 0.3, 0.4, 0.5]:
        fin = paths[:, -1] * risk
        dd = (peak - lows).max(axis=1) * risk
        hit = (lows.min(axis=1) * risk <= -10).mean()
        w(f"| {risk}% | {np.median(fin):+.1f}% | {np.percentile(fin,5):+.1f}% | {(fin<0).mean():.1%} | {np.median(dd):.1f}% | {np.percentile(dd,95):.1f}% | {np.percentile(dd,99):.1f}% | {hit:.1%} |")
    open("reports/robustness.md", "w").write("\n".join(OUT) + "\n")
    print("done", round(time.time() - t0))
