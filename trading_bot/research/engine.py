"""Motor de backtest barra-a-barra (numba), com custos realistas.

Convenções (iguais às do EA em MQL5):
  * Os preços dos dados são BID. ASK = BID + spread.
  * Os sinais são calculados no FECHO da barra i e executados na ABERTURA da barra i+1
    (sem look-ahead).
  * Compra: entra no ASK, sai no BID. Venda: entra no BID, sai no ASK.
  * Se o SL e o TP forem tocados na mesma barra assume-se SEMPRE o SL (pessimista).
  * Gaps: se a barra abre para lá do SL, o fill é na abertura (pior preço).
  * O trailing/break-even é recalculado no fecho de cada barra e só vale a partir da
    barra seguinte.
  * Resultado de cada trade em múltiplos de R (risco inicial), já com spread,
    comissão e slippage. Com dimensionamento por % de risco, R * risco% = retorno.
"""
from __future__ import annotations

import numpy as np
from numba import njit

EXIT_SL, EXIT_TP, EXIT_TRAIL, EXIT_TIME, EXIT_SIGNAL, EXIT_FLAT, EXIT_END = 0, 1, 2, 3, 4, 5, 6
EXIT_NAMES = ["SL", "TP", "TRAIL", "TIME", "SIGNAL", "FLAT", "END"]


