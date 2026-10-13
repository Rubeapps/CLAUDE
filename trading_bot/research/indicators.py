"""Indicadores implementados à mão (o EA em MQL5 usa exatamente as mesmas fórmulas,
para que o backtest em Python e o MetaTrader deem os mesmos sinais)."""
from __future__ import annotations

import numpy as np
from numba import njit


@njit(cache=True)
def ema(x, n):
    out = np.full(len(x), np.nan)
    a = 2.0 / (n + 1.0)
    if len(x) < n:
        return out
    s = 0.0
    for i in range(n):
        s += x[i]
    v = s / n                      # semente = SMA dos primeiros n
    out[n - 1] = v
    for i in range(n, len(x)):
        v = a * x[i] + (1 - a) * v
        out[i] = v
    return out


@njit(cache=True)
def sma(x, n):
    out = np.full(len(x), np.nan)
    s = 0.0
    for i in range(len(x)):
        s += x[i]
        if i >= n:
            s -= x[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


@njit(cache=True)
def stdev(x, n):
    out = np.full(len(x), np.nan)
    for i in range(n - 1, len(x)):
        m = 0.0
        for k in range(i - n + 1, i + 1):
            m += x[k]
        m /= n
        v = 0.0
        for k in range(i - n + 1, i + 1):
            v += (x[k] - m) ** 2
        out[i] = np.sqrt(v / n)
    return out


@njit(cache=True)
def atr(h, l, c, n):
    """ATR de Wilder (RMA), semente = média simples dos primeiros n TR."""
    m = len(c)
    tr = np.empty(m)
    tr[0] = h[0] - l[0]
    for i in range(1, m):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    out = np.full(m, np.nan)
    if m < n:
        return out
    s = 0.0
    for i in range(n):
        s += tr[i]
    v = s / n
    out[n - 1] = v
    for i in range(n, m):
        v = (v * (n - 1) + tr[i]) / n
        out[i] = v
    return out


@njit(cache=True)
def rsi(c, n):
    """RSI de Wilder."""
    m = len(c)
    out = np.full(m, np.nan)
    if m <= n:
        return out
    g = 0.0
    d = 0.0
    for i in range(1, n + 1):
        ch = c[i] - c[i - 1]
        if ch > 0:
            g += ch
        else:
            d -= ch
    g /= n
    d /= n
    out[n] = 100.0 if d == 0 else 100.0 - 100.0 / (1.0 + g / d)
    for i in range(n + 1, m):
        ch = c[i] - c[i - 1]
        up = ch if ch > 0 else 0.0
        dn = -ch if ch < 0 else 0.0
        g = (g * (n - 1) + up) / n
        d = (d * (n - 1) + dn) / n
        out[i] = 100.0 if d == 0 else 100.0 - 100.0 / (1.0 + g / d)
    return out


@njit(cache=True)
def highest(x, n):
    """Máximo das n barras ANTERIORES (exclui a barra atual)."""
    out = np.full(len(x), np.nan)
    for i in range(n, len(x)):
        m = x[i - n]
        for k in range(i - n + 1, i):
            if x[k] > m:
                m = x[k]
        out[i] = m
    return out


@njit(cache=True)
def lowest(x, n):
    out = np.full(len(x), np.nan)
    for i in range(n, len(x)):
        m = x[i - n]
        for k in range(i - n + 1, i):
            if x[k] < m:
                m = x[k]
        out[i] = m
    return out


@njit(cache=True)
def adx(h, l, c, n):
    """ADX de Wilder."""
    m = len(c)
    out = np.full(m, np.nan)
    if m < 2 * n + 1:
        return out
    tr_s = 0.0; pdm_s = 0.0; ndm_s = 0.0
    dx = np.full(m, np.nan)
    for i in range(1, m):
        up = h[i] - h[i - 1]
        dn = l[i - 1] - l[i]
        pdm = up if (up > dn and up > 0) else 0.0
        ndm = dn if (dn > up and dn > 0) else 0.0
        tr = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
        if i <= n:
            tr_s += tr; pdm_s += pdm; ndm_s += ndm
        else:
            tr_s = tr_s - tr_s / n + tr
            pdm_s = pdm_s - pdm_s / n + pdm
            ndm_s = ndm_s - ndm_s / n + ndm
        if i >= n and tr_s > 0:
            pdi = 100 * pdm_s / tr_s
            ndi = 100 * ndm_s / tr_s
            dx[i] = 0.0 if pdi + ndi == 0 else 100 * abs(pdi - ndi) / (pdi + ndi)
    s = 0.0
    for i in range(n, 2 * n):
        s += dx[i]
    v = s / n
    out[2 * n - 1] = v
    for i in range(2 * n, m):
        v = (v * (n - 1) + dx[i]) / n
        out[i] = v
    return out
