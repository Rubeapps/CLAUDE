"""Paridade EA <-> backtest: reproduz o cálculo do EA (janela de CopyRates com 1255 barras
fechadas, EMA semeada no início da janela, ATR de Wilder, Donchian das 55 barras anteriores,
filtros de hora e de sexta-feira) e compara com os sinais do motor de backtest."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from numba import njit
from research.data import load
from research.strategies import trend_breakout
from research.config import P

NEED = max(200, 55) + 1000  # o EA pede max(InpEmaLen, InpBreakBars) + 1000 barras fechadas


@njit(cache=True)
def ea_signals(o, h, l, c, hour, dow, need, n_break, ema_len, atr_len, h_from, h_to, fri_hour):
    n = len(c)
    sig = np.zeros(n, np.int64); atr_out = np.zeros(n)
    for last in range(need, n):         # `last` = última barra fechada
        s0 = last - need + 1             # janela [s0, last]
        a = 2.0 / (ema_len + 1.0); s = 0.0
        for i in range(s0, s0 + ema_len): s += c[i]
        e = s / ema_len
        for i in range(s0 + ema_len, last + 1): e = a * c[i] + (1 - a) * e
        tr0 = h[s0] - l[s0]; s = tr0
        for i in range(s0 + 1, s0 + atr_len):
            s += max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
        v = s / atr_len
        for i in range(s0 + atr_len, last + 1):
            tr = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
            v = (v * (atr_len - 1) + tr) / atr_len
        atr_out[last] = v
        hh = h[last - 1]; ll = l[last - 1]
        for i in range(last - n_break, last):
            hh = max(hh, h[i]); ll = min(ll, l[i])
        hr = hour[last]; d = dow[last]
        if d == 4 and hr >= fri_hour - 1:      # barra de fecho de sexta
            continue
        if hr >= h_from and hr < h_to and not (d == 4 and hr >= fri_hour - 2):
            if c[last] > hh and c[last] > e: sig[last] = 1
            elif c[last] < ll and c[last] < e: sig[last] = -1
    return sig, atr_out


def check(symbol):
    df = load(symbol, "h1")
    o, h, l, c = (df[k].to_numpy(np.float64) for k in ("open", "high", "low", "close"))
    hour = df.time.dt.hour.to_numpy(); dow = df.time.dt.dayofweek.to_numpy()
    ref = trend_breakout(df, symbol, **P)
    # EA: InpFridayHour = 22 (fecha às 22h) <=> Python friday_hour = 21 (fecha no fecho da barra das 21h)
    sig, atr = ea_signals(o, h, l, c, hour, dow, NEED, P["n_break"], P["ema_len"], 20, P["h_from"], P["h_to"], P["friday_hour"] + 1)
    m = np.arange(len(c)) >= NEED
    diff = (sig != ref["sig"]) & m
    atr_err = np.nanmax(np.abs(atr[m] - ref["atr"][m]) / ref["atr"][m])
    return int(diff.sum()), int((ref["sig"][m] != 0).sum()), float(atr_err)


def test_parity():
    for s in ["XAUUSD", "GBPJPY", "AUDJPY", "USDJPY", "EURJPY"]:
        nd, ns, ae = check(s)
        print(f"{s}: sinais backtest={ns} diferenças EA={nd} ({nd / max(ns, 1):.3%}) erro máx ATR={ae:.2e}")
        assert nd / max(ns, 1) < 0.005, "EA e backtest divergem"


if __name__ == "__main__":
    test_parity()
