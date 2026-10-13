"""Avaliação de portfólio: R/ano, drawdown máx. (equity horária, inclui flutuante) e pior dia."""
import numpy as np, pandas as pd
from research.portfolio import Leg, run_leg, equity_hourly, daily_table

BASKET = ["XAUUSD", "GBPJPY", "AUDJPY", "USDJPY", "EURJPY"]

def evaluate(params, symbols=BASKET, strat="trend_breakout", tf="h1", cost=None, start=None, end=None, weights=None):
    legs = [Leg(s, strat, tf, params, (weights or {}).get(s, 1.0)) for s in symbols]
    out = [run_leg(l, cost) for l in legs]
    trades = pd.concat([o[0] for o in out])
    eq = equity_hourly([o[1] for o in out])
    if start: eq = eq[eq.index >= start]; trades = trades[trades.entry_time >= start]
    if end: eq = eq[eq.index < end]; trades = trades[trades.entry_time < end]
    eq = eq - (eq["closed"].iloc[0] if len(eq) else 0)
    d = daily_table(eq)
    yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    peak = np.maximum.accumulate(np.maximum(eq["eq"].to_numpy(), 0))
    dd = (peak - eq["eq_low"].to_numpy()).max()
    total = eq["eq"].iloc[-1]
    return dict(R_yr=total / yrs, maxdd=dd, ret_dd=total / yrs / dd, worst_day=d["day_low"].min(),
                n=len(trades), sharpe=d.eq_close.diff().mean() / d.eq_close.diff().std() * np.sqrt(252)), d, trades
