"""Curva de capital de um portfólio (vários símbolos/estratégias) e simulação de regras de
prop firm (FTMO e afins): perda diária máxima, perda total máxima, objetivo de lucro.

Tudo é calculado em R e convertido para % com o risco por trade (fração FIXA do saldo
inicial, como recomendado em contas financiadas: o risco não cresce com o lucro nem
encolhe com a perda, o que torna os limites de drawdown previsíveis).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .data import load
from .strategies import backtest


@dataclass
class Leg:
    symbol: str
    strat: str
    tf: str
    params: dict
    weight: float = 1.0       # multiplicador de risco desta perna


def run_leg(leg: Leg, cost: dict | None = None):
    df = load(leg.symbol, leg.tf)
    tr, fc, fw = backtest(df, leg.symbol, leg.strat, **(cost or {}), **leg.params)
    t = df["time"].to_numpy()
    realized = np.zeros(len(df))
    idx = np.searchsorted(t, tr["exit_time"].to_numpy())
    np.add.at(realized, idx, tr["r"].to_numpy())
    s = pd.DataFrame({"realized": realized * leg.weight, "fc": fc * leg.weight,
                      "fw": fw * leg.weight}, index=pd.DatetimeIndex(t))
    tr = tr.assign(r_w=tr["r"] * leg.weight, leg=f"{leg.symbol}:{leg.strat}:{leg.tf}")
    return tr, s


def equity_hourly(series: list[pd.DataFrame]) -> pd.DataFrame:
    """Junta as pernas numa grelha horária comum. Barras H4/D1 são distribuídas na hora em
    que acontecem (o realizado conta na barra de saída; o flutuante é mantido)."""
    idx = series[0].index
    for s in series[1:]:
        idx = idx.union(s.index)
    real = np.zeros(len(idx)); fc = np.zeros(len(idx)); fw = np.zeros(len(idx))
    for s in series:
        s2 = s.reindex(idx)
        real += s2["realized"].fillna(0).to_numpy()
        # flutuante: forward-fill dentro de barras de timeframe maior
        fc += s2["fc"].ffill().fillna(0).to_numpy()
        fw += s2["fw"].ffill().fillna(0).to_numpy()
    cum = np.cumsum(real)
    prev = np.concatenate([[0.0], cum[:-1]])
    return pd.DataFrame({"closed": cum, "eq": cum + fc, "eq_low": prev + fw}, index=idx)


def daily_table(eq: pd.DataFrame) -> pd.DataFrame:
    d = eq.index.normalize()
    g = eq.groupby(d)
    out = pd.DataFrame({"eq_close": g["eq"].last(), "eq_min": g["eq_low"].min(),
                        "closed": g["closed"].last()})
    out["start"] = out["eq_close"].shift(1).fillna(0.0)
    # FTMO: base do limite diário = max(saldo, equity) no início do dia; aqui saldo≈equity
    out["start_bal"] = out["closed"].shift(1).fillna(0.0)
    out["day_base"] = np.maximum(out["start"], out["start_bal"])
    out["day_low"] = np.minimum(out["eq_min"], out["eq_close"]) - out["day_base"]
    return out


@dataclass
class PropRules:
    target: float = 10.0        # % de lucro para passar (fase 1 FTMO = 10, fase 2 = 5)
    daily_loss: float = 5.0     # % do saldo inicial
    max_loss: float = 10.0      # % do saldo inicial (estático)
    max_days: int = 0           # 0 = sem limite (FTMO atual); 30 = regra antiga
    min_days: int = 4


def simulate_challenges(daily: pd.DataFrame, risk_pct: float, rules: PropRules,
                        start_step: int = 5) -> pd.DataFrame:
    """Começa um desafio em cada `start_step` dias da história e segue-o até passar ou
    falhar. Usa a sequência REAL de dias (mantém correlações e clusters de perdas)."""
    eqc = daily["eq_close"].to_numpy() * risk_pct
    eqm = np.minimum(daily["eq_min"].to_numpy(), daily["eq_close"].to_numpy()) * risk_pct
    base = daily["day_base"].to_numpy() * risk_pct
    n = len(eqc)
    rows = []
    for s in range(1, n - 1, start_step):
        e0 = eqc[s - 1]
        result, days = "open", 0
        for k in range(s, n):
            days += 1
            low = eqm[k] - e0
            daily_dd = eqm[k] - max(base[k], e0 if k == s else base[k])
            if low <= -rules.max_loss:
                result = "fail_max"; break
            if daily_dd <= -rules.daily_loss:
                result = "fail_daily"; break
            if eqc[k] - e0 >= rules.target and days >= rules.min_days:
                result = "pass"; break
            if rules.max_days and days >= rules.max_days:
                result = "timeout"; break
        rows.append((daily.index[s], result, days))
    return pd.DataFrame(rows, columns=["start", "result", "days"])


def funded_stats(daily: pd.DataFrame, risk_pct: float, rules: PropRules, horizon_days=252,
                 start_step=5) -> dict:
    """Conta financiada: probabilidade de violar a regra em `horizon_days` e lucro médio."""
    r = PropRules(target=1e9, daily_loss=rules.daily_loss, max_loss=rules.max_loss,
                  max_days=horizon_days, min_days=0)
    sim = simulate_challenges(daily, risk_pct, r, start_step)
    sim = sim[sim.start <= daily.index[-1] - pd.Timedelta(days=int(horizon_days * 1.45))]
    breach = sim.result.str.startswith("fail").mean()
    eqc = daily["eq_close"].to_numpy() * risk_pct
    rets = []
    for st in sim.start[sim.result == "timeout"]:
        s = daily.index.get_loc(st)
        rets.append(eqc[min(s + horizon_days, len(eqc) - 1)] - eqc[s - 1])
    return dict(breach_prob=float(breach), mean_ret=float(np.mean(rets)) if rets else 0.0,
                n=len(sim))
