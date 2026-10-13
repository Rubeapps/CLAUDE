"""Grelhas de parâmetros em paralelo, com separação in-sample / out-of-sample."""
from __future__ import annotations

import itertools
import multiprocessing as mp

import numpy as np
import pandas as pd

from .data import load, SYMBOLS
from .metrics import summary
from .strategies import backtest

IS_END = pd.Timestamp("2019-01-01")   # in-sample: até 2018 ; out-of-sample: 2019 -> 2022-03


def split_stats(tr: pd.DataFrame) -> dict:
    out = {}
    for name, part in (("is", tr[tr.entry_time < IS_END]), ("oos", tr[tr.entry_time >= IS_END])):
        yrs = 6.1 if name == "is" else 3.17
        s = summary(part, years=yrs)
        for k, v in s.items():
            out[f"{name}_{k}"] = v
    return out


def _job(args):
    strat, tf, symbol, params, cost = args
    df = load(symbol, tf)
    tr, _, _ = backtest(df, symbol, strat, **cost, **params)
    row = dict(strat=strat, tf=tf, symbol=symbol, **params)
    row.update(split_stats(tr))
    return row


def grid(strat: str, tf: str, space: dict, symbols=SYMBOLS, cost=None, procs=4) -> pd.DataFrame:
    cost = cost or {}
    keys = list(space)
    combos = [dict(zip(keys, v)) for v in itertools.product(*space.values())]
    jobs = [(strat, tf, s, p, cost) for p in combos for s in symbols]
    # pré-carrega dados no processo pai para os filhos herdarem (fork)
    for s in symbols:
        load(s, tf)
    with mp.get_context("fork").Pool(procs) as pool:
        rows = pool.map(_job, jobs, chunksize=4)
    return pd.DataFrame(rows)


def aggregate(res: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Soma por combinação de parâmetros (portfólio de símbolos com o mesmo risco)."""
    g = res.groupby(keys)
    out = g.agg(is_total=("is_total", "sum"), oos_total=("oos_total", "sum"),
                is_n=("is_n", "sum"), oos_n=("oos_n", "sum"),
                is_pos=("is_total", lambda x: (x > 0).mean()),
                oos_pos=("oos_total", lambda x: (x > 0).mean()))
    out["is_exp"] = out.is_total / out.is_n.clip(lower=1)
    out["oos_exp"] = out.oos_total / out.oos_n.clip(lower=1)
    return out.reset_index().sort_values("is_total", ascending=False)
