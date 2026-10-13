"""Testes do motor de backtest: casos sintéticos com resultado conhecido."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from research import engine
from research import indicators as ind


def _run(o, h, l, c, sig, sl, tp=None, spread=0.0, trail=0.0, be=0.0, max_bars=0, slip=0.0,
         comm=0.0, exl=None, exs=None, flat=None):
    n = len(o)
    z = np.zeros(n, np.bool_)
    return engine.run(np.array(o, float), np.array(h, float), np.array(l, float), np.array(c, float),
                      np.full(n, spread), np.array(sig, np.int64), np.full(n, sl),
                      np.full(n, 0.0) if tp is None else np.full(n, tp), np.full(n, 1.0),
                      z if exl is None else np.array(exl), z if exs is None else np.array(exs),
                      z if flat is None else np.array(flat), np.ones(n, np.bool_),
                      trail, 0.0, be, 0.0, max_bars, slip, comm)


def test_long_tp():
    # sinal na barra 0, entra no open da barra 1 = 100, TP a +2 -> 102 tocado na barra 2
    o = [100, 100, 101, 102]; h = [100, 100.5, 102.5, 103]; l = [99.9, 99.5, 100.8, 101]; c = [100, 100.2, 102, 102]
    r = _run(o, h, l, c, [1, 0, 0, 0], sl=1.0, tp=2.0)
    assert len(r[0]) == 1 and r[7][0] == engine.EXIT_TP
    assert abs(r[5][0] - 2.0) < 1e-9


def test_long_sl_priority_same_bar():
    # barra 1 toca SL e TP ao mesmo tempo -> conta como SL (pessimista)
    o = [100, 100, 100]; h = [100, 103, 100]; l = [100, 98, 100]; c = [100, 100, 100]
    r = _run(o, h, l, c, [1, 0, 0], sl=1.0, tp=2.0)
    assert r[7][0] == engine.EXIT_SL and abs(r[5][0] + 1.0) < 1e-9


def test_gap_through_stop():
    # posição longa a 100 com SL 99; barra seguinte abre a 97 -> fill a 97 = -3R
    o = [100, 100, 97]; h = [100, 100.2, 97.5]; l = [100, 99.5, 96]; c = [100, 100, 97]
    r = _run(o, h, l, c, [1, 0, 0], sl=1.0)
    assert abs(r[5][0] + 3.0) < 1e-9


def test_short_spread_and_costs():
    # venda entra no bid 100, SL 1.0; ask = bid+0.1. Barra sai no fecho por max_bars=1:
    # fecho bid 99.5 -> ask 99.6 -> R = (100-99.6)/1 = 0.4 ; comissão 0.001*100/1 = 0.1R
    o = [100, 100, 99]; h = [100, 100.2, 99]; l = [100, 99.4, 99]; c = [100, 99.5, 99]
    r = _run(o, h, l, c, [-1, 0, 0], sl=1.0, spread=0.1, max_bars=1, comm=0.001)
    assert r[7][0] == engine.EXIT_TIME
    assert abs(r[5][0] - 0.3) < 1e-9


def test_long_spread_on_entry():
    # compra paga o ask: entry = 100.1; SL distância 1 -> SL 99.1
    o = [100, 100, 100]; h = [100, 100.2, 100]; l = [100, 99.0, 100]; c = [100, 100, 100]
    r = _run(o, h, l, c, [1, 0, 0], sl=1.0, spread=0.1)
    assert abs(r[3][0] - 100.1) < 1e-9 and r[7][0] == engine.EXIT_SL


def test_no_lookahead_signal_executes_next_open():
    o = [100, 105, 106]; h = [100, 106, 107]; l = [100, 104.5, 105]; c = [100, 105.5, 106]
    r = _run(o, h, l, c, [1, 0, 0], sl=10.0)
    assert r[0][0] == 1 and abs(r[3][0] - 105) < 1e-9


def test_trailing_moves_only_after_bar_close():
    # trailing de 1 ATR (ATR=1). barra1: max 103 -> stop passa a 102 só na barra 2
    o = [100, 100, 102.5, 102]; h = [100, 103, 102.6, 102]; l = [100, 99.5, 101.9, 101]; c = [100, 102.5, 102, 101]
    r = _run(o, h, l, c, [1, 0, 0, 0], sl=1.0, trail=1.0)
    assert r[7][0] == engine.EXIT_TRAIL and abs(r[4][0] - 102.0) < 1e-9


def test_reversal():
    o = [100, 100, 101, 101]; h = [100, 101, 101, 101]; l = [100, 99.5, 100.5, 100.5]; c = [100, 101, 101, 101]
    r = _run(o, h, l, c, [1, -1, 0, 0], sl=5.0)
    assert r[7][0] == engine.EXIT_SIGNAL and abs(r[5][0] - 0.2) < 1e-9 and r[2][1] == -1


def test_random_signals_zero_edge():
    # passeio aleatório sem custos: expectativa ~0
    rng = np.random.default_rng(1)
    n = 200_000
    c = 100 + np.cumsum(rng.normal(0, 0.1, n))
    o = np.concatenate([[100], c[:-1]])
    h = np.maximum(o, c) + 0.02; l = np.minimum(o, c) - 0.02
    sig = rng.choice([-1, 0, 1], n, p=[0.01, 0.98, 0.01])
    r = _run(o, h, l, c, sig, sl=0.5, tp=0.5)
    assert abs(r[5].mean()) < 0.03, r[5].mean()


def test_indicators_basic():
    x = np.arange(1, 11, dtype=float)
    assert abs(ind.sma(x, 3)[-1] - 9.0) < 1e-12
    e = ind.ema(x, 3); assert abs(e[2] - 2.0) < 1e-12 and abs(e[3] - 3.0) < 1e-12
    assert ind.highest(x, 3)[5] == 5.0  # exclui a barra atual
    r = ind.rsi(x, 2); assert r[-1] == 100.0


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
