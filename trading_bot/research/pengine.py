"""Motor de PORTFÓLIO multi-símbolo (numba): a mesma lógica de engine.run aplicada a K
símbolos em simultâneo numa linha temporal comum, com limites globais iguais aos do EA:
  * max_open        : nº máximo de posições abertas em toda a conta (todas as cartas)
  * max_same_ccy    : nº máximo de posições abertas na MESMA direção sobre a mesma moeda
                      (ex.: 2 vendas de JPY = comprar GBPJPY e comprar AUDJPY)
Quando um sinal é recusado por um limite, o EA volta a avaliá-lo na barra seguinte
(se o breakout ainda for válido) — aqui acontece exatamente o mesmo.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from numba import njit

from .data import load, SPECS
from . import strategies


@njit(cache=True)
def run_portfolio(has, o, h, l, c, spread, sig, sl_dist, tp_dist, atr, exl, exs, flat, ok,
                  trail_mult, trail_start_r, trail2_mult, trail2_start_r, be_r, max_bars,
                  slip, comm_frac, weight, ccy_base, ccy_quote, max_open, max_same_ccy, n_ccy):
    T, K = o.shape
    max_t = T * K // 4 + 10
    t_k = np.empty(max_t, np.int64); t_ei = np.empty(max_t, np.int64); t_xi = np.empty(max_t, np.int64)
    t_dir = np.empty(max_t, np.int64); t_r = np.empty(max_t, np.float64); t_reason = np.empty(max_t, np.int64)
    realized = np.zeros(T); fclose = np.zeros(T); fworst = np.zeros(T)
    pos = np.zeros(K, np.int64); entry = np.zeros(K); stop = np.zeros(K); tp = np.zeros(K)
    risk = np.ones(K); bars = np.zeros(K, np.int64); best = np.zeros(K); mfe = np.zeros(K)
    comm_r = np.zeros(K); slot = np.zeros(K, np.int64)
    last = np.full(K, -1, np.int64)        # índice da última barra existente de cada símbolo
    expo = np.zeros(n_ccy, np.int64)       # exposição líquida por moeda (+1 comprado na moeda)
    nt = 0
    nopen = 0
    for t in range(T):
        for k in range(K):
            if not has[t, k]:
                if pos[k] != 0:
                    fclose[t] += fclose_k(pos[k], c, spread, entry[k], risk[k], comm_r[k], last[k], k) * weight[k]
                    fworst[t] += fclose_k(pos[k], c, spread, entry[k], risk[k], comm_r[k], last[k], k) * weight[k]
                continue
            p = last[k]
            last[k] = t
            if p < 0:
                continue
            sp = spread[t, k]
            s = sig[p, k]
            # --- saídas no open por sinal ---
            if pos[k] != 0 and ((s != 0 and s != pos[k]) or (pos[k] == 1 and exl[p, k]) or (pos[k] == -1 and exs[p, k])):
                if pos[k] == 1:
                    px = o[t, k] - slip[k]; r = (px - entry[k]) / risk[k]
                else:
                    px = o[t, k] + sp + slip[k]; r = (entry[k] - px) / risk[k]
                j = slot[k]; t_xi[j] = t; t_r[j] = r - comm_r[k]; t_reason[j] = 4
                realized[t] += (r - comm_r[k]) * weight[k]
                expo[ccy_base[k]] -= pos[k]; expo[ccy_quote[k]] += pos[k]
                pos[k] = 0; nopen -= 1
            # --- entrada ---
            if pos[k] == 0 and s != 0 and ok[p, k] and sl_dist[p, k] > 0:
                allowed = nopen < max_open
                if allowed and max_same_ccy > 0:
                    # comprar k = +1 na base, -1 na cotada
                    if s * expo[ccy_base[k]] >= max_same_ccy or -s * expo[ccy_quote[k]] >= max_same_ccy:
                        allowed = False
                if allowed:
                    d = sl_dist[p, k]
                    if s == 1:
                        entry[k] = o[t, k] + sp + slip[k]; stop[k] = entry[k] - d
                        tp[k] = entry[k] + tp_dist[p, k] if tp_dist[p, k] > 0 else 0.0
                    else:
                        entry[k] = o[t, k] - slip[k]; stop[k] = entry[k] + d
                        tp[k] = entry[k] - tp_dist[p, k] if tp_dist[p, k] > 0 else 0.0
                    risk[k] = d; pos[k] = s; bars[k] = 0; best[k] = entry[k]; mfe[k] = 0.0
                    comm_r[k] = comm_frac[k] * entry[k] / d
                    slot[k] = nt; t_k[nt] = k; t_ei[nt] = t; t_dir[nt] = s; nt += 1
                    expo[ccy_base[k]] += s; expo[ccy_quote[k]] -= s
                    nopen += 1
            if pos[k] == 0:
                continue
            # --- gestão intrabarra ---
            bars[k] += 1
            done = False
            wr = 0.0
            if pos[k] == 1:
                if l[t, k] <= stop[k]:
                    px = (o[t, k] if o[t, k] < stop[k] else stop[k]) - slip[k]
                    rr = (px - entry[k]) / risk[k] - comm_r[k]; done = True
                    reason = 0 if stop[k] <= entry[k] - risk[k] * 0.999 else 2
                elif tp[k] > 0 and h[t, k] >= tp[k]:
                    px = o[t, k] if o[t, k] > tp[k] else tp[k]
                    rr = (px - entry[k]) / risk[k] - comm_r[k]; done = True; reason = 1
                else:
                    wr = (l[t, k] - entry[k]) / risk[k] - comm_r[k]
            else:
                ah = h[t, k] + sp
                if ah >= stop[k]:
                    px = (o[t, k] + sp if o[t, k] + sp > stop[k] else stop[k]) + slip[k]
                    rr = (entry[k] - px) / risk[k] - comm_r[k]; done = True
                    reason = 0 if stop[k] >= entry[k] + risk[k] * 0.999 else 2
                elif tp[k] > 0 and l[t, k] + sp <= tp[k]:
                    px = o[t, k] + sp if o[t, k] + sp < tp[k] else tp[k]
                    rr = (entry[k] - px) / risk[k] - comm_r[k]; done = True; reason = 1
                else:
                    wr = (entry[k] - ah) / risk[k] - comm_r[k]
            if not done:
                if pos[k] == 1:
                    if h[t, k] > best[k]:
                        best[k] = h[t, k]
                    mfe[k] = max(mfe[k], (best[k] - entry[k]) / risk[k])
                else:
                    if l[t, k] + sp < best[k]:
                        best[k] = l[t, k] + sp
                    mfe[k] = max(mfe[k], (entry[k] - best[k]) / risk[k])
                if flat[t, k] or (max_bars > 0 and bars[k] >= max_bars):
                    if pos[k] == 1:
                        rr = (c[t, k] - slip[k] - entry[k]) / risk[k] - comm_r[k]
                    else:
                        rr = (entry[k] - (c[t, k] + sp + slip[k])) / risk[k] - comm_r[k]
                    done = True
                    reason = 5 if flat[t, k] else 3
                    wr = min(wr, rr)
            if done:
                j = slot[k]; t_xi[j] = t; t_r[j] = rr; t_reason[j] = reason
                realized[t] += rr * weight[k]
                fworst[t] += min(wr, rr) * weight[k]
                expo[ccy_base[k]] -= pos[k]; expo[ccy_quote[k]] += pos[k]
                pos[k] = 0; nopen -= 1
                continue
            if pos[k] == 1:
                cur = (c[t, k] - entry[k]) / risk[k] - comm_r[k]
            else:
                cur = (entry[k] - (c[t, k] + sp)) / risk[k] - comm_r[k]
            fclose[t] += cur * weight[k]
            fworst[t] += wr * weight[k]
            if be_r > 0 and mfe[k] >= be_r:
                if pos[k] == 1 and entry[k] > stop[k]:
                    stop[k] = entry[k]
                elif pos[k] == -1 and entry[k] < stop[k]:
                    stop[k] = entry[k]
            tm = trail_mult
            if trail2_mult > 0 and mfe[k] >= trail2_start_r:
                tm = trail2_mult
            if tm > 0 and mfe[k] >= trail_start_r:
                if pos[k] == 1:
                    ns = best[k] - tm * atr[t, k]
                    if ns > stop[k]:
                        stop[k] = ns
                else:
                    ns = best[k] + tm * atr[t, k]
                    if ns < stop[k]:
                        stop[k] = ns
    # fecha o que ficar aberto
    for k in range(K):
        if pos[k] != 0:
            p = last[k]
            rr = fclose_k(pos[k], c, spread, entry[k], risk[k], comm_r[k], p, k)
            j = slot[k]; t_xi[j] = T - 1; t_r[j] = rr; t_reason[j] = 6
            realized[T - 1] += rr * weight[k]
    return t_k[:nt], t_ei[:nt], t_xi[:nt], t_dir[:nt], t_r[:nt], t_reason[:nt], realized, fclose, fworst


@njit(cache=True)
def fclose_k(pos, c, spread, entry, risk, comm_r, i, k):
    if pos == 1:
        return (c[i, k] - entry) / risk - comm_r
    return (entry - (c[i, k] + spread[i, k])) / risk - comm_r


CCYS = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "XAU"]


def portfolio_backtest(symbols, strat, params, tf="h1", max_open=99, max_same_ccy=0,
                       weights=None, cost=None):
    cost = cost or {}
    dfs = [load(s, tf) for s in symbols]
    idx = dfs[0]["time"]
    for d in dfs[1:]:
        idx = pd.Index(idx).union(pd.Index(d["time"]))
    idx = pd.DatetimeIndex(idx)
    T, K = len(idx), len(symbols)
    A = {k: np.zeros((T, K)) for k in ("o", "h", "l", "c", "sp", "sl", "tp", "atr")}
    B = {k: np.zeros((T, K), np.bool_) for k in ("has", "exl", "exs", "flat", "ok")}
    sig = np.zeros((T, K), np.int64)
    P = None
    for j, (s, d) in enumerate(zip(symbols, dfs)):
        pos = idx.get_indexer(d["time"])
        P = strategies.STRATS[strat](d, s, **params)
        A["o"][pos, j] = d["open"]; A["h"][pos, j] = d["high"]; A["l"][pos, j] = d["low"]; A["c"][pos, j] = d["close"]
        A["sp"][pos, j] = strategies.spread_array(d, s, cost.get("spread_mult", 1.0))
        A["sl"][pos, j] = P["sl_dist"]; A["tp"][pos, j] = P["tp_dist"]; A["atr"][pos, j] = P["atr"]
        B["has"][pos, j] = True; B["exl"][pos, j] = P["exit_long"]; B["exs"][pos, j] = P["exit_short"]
        B["flat"][pos, j] = P["flat"]; B["ok"][pos, j] = P["entry_ok"]; sig[pos, j] = P["sig"]
    slip = np.array([cost.get("slip_pips", 0.1) * SPECS[s].pip for s in symbols])
    comm = np.array([SPECS[s].comm_frac * cost.get("comm_mult", 1.0) for s in symbols])
    w = np.array([(weights or {}).get(s, 1.0) for s in symbols])
    cb = np.array([CCYS.index(s[:3]) for s in symbols]); cq = np.array([CCYS.index(s[3:]) for s in symbols])
    res = run_portfolio(B["has"], A["o"], A["h"], A["l"], A["c"], A["sp"], sig, A["sl"], A["tp"], A["atr"],
                        B["exl"], B["exs"], B["flat"], B["ok"], P["trail_mult"], P["trail_start_r"],
                        P["trail2_mult"], P["trail2_start_r"], P["be_r"], P["max_bars"], slip, comm, w, cb, cq,
                        max_open, max_same_ccy, len(CCYS))
    tk, ei, xi, dr, r, reason, realized, fc, fw = res
    trades = pd.DataFrame(dict(symbol=np.array(symbols)[tk], entry_time=idx[ei], exit_time=idx[xi], dir=dr,
                               r=r, r_w=r * w[tk], reason=reason))
    cum = np.cumsum(realized)
    prev = np.concatenate([[0.0], cum[:-1]])
    eq = pd.DataFrame({"closed": cum, "eq": cum + fc, "eq_low": prev + fw}, index=idx)
    return trades, eq
