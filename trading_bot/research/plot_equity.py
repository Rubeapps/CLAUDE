"""Gráfico da curva de capital do portfólio final (reports/equity.png)."""
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from research.evalport import evaluate_p
from research.config import P, MAX_OPEN, SYMBOLS

RISK = 0.3
m, d, tr = evaluate_p(P, symbols=SYMBOLS, max_open=MAX_OPEN)
eq = d.eq_close * RISK
low = np.minimum(d.eq_min, d.eq_close) * RISK
dd = low - np.maximum.accumulate(np.maximum(eq, 0))
INK, INK2, GRID, BLUE, SURF = "#0b0b0b", "#52514e", "#e4e3df", "#2a78d6", "#fcfcfb"
plt.rcParams.update({"font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK})
fig, (a1, a2) = plt.subplots(2, 1, figsize=(10, 6), sharex=True, gridspec_kw=dict(height_ratios=[3, 1.2]),
                             facecolor=SURF)
for a in (a1, a2):
    a.set_facecolor(SURF); a.grid(axis="y", color=GRID, lw=0.8); a.spines[["top", "right"]].set_visible(False)
    a.axvspan(pd.Timestamp("2019-01-01"), d.index[-1], color="#f1f0ec", lw=0, zorder=0)
a1.plot(eq.index, eq, color=BLUE, lw=2)
a1.set_ylabel("Lucro acumulado (% do saldo inicial)")
a1.set_title(f"TrendBreakoutPro — portfólio {', '.join(SYMBOLS)} | risco {RISK}% por trade, máx. {MAX_OPEN} posições",
             loc="left", fontsize=11, color=INK)
a1.text(pd.Timestamp("2019-02-01"), eq.max() * 0.15, "2019–2022:\nnunca visto na otimização", color=INK2, fontsize=9, va="top")
a1.text(d.index[0], eq.max() * 0.97, "2012–2018: otimização", color=INK2, fontsize=9, va="top")
a1.annotate(f"{eq.iloc[-1]:+.0f}%", (eq.index[-1], eq.iloc[-1]), xytext=(4, 0), textcoords="offset points", color=INK, fontsize=9, va="center")
a2.fill_between(dd.index, dd, 0, color=BLUE, alpha=0.35, lw=0)
a2.plot(dd.index, dd, color=BLUE, lw=1)
a2.set_ylabel("Drawdown (%)")
a2.annotate(f"máx. {dd.min():.1f}%", (dd.idxmin(), dd.min()), xytext=(6, -2), textcoords="offset points", color=INK, fontsize=9)
fig.tight_layout()
fig.savefig("reports/equity.png", dpi=130, facecolor=SURF)
print("ok", eq.iloc[-1], dd.min())
