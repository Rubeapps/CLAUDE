"""Simulação de desafios e contas financiadas sobre a sequência REAL de dias (2012-2022),
com o portfólio final (motor multi-símbolo, limite de posições abertas)."""
import numpy as np, pandas as pd
from research.evalport import evaluate_p
from research.portfolio import PropRules, simulate_challenges, funded_stats
from research.config import P, MAX_OPEN, SYMBOLS

OUT = []
def w(s=""): print(s); OUT.append(s)

if __name__ == "__main__":
    m, daily, trades = evaluate_p(P, symbols=SYMBOLS, max_open=MAX_OPEN)
    w("# Simulação prop firm\n")
    w(f"Portfólio: {', '.join(SYMBOLS)} | máx. {MAX_OPEN} posições abertas | parâmetros `{P}`\n")
    w("Cada linha = desafios iniciados a cada 5 dias de negociação de 2012-11 a 2022-03, seguindo a sequência REAL de "
      "dias (mantém correlações e sequências de perdas). Perda total 10% estática; perda diária 5%; sem limite de tempo; mín. 4 dias.\n")
    for base, title in [("balance", "Regra diária tipo FTMO (base = saldo no início do dia)"),
                        ("max", "Regra diária exigente (base = máx(saldo, equity) no início do dia — conta lucro flutuante)")]:
        w(f"## {title}\n")
        w("| Risco/trade | Fase 1 (+10%) passa | falha diária | falha total | dias (mediana) | Fase 2 (+5%) passa | dias (mediana) | Financiada: prob. violar em 12 meses | Lucro médio 12 meses |")
        w("|---|---|---|---|---|---|---|---|---|")
        for risk in [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75]:
            s1 = simulate_challenges(daily, risk, PropRules(target=10, daily_base=base)); s1 = s1[s1.result != "open"]
            s2 = simulate_challenges(daily, risk, PropRules(target=5, daily_base=base)); s2 = s2[s2.result != "open"]
            f = funded_stats(daily, risk, PropRules(daily_base=base))
            w(f"| {risk}% | {(s1.result=='pass').mean():.0%} | {(s1.result=='fail_daily').mean():.0%} | {(s1.result=='fail_max').mean():.0%} | "
              f"{s1[s1.result=='pass'].days.median():.0f} | {(s2.result=='pass').mean():.0%} | {s2[s2.result=='pass'].days.median():.0f} | "
              f"{f['breach_prob']:.0%} | {f['mean_ret']:+.1f}% |")
        w("")
    open("reports/propfirm.md", "w").write("\n".join(OUT) + "\n")
