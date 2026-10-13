"""Exploração inicial: famílias de estratégias x timeframes x símbolos (grelhas largas)."""
import sys, time
import pandas as pd
from research.grid import grid, aggregate

pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
which = sys.argv[1]
t0 = time.time()
if which == "trend":
    for tf in ["h1", "h4", "d1"]:
        res = grid("trend_breakout", tf, dict(n_break=[20, 55, 100], ema_len=[50, 200], sl_atr=[2.0, 3.0],
                                               trail_atr=[0.0, 3.0, 5.0], n_exit=[0, 20]))
        res.to_csv(f"reports/grids/trend_{tf}.csv", index=False)
elif which == "pullback":
    for tf in ["h1", "h4", "d1"]:
        res = grid("rsi_pullback", tf, dict(ema_len=[100, 200], rsi_len=[2, 3, 5], rsi_in=[5.0, 10.0, 20.0],
                                             rsi_out=[50.0, 70.0], sl_atr=[1.5, 3.0], max_bars=[10, 30],
                                             long_only=[False]))
        res.to_csv(f"reports/grids/pullback_{tf}.csv", index=False)
elif which == "bbrev":
    for tf in ["m15", "h1"]:
        res = grid("bb_reversion", tf, dict(bb_len=[20, 40], bb_k=[2.0, 2.5, 3.0], adx_max=[20.0, 30.0, 100.0],
                                             sl_atr=[2.0, 4.0], max_bars=[8, 24],
                                             h_from=[0, 2, 9], h_to=[8, 24]))
        res = res[~((res.h_from == 9) & (res.h_to == 8))]
        res.to_csv(f"reports/grids/bbrev_{tf}.csv", index=False)
elif which == "session":
    res = grid("session_breakout", "h1", dict(range_from=[0, 2, 3], range_to=[8, 9, 10], trade_to=[13, 17],
                                               flat_hour=[20, 23], sl_mode=[0, 1], sl_atr=[1.0],
                                               tp_r=[0.0, 1.0, 2.0, 3.0]))
    res.to_csv("reports/grids/session_h1.csv", index=False)
print(which, "done", round(time.time() - t0), "s")
