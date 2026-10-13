import sys, pandas as pd
from research.grid import aggregate
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30); pd.set_option("display.max_rows", 200)
f = sys.argv[1]; res = pd.read_csv(f)
keys = [c for c in res.columns if c not in ("strat","tf","symbol") and not c.startswith(("is_","oos_"))]
agg = aggregate(res, keys)
print(agg.head(int(sys.argv[2]) if len(sys.argv)>2 else 15).round(3).to_string())
print("corr IS->OOS total:", round(agg.is_total.corr(agg.oos_total),3), " frac OOS>0:", round((agg.oos_total>0).mean(),3))
# por símbolo: melhor IS e a respetiva OOS
best = res.loc[res.groupby("symbol").is_total.idxmax()]
print(best[["symbol"]+keys+["is_n","is_total","is_pf","oos_n","oos_total","oos_pf"]].round(2).to_string())
