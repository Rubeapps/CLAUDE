"""Estratégias candidatas. Cada uma devolve os arrays que o motor (engine.run) consome.

Todas usam apenas informação disponível no FECHO da barra do sinal.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import engine
from . import indicators as ind
from .data import SPECS


def spread_array(df: pd.DataFrame, symbol: str, mult: float = 1.0) -> np.ndarray:
    """Spread em preço por barra. Na hora do rollover (23h-01h servidor) o spread alarga."""
    sp = SPECS[symbol]
    hour = df["time"].dt.hour.to_numpy()
    m = np.ones(len(df))
    m[(hour == 23) | (hour == 0)] = 4.0
    m[hour == 1] = 2.0
    return sp.spread_pips * sp.pip * m * mult


def _base(df):
    o, h, l, c = (df[k].to_numpy(np.float64) for k in ("open", "high", "low", "close"))
    n = len(df)
    t = df["time"]
    return o, h, l, c, n, t.dt.hour.to_numpy(), t.dt.dayofweek.to_numpy()


def _friday_flat(df, hour_cut=22):
    t = df["time"]
    return ((t.dt.dayofweek == 4) & (t.dt.hour >= hour_cut)).to_numpy()


def _pack(sig, sl, tp, atr, exl, exs, flat, ok, trail=0.0, trail_start=0.0,
          be=0.0, be_lock=0.0, max_bars=0, trail2=0.0, trail2_start=0.0):
    return dict(sig=sig.astype(np.int64), sl_dist=np.nan_to_num(sl), tp_dist=np.nan_to_num(tp),
                atr=np.nan_to_num(atr), exit_long=exl, exit_short=exs, flat=flat, entry_ok=ok,
                trail_mult=float(trail), trail_start_r=float(trail_start), be_r=float(be),
                be_lock_r=float(be_lock), max_bars=int(max_bars), trail2_mult=float(trail2),
                trail2_start_r=float(trail2_start))


# ---------------------------------------------------------------------------------
# 1) Breakout de tendência (Donchian) com filtro EMA e trailing chandelier
# ---------------------------------------------------------------------------------
def trend_breakout(df, symbol, n_break=55, ema_len=200, atr_len=20, sl_atr=2.0,
                   trail_atr=3.0, tp_r=0.0, n_exit=0, max_bars=0, friday_flat=False,
                   h_from=0, h_to=24, be_r=0.0, trail_start=0.0, side=0, adx_min=0.0,
                   trail2_atr=0.0, trail2_start=0.0, friday_hour=22):
    """side: 0 = compra e venda, 1 = só compra, -1 = só venda.
    h_from/h_to: horas (servidor) em que um sinal pode ser aceite."""
    o, h, l, c, n, hour, dow = _base(df)
    a = ind.atr(h, l, c, atr_len)
    e = ind.ema(c, ema_len) if ema_len > 0 else np.full(n, np.nan)
    hh = ind.highest(h, n_break)
    ll = ind.lowest(l, n_break)
    hours_ok = (hour >= h_from) & (hour < h_to)
    up = (c > e) if ema_len > 0 else np.ones(n, np.bool_)
    dn = (c < e) if ema_len > 0 else np.ones(n, np.bool_)
    if adx_min > 0:
        ax = ind.adx(h, l, c, 14)
        up = up & (ax >= adx_min); dn = dn & (ax >= adx_min)
    sig = np.zeros(n, np.int64)
    if side >= 0:
        sig[(c > hh) & up & hours_ok] = 1
    if side <= 0:
        sig[(c < ll) & dn & hours_ok] = -1
    if n_exit > 0:
        xl = c < ind.lowest(l, n_exit)
        xs = c > ind.highest(h, n_exit)
    else:
        xl = np.zeros(n, np.bool_); xs = np.zeros(n, np.bool_)
    flat = _friday_flat(df, friday_hour) if friday_flat else np.zeros(n, np.bool_)
    if friday_flat:   # sem novas entradas na sexta a partir da barra anterior ao fecho
        sig[(dow == 4) & (hour >= friday_hour - 1)] = 0
    ok = ~np.isnan(a) & ~np.isnan(hh)
    if ema_len > 0:
        ok &= ~np.isnan(e)
    return _pack(sig, sl_atr * a, tp_r * sl_atr * a, a, xl, xs, flat, ok,
                 trail=trail_atr, trail_start=trail_start, be=be_r, max_bars=max_bars,
                 trail2=trail2_atr, trail2_start=trail2_start)


# ---------------------------------------------------------------------------------
# 2) Pullback em tendência (RSI curto, estilo Connors) — compra fraqueza em tendência
# ---------------------------------------------------------------------------------
def rsi_pullback(df, symbol, ema_len=200, rsi_len=2, rsi_in=10.0, rsi_out=70.0,
                 atr_len=14, sl_atr=2.0, tp_r=0.0, max_bars=24, long_only=False,
                 friday_flat=True):
    o, h, l, c, n, hour, dow = _base(df)
    a = ind.atr(h, l, c, atr_len)
    e = ind.ema(c, ema_len)
    r = ind.rsi(c, rsi_len)
    sig = np.zeros(n, np.int64)
    sig[(c > e) & (r < rsi_in)] = 1
    if not long_only:
        sig[(c < e) & (r > 100 - rsi_in)] = -1
    xl = r > rsi_out
    xs = r < 100 - rsi_out
    flat = _friday_flat(df) if friday_flat else np.zeros(n, np.bool_)
    ok = ~np.isnan(a) & ~np.isnan(e) & ~np.isnan(r)
    return _pack(sig, sl_atr * a, tp_r * sl_atr * a, a, xl, xs, flat, ok, max_bars=max_bars)


# ---------------------------------------------------------------------------------
# 3) Reversão à média com Bandas de Bollinger em regime lateral (ADX baixo)
# ---------------------------------------------------------------------------------
def bb_reversion(df, symbol, bb_len=20, bb_k=2.0, adx_len=14, adx_max=25.0,
                 atr_len=14, sl_atr=2.0, max_bars=12, h_from=0, h_to=24,
                 friday_flat=True):
    o, h, l, c, n, hour, dow = _base(df)
    a = ind.atr(h, l, c, atr_len)
    m = ind.sma(c, bb_len)
    sd = ind.stdev(c, bb_len)
    up = m + bb_k * sd
    dn = m - bb_k * sd
    ax = ind.adx(h, l, c, adx_len) if adx_max < 100 else np.zeros(n)
    hours_ok = (hour >= h_from) & (hour < h_to) if h_from < h_to else (hour >= h_from) | (hour < h_to)
    sig = np.zeros(n, np.int64)
    calm = ax < adx_max
    sig[(c < dn) & calm & hours_ok] = 1
    sig[(c > up) & calm & hours_ok] = -1
    xl = c >= m
    xs = c <= m
    flat = _friday_flat(df) if friday_flat else np.zeros(n, np.bool_)
    ok = ~np.isnan(a) & ~np.isnan(sd) & ~np.isnan(ax)
    return _pack(sig, sl_atr * a, np.zeros(n), a, xl, xs, flat, ok, max_bars=max_bars)


# ---------------------------------------------------------------------------------
# 4) Breakout de sessão (range asiático -> abertura de Londres), saída no fim do dia
# ---------------------------------------------------------------------------------
def session_breakout(df, symbol, range_from=2, range_to=9, trade_to=18, flat_hour=22,
                     atr_len=24, sl_mode=0, sl_atr=1.0, tp_r=2.0, min_rng_atr=0.0,
                     max_rng_atr=99.0, one_per_day=True):
    """Barras H1 (hora servidor GMT+2/3). Range = máx/mín das barras [range_from, range_to).
    Sinal: fecho acima/abaixo do range entre range_to e trade_to.
    sl_mode 0 = SL no lado oposto do range; 1 = SL = sl_atr*ATR."""
    o, h, l, c, n, hour, dow = _base(df)
    a = ind.atr(h, l, c, atr_len)
    day = df["time"].dt.normalize().to_numpy()
    sig = np.zeros(n, np.int64)
    sl = np.zeros(n)
    rh = -np.inf; rl = np.inf; cur_day = None; traded = False
    for i in range(n):
        if day[i] != cur_day:
            cur_day = day[i]; rh = -np.inf; rl = np.inf; traded = False
        hr = hour[i]
        if range_from <= hr < range_to:
            rh = max(rh, h[i]); rl = min(rl, l[i])
            continue
        if range_to <= hr < trade_to and np.isfinite(rh) and not (one_per_day and traded):
            rng = rh - rl
            if np.isnan(a[i]) or rng < min_rng_atr * a[i] or rng > max_rng_atr * a[i]:
                continue
            if c[i] > rh:
                sig[i] = 1
                sl[i] = (c[i] - rl) if sl_mode == 0 else sl_atr * a[i]
                traded = True
            elif c[i] < rl:
                sig[i] = -1
                sl[i] = (rh - c[i]) if sl_mode == 0 else sl_atr * a[i]
                traded = True
    flat = hour >= flat_hour
    z = np.zeros(n, np.bool_)
    ok = ~np.isnan(a)
    return _pack(sig, sl, tp_r * sl, a, z, z, flat, ok)


STRATS = {
    "trend_breakout": trend_breakout,
    "rsi_pullback": rsi_pullback,
    "bb_reversion": bb_reversion,
    "session_breakout": session_breakout,
}


def backtest(df, symbol, strat, spread_mult=1.0, slip_pips=0.1, comm_mult=1.0, **params):
    """Corre uma estratégia e devolve um DataFrame de trades + séries flutuantes."""
    spec = SPECS[symbol]
    p = STRATS[strat](df, symbol, **params)
    sp = spread_array(df, symbol, spread_mult)
    o, h, l, c = (df[k].to_numpy(np.float64) for k in ("open", "high", "low", "close"))
    res = engine.run(o, h, l, c, sp, p["sig"], p["sl_dist"], p["tp_dist"], p["atr"],
                     p["exit_long"], p["exit_short"], p["flat"], p["entry_ok"],
                     p["trail_mult"], p["trail_start_r"], p["be_r"], p["be_lock_r"],
                     p["max_bars"], slip_pips * spec.pip, spec.comm_frac * comm_mult,
                     p["trail2_mult"], p["trail2_start_r"])
    ei, xi, d, en, ex, r, risk, reason, mfe, fc, fw = res
    t = df["time"].to_numpy()
    trades = pd.DataFrame(dict(entry_time=t[ei], exit_time=t[xi], dir=d, entry=en, exit=ex,
                               r=r, risk=risk, reason=reason, mfe=mfe, bars=xi - ei))
    trades["symbol"] = symbol
    return trades, fc, fw