@njit(cache=True)
def run(o, h, l, c, spread, sig, sl_dist, tp_dist, atr,
        exit_long, exit_short, flat, entry_ok,
        trail_mult, trail_start_r, be_r, be_lock_r, max_bars, slip, comm_frac,
        trail2_mult=0.0, trail2_start_r=0.0):
    """
    sig[i]      : +1 compra / -1 venda / 0 nada (decidido no fecho de i, executa em i+1)
    sl_dist[i]  : distância do stop em preço
    tp_dist[i]  : distância do TP em preço (0 = sem TP)
    atr[i]      : ATR para o trailing (chandelier)
    exit_long/exit_short[i]: sair no open de i+1
    flat[i]     : fechar tudo no FECHO de i (sessão/sexta-feira)
    entry_ok[i] : filtro de execução no open de i+1 (ex.: spread máximo, horário)
    """
    n = len(o)
    max_t = n // 2 + 1
    t_entry_i = np.empty(max_t, np.int64)
    t_exit_i = np.empty(max_t, np.int64)
    t_dir = np.empty(max_t, np.int64)
    t_entry = np.empty(max_t, np.float64)
    t_exit = np.empty(max_t, np.float64)
    t_r = np.empty(max_t, np.float64)
    t_risk = np.empty(max_t, np.float64)
    t_reason = np.empty(max_t, np.int64)
    t_mfe = np.empty(max_t, np.float64)
    float_close = np.zeros(n, np.float64)   # R flutuante no fecho da barra
    float_worst = np.zeros(n, np.float64)   # pior R flutuante dentro da barra

    nt = 0
    pos = 0
    entry = 0.0
    stop = 0.0
    tp = 0.0
    risk = 0.0
    bars = 0
    ei = 0
    best = 0.0      # melhor preço a favor desde a entrada (para trailing)
    mfe = 0.0
    comm_r = 0.0

    for i in range(1, n):
        sp = spread[i]
        # ---------------- 1) entrada no open da barra i (sinal de i-1) ----------------
        s = sig[i - 1]
        if pos != 0 and s != 0 and s != pos:
            # sinal contrário: fecha no open e inverte
            if pos == 1:
                px = o[i] - slip
                r = (px - entry) / risk
            else:
                px = o[i] + sp + slip
                r = (entry - px) / risk
            t_exit_i[nt] = i; t_exit[nt] = px; t_r[nt] = r - comm_r
            t_reason[nt] = EXIT_SIGNAL; t_mfe[nt] = mfe; nt += 1
            pos = 0
        elif pos == 1 and exit_long[i - 1]:
            px = o[i] - slip
            t_exit_i[nt] = i; t_exit[nt] = px; t_r[nt] = (px - entry) / risk - comm_r
            t_reason[nt] = EXIT_SIGNAL; t_mfe[nt] = mfe; nt += 1
            pos = 0
        elif pos == -1 and exit_short[i - 1]:
            px = o[i] + sp + slip
            t_exit_i[nt] = i; t_exit[nt] = px; t_r[nt] = (entry - px) / risk - comm_r
            t_reason[nt] = EXIT_SIGNAL; t_mfe[nt] = mfe; nt += 1
            pos = 0

        if pos == 0 and s != 0 and entry_ok[i - 1] and sl_dist[i - 1] > 0:
            d = sl_dist[i - 1]
            if s == 1:
                entry = o[i] + sp + slip
                stop = entry - d
                tp = entry + tp_dist[i - 1] if tp_dist[i - 1] > 0 else 0.0
            else:
                entry = o[i] - slip
                stop = entry + d
                tp = entry - tp_dist[i - 1] if tp_dist[i - 1] > 0 else 0.0
            risk = d
            pos = s
            bars = 0
            ei = i
            best = entry
            mfe = 0.0
            comm_r = comm_frac * entry / risk
            t_entry_i[nt] = i; t_dir[nt] = s; t_entry[nt] = entry; t_risk[nt] = risk

        # ---------------- 2) gestão dentro da barra i ----------------
        if pos != 0:
            bars += 1
            done = False
            if pos == 1:
                # SL (pessimista: verificado antes do TP)
                if l[i] <= stop:
                    px = (o[i] if o[i] < stop else stop) - slip
                    reason = EXIT_SL if stop <= entry - risk * 0.999 else EXIT_TRAIL
                    t_r[nt] = (px - entry) / risk - comm_r
                    t_exit[nt] = px; done = True
                elif tp > 0 and h[i] >= tp:
                    px = o[i] if o[i] > tp else tp
                    reason = EXIT_TP
                    t_r[nt] = (px - entry) / risk - comm_r
                    t_exit[nt] = px; done = True
                else:
                    float_worst[i] = (l[i] - entry) / risk - comm_r
            else:
                ah = h[i] + sp
                al = l[i] + sp
                if ah >= stop:
                    px = (o[i] + sp if o[i] + sp > stop else stop) + slip
                    reason = EXIT_SL if stop >= entry + risk * 0.999 else EXIT_TRAIL
                    t_r[nt] = (entry - px) / risk - comm_r
                    t_exit[nt] = px; done = True
                elif tp > 0 and al <= tp:
                    px = o[i] + sp if o[i] + sp < tp else tp
                    reason = EXIT_TP
                    t_r[nt] = (entry - px) / risk - comm_r
                    t_exit[nt] = px; done = True
                else:
                    float_worst[i] = (entry - ah) / risk - comm_r

            if done:
                t_exit_i[nt] = i; t_reason[nt] = reason; t_mfe[nt] = mfe; nt += 1
                float_worst[i] = min(float_worst[i], t_r[nt - 1])
                pos = 0
                continue

            # MFE / melhor preço
            if pos == 1:
                if h[i] > best:
                    best = h[i]
                mfe = max(mfe, (best - entry) / risk)
                cur_r = (c[i] - entry) / risk
            else:
                if l[i] + sp < best:
                    best = l[i] + sp
                mfe = max(mfe, (entry - best) / risk)
                cur_r = (entry - (c[i] + sp)) / risk

            # saídas no fecho: flat de sessão ou tempo máximo
            if flat[i] or (max_bars > 0 and bars >= max_bars):
                if pos == 1:
                    px = c[i] - slip
                    r = (px - entry) / risk
                else:
                    px = c[i] + sp + slip
                    r = (entry - px) / risk
                t_exit_i[nt] = i; t_exit[nt] = px; t_r[nt] = r - comm_r
                t_reason[nt] = EXIT_FLAT if flat[i] else EXIT_TIME
                t_mfe[nt] = mfe; nt += 1
                float_worst[i] = min(float_worst[i], r - comm_r)
                pos = 0
                continue

            float_close[i] = cur_r - comm_r

            # break-even
            if be_r > 0 and mfe >= be_r:
                if pos == 1:
                    ns = entry + be_lock_r * risk
                    if ns > stop:
                        stop = ns
                else:
                    ns = entry - be_lock_r * risk
                    if ns < stop:
                        stop = ns
            # trailing chandelier
            tm = trail_mult
            if trail2_mult > 0 and mfe >= trail2_start_r:
                tm = trail2_mult          # trailing mais apertado depois de um lucro grande
            if tm > 0 and mfe >= trail_start_r:
                if pos == 1:
                    ns = best - tm * atr[i]
                    if ns > stop:
                        stop = ns
                else:
                    ns = best + tm * atr[i]
                    if ns < stop:
                        stop = ns

    if pos != 0:
        i = n - 1
        if pos == 1:
            px = c[i]
            r = (px - entry) / risk
        else:
            px = c[i] + spread[i]
            r = (entry - px) / risk
        t_exit_i[nt] = i; t_exit[nt] = px; t_r[nt] = r - comm_r
        t_reason[nt] = EXIT_END; t_mfe[nt] = mfe; nt += 1

    return (t_entry_i[:nt], t_exit_i[:nt], t_dir[:nt], t_entry[:nt], t_exit[:nt],
            t_r[:nt], t_risk[:nt], t_reason[:nt], t_mfe[:nt], float_close, float_worst)
