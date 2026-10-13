"""R por ano e por símbolo para um conjunto fixo de parâmetros + seleção de símbolos walk-forward."""
import sys, json
import numpy as np, pandas as pd
from research.data import load, SYMBOLS
from research.strategies import backtest
pd.set_option("display.width", 250)

def yearly(strat, tf, params, symbols=SYMBOLS, cost=None):
    rows = {}
    for s in symbols:
        tr, _, _ = backtest(load(s, tf), s, strat, **(cost or {}), **params)
        rows[s] = tr.groupby(tr.entry_time.dt.year).r.sum()
    return pd.DataFrame(rows).fillna(0).T

def wf_symbol_selection(tab, lookback=3, min_years=2):
    """Em cada ano Y usa só os símbolos cujo R acumulado nos `lookback` anos anteriores foi > 0."""
    out = {}
    years = sorted(tab.columns)
    for i, y in enumerate(years):
        if i < min_years: continue
        past = tab[years[max(0, i - lookback):i]].sum(axis=1)
        sel = past[past > 0].index
        out[y] = (tab.loc[sel, y].sum(), len(sel), ",".join(sel))
    return pd.DataFrame(out, index=["R", "n_sym", "symbols"]).T

if __name__ == "__main__":
    strat, tf, params = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    t = yearly(strat, tf, params)
    t["TOTAL"] = t.sum(axis=1)
    print(t.round(1).to_string())
    print(wf_symbol_selection(t.drop(columns="TOTAL")).to_string())
