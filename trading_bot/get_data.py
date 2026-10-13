"""Descarrega os dados históricos usados na investigação (MT5, 2012-2022, M15/H1/H4/D1)
de https://github.com/ejtraderLabs/historical-data para ./data/<SÍMBOLO>/."""
import os
import urllib.request

BASE = "https://raw.githubusercontent.com/ejtraderLabs/historical-data/main/"
SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD",
           "EURJPY", "GBPJPY", "AUDJPY", "EURGBP", "EURCHF", "XAUUSD"]
TFS = ["m15", "h1", "h4", "d1"]

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
for s in SYMBOLS:
    os.makedirs(os.path.join(root, s), exist_ok=True)
    for tf in TFS:
        dst = os.path.join(root, s, f"{s}{tf}.csv")
        if os.path.exists(dst):
            continue
        print("a descarregar", s, tf)
        urllib.request.urlretrieve(f"{BASE}{s}/{s}{tf}.csv", dst)
print("ok")
