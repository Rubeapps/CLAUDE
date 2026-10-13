"""Testes de robustez:
  * Monte Carlo de trades (reamostragem com reposição e permutação da ordem)
  * Stress de custos (spread x2, slippage x3, comissão x1.5)
  * Sensibilidade de parâmetros (vizinhança na grelha)
  * Walk-forward anchored/rolling com re-otimização
  * Teste de "edge" contra sinais aleatórios com a mesma frequência e duração
"""
from __future__ import annotations

import itertools

import numpy as np
import pandas as pd

from .data import load
from .metrics import summary
from .strategies import backtest


def mc_trades(r: np.ndarray, n_sims=10000, risk_pct=1.0, seed=0) -> dict:
    """Reamostragem bootstrap dos trades: distribuição do lucro e do drawdown máximo
    (fração fixa do saldo inicial)."""
    rng = np.random.default_rng(seed)
    n = len(r)
    idx = rng.integers(0, n, size=(n_sims, n))
    paths = np.cumsum(r[idx] * risk_pct, axis=1)
    peak = np.maximum.accumulate(np.concatenate([np.zeros((n_sims, 1)), paths], axis=1), axis=1)[:, 1:]
    dd = (peak - paths).max(axis=1)
    fin = paths[:, -1]
    return dict(ret_p5=float(np.percentile(fin, 5)), ret_p50=float(np.median(fin)),
                prob_loss=float((fin < 0).mean()),
                dd_p50=float(np.median(dd)), dd_p95=float(np.percentile(dd, 95)),
                dd_p99=float(np.percentile(dd, 99)))


def random_entry_pvalue(df, symbol, strat, params, n_sims=200, seed=0, cost=None):
    """Compara o resultado real com sinais aleatórios com o mesmo nº de entradas
    (mesma gestão de saída). p-valor = fração de simulações aleatórias >= real."""
    from . import engine, strategies
    from .data import SPECS
    cost = cost or {}
    rng = np.random.default_rng(seed)
    spec = SPECS[symbol]
    p = strategies.STRATS[strat](df, symbol, **params)
    sp = strategies.spread_array(df, symbol, cost.get("spread_mult", 1.0))
    o, h, l, c = (df[k].to_numpy(np.float64) for k in ("open", "high", "low", "close"))
    args = (p["atr"], p["exit_long"], p["exit_short"], p["flat"], p["entry_ok"], p["trail_mult"],
            p["trail_start_r"], p["be_r"], p["be_lock_r"], p["max_bars"],
            cost.get("slip_pips", 0.1) * spec.pip, spec.comm_frac)
    real = engine.run(o, h, l, c, sp, p["sig"], p["sl_dist"], p["tp_dist"], *args)[5].sum()
    nz = np.flatnonzero(p["sig"] != 0)
    valid = np.flatnonzero(p["entry_ok"] & (p["sl_dist"] > 0))
    outs = []
    for _ in range(n_sims):
        sig = np.zeros_like(p["sig"])
        pick = rng.choice(valid, size=len(nz), replace=False)
        sig[pick] = rng.choice([-1, 1], size=len(nz))
        # o SL/TP dos sinais aleatórios usa a mesma regra (ATR naquele ponto)
        outs.append(engine.run(o, h, l, c, sp, sig, p["sl_dist"], p["tp_dist"], *args)[5].sum())
    outs = np.array(outs)
    return dict(real=float(real), rand_mean=float(outs.mean()), rand_p95=float(np.percentile(outs, 95)),
                pvalue=float((outs >= real).mean()))


def cost_stress(df, symbol, strat, params) -> pd.DataFrame:
    rows = []
    for name, cost in [("base", {}), ("spread x2", dict(spread_mult=2.0)),
                       ("slip 0.5 pip", dict(slip_pips=0.5)), ("comm x1.5", dict(comm_mult=1.5)),
                       ("tudo pior", dict(spread_mult=2.0, slip_pips=0.5, comm_mult=1.5))]:
        tr, _, _ = backtest(df, symbol, strat, **cost, **params)
        s = summary(tr)
        rows.append(dict(scenario=name, n=s["n"], pf=s["pf"], exp=s["exp"], total=s["total"], maxdd=s["maxdd"]))
    return pd.DataFrame(rows)


def neighborhood(df, symbol, strat, params: dict, steps: dict) -> pd.DataFrame:
    """Varia cada parâmetro numérico +-1 passo (todas as combinações) e mede a estabilidade."""
    keys = list(steps)
    vals = [[params[k] - steps[k], params[k], params[k] + steps[k]] for k in keys]
    rows = []
    for combo in itertools.product(*vals):
        p = dict(params)
        for k, v in zip(keys, combo):
            p[k] = type(params[k])(v)
        tr, _, _ = backtest(df, symbol, strat, **p)
        s = summary(tr)
        rows.append({**{k: p[k] for k in keys}, "n": s["n"], "pf": s["pf"], "total": s["total"], "exp": s["exp"]})
    return pd.DataFrame(rows)


def walk_forward(symbol, tf, strat, space: dict, fixed: dict, train_years=3, test_months=6,
                 start="2012-11-01", end="2022-03-05", metric="total", min_trades=20):
    """Walk-forward rolling: otimiza na janela de treino, aplica os melhores parâmetros na
    janela de teste seguinte (nunca vista). Junta só os trades de teste."""
    df = load(symbol, tf)
    keys = list(space)
    combos = [dict(zip(keys, v)) for v in itertools.product(*space.values())]
    # pré-calcula todos os backtests uma vez (trades com datas) e depois só filtra por janela
    cache = []
    for p in combos:
        tr, _, _ = backtest(df, symbol, strat, **fixed, **p)
        cache.append(tr)
    t0 = pd.Timestamp(start)
    out, chosen = [], []
    while True:
        tr_end = t0 + pd.DateOffset(years=train_years)
        te_end = tr_end + pd.DateOffset(months=test_months)
        if tr_end >= pd.Timestamp(end):
            break
        best, best_v = None, -np.inf
        for k, tr in enumerate(cache):
            w = tr[(tr.entry_time >= t0) & (tr.entry_time < tr_end)]
            if len(w) < min_trades:
                continue
            v = w.r.sum() if metric == "total" else w.r.mean() / (w.r.std() + 1e-9) * np.sqrt(len(w))
            if v > best_v:
                best_v, best = v, k
        if best is not None:
            tst = cache[best]
            tst = tst[(tst.entry_time >= tr_end) & (tst.entry_time < te_end)]
            out.append(tst)
            chosen.append(dict(train_start=t0, test_start=tr_end, **combos[best], train_score=best_v,
                               test_total=tst.r.sum(), test_n=len(tst)))
        t0 = t0 + pd.DateOffset(months=test_months)
    trades = pd.concat(out) if out else pd.DataFrame(columns=cache[0].columns)
    return trades, pd.DataFrame(chosen)
