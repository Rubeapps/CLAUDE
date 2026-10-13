"""Métricas de desempenho em unidades de R e em % de conta."""
from __future__ import annotations

import numpy as np
import pandas as pd


def summary(trades: pd.DataFrame, years: float | None = None) -> dict:
    r = trades["r"].to_numpy()
    n = len(r)
    if n == 0:
        return dict(n=0, win=0, pf=0, exp=0, total=0, maxdd=0, t=0, per_year=0, ret_dd=0)
    wins = r[r > 0].sum()
    loss = -r[r < 0].sum()
    eq = np.cumsum(r)
    dd = np.max(np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq)
    if years is None:
        span = (trades["exit_time"].max() - trades["entry_time"].min()).days / 365.25
        years = max(span, 1e-9)
    sd = r.std(ddof=1) if n > 1 else 0
    return dict(
        n=n,
        win=float((r > 0).mean()),
        pf=float(wins / loss) if loss > 0 else float("inf"),
        exp=float(r.mean()),
        total=float(r.sum()),
        maxdd=float(dd),
        t=float(r.mean() / sd * np.sqrt(n)) if sd > 0 else 0.0,
        per_year=float(r.sum() / years),
        ret_dd=float(r.sum() / years / dd) if dd > 0 else float("inf"),
        trades_year=float(n / years),
    )


def fmt(s: dict) -> str:
    return (f"n={s['n']:5d} win={s['win']:.1%} PF={s['pf']:.2f} expR={s['exp']:+.3f} "
            f"totR={s['total']:+7.1f} ddR={s['maxdd']:5.1f} t={s['t']:+.2f} R/yr={s['per_year']:+.1f}")
