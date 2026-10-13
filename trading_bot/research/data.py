"""Carregamento de dados OHLC (MT5, hora do servidor GMT+2/+3) e especificações dos símbolos."""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD",
           "EURJPY", "GBPJPY", "AUDJPY", "EURGBP", "EURCHF", "XAUUSD"]


@dataclass(frozen=True)
class Spec:
    scale: float        # os CSV vêm em pontos: preço = valor / scale
    pip: float          # tamanho de 1 pip em preço
    spread_pips: float  # spread típico de conta raw/ECN (FTMO, etc.) em pips
    # comissão ida+volta como fração do nocional (~7 USD por lote de 100k = 7e-5)
    comm_frac: float = 7e-5


SPECS = {
    "EURUSD": Spec(1e5, 1e-4, 0.2), "GBPUSD": Spec(1e5, 1e-4, 0.5),
    "USDJPY": Spec(1e3, 1e-2, 0.3), "USDCHF": Spec(1e5, 1e-4, 0.5),
    "USDCAD": Spec(1e5, 1e-4, 0.6), "AUDUSD": Spec(1e5, 1e-4, 0.4),
    "EURJPY": Spec(1e3, 1e-2, 0.6), "GBPJPY": Spec(1e3, 1e-2, 1.2),
    "AUDJPY": Spec(1e3, 1e-2, 0.7), "EURGBP": Spec(1e5, 1e-4, 0.6),
    "EURCHF": Spec(1e5, 1e-4, 0.8),
    # ouro: 1 "pip" = 0.10 USD; spread típico 15-25 cêntimos; comissão ~ 4e-5
    "XAUUSD": Spec(1e2, 1e-1, 2.0, 4e-5),
}

_cache: dict = {}


def load(symbol: str, tf: str = "h1") -> pd.DataFrame:
    key = (symbol, tf)
    if key in _cache:
        return _cache[key]
    path = os.path.join(DATA_DIR, symbol, f"{symbol}{tf}.csv")
    df = pd.read_csv(path, parse_dates=["Date"])
    df = df.rename(columns={"Date": "time", "tick_volume": "volume"})
    s = SPECS[symbol].scale
    for c in ("open", "high", "low", "close"):
        df[c] = (df[c] / s).round(6)
    df = df.drop_duplicates("time").sort_values("time").reset_index(drop=True)
    _cache[key] = df
    return df


def resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Agrega barras (ex.: '4h') respeitando a hora do servidor."""
    g = df.set_index("time").resample(rule, label="left", closed="left")
    out = g.agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
    return out.dropna().reset_index()


def arrays(df: pd.DataFrame):
    return (df["open"].to_numpy(np.float64), df["high"].to_numpy(np.float64),
            df["low"].to_numpy(np.float64), df["close"].to_numpy(np.float64))
