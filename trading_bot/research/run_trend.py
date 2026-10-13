"""Investigação aprofundada do breakout de tendência em H1 (todas as moedas, grelha larga)."""
import sys, time
from research.grid import grid
t0 = time.time()
stage = sys.argv[1]
if stage == "wide":
    res = grid("trend_breakout", "h1", dict(n_break=[10, 20, 35, 55, 80, 120, 200], ema_len=[0, 50, 100, 200, 400],
                                             sl_atr=[1.0, 1.5, 2.0, 3.0, 4.0], trail_atr=[0.0, 2.0, 3.0, 5.0, 8.0]))
    res.to_csv("reports/grids/trend_h1_wide.csv", index=False)
elif stage == "exits":
    res = grid("trend_breakout", "h1", dict(n_break=[20, 35, 55], ema_len=[100, 200], sl_atr=[2.0, 3.0],
                                             trail_atr=[0.0, 3.0, 5.0], tp_r=[0.0, 2.0, 4.0], be_r=[0.0, 1.0],
                                             max_bars=[0, 120], n_exit=[0, 20]))
    res.to_csv("reports/grids/trend_h1_exits.csv", index=False)
elif stage == "filters":
    res = grid("trend_breakout", "h1", dict(n_break=[20, 35, 55], ema_len=[100, 200], sl_atr=[2.0, 3.0],
                                             trail_atr=[0.0, 5.0], h_from=[0, 2, 8], h_to=[18, 22, 24],
                                             adx_min=[0.0, 20.0, 25.0], friday_flat=[False, True]))
    res.to_csv("reports/grids/trend_h1_filters.csv", index=False)
print(stage, "done", round(time.time() - t0))
