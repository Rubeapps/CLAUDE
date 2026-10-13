//+------------------------------------------------------------------+
//|                                          TrendBreakoutPro.mq5    |
//|  Breakout de tendência H1 multi-símbolo com proteção prop firm   |
//|                                                                  |
//|  Estratégia (igual ao backtest em Python, research/config.py):   |
//|   * Sinal no FECHO de cada barra H1:                             |
//|       COMPRA se Close > máximo das 55 barras anteriores          |
//|                 e Close > EMA(200)                               |
//|       VENDA  se Close < mínimo das 55 barras anteriores          |
//|                 e Close < EMA(200)                               |
//|   * Só aceita sinais de barras entre as 08h e as 22h (servidor)  |
//|   * Stop inicial = 2 x ATR(20) ; sem take-profit                 |
//|   * Trailing stop "chandelier" = melhor preço - 5 x ATR(20)      |
//|   * Sinal contrário fecha e inverte a posição                    |
//|   * Fecha tudo sexta-feira às 22h (sem risco de gap de fim de    |
//|     semana) e não abre novas posições na sexta a partir das 21h  |
//|   * Máximo de 2 posições abertas em toda a conta                 |
//|  Proteção de conta (prop firms): perda diária / perda total /    |
//|  meta de lucro, medidas na EQUITY em cada segundo, com margem.   |
//|                                                                  |
//|  Anexar a UMA carta qualquer (ex.: XAUUSD H1). O EA trata dos    |
//|  5 símbolos sozinho. Hora do servidor esperada: GMT+2/GMT+3      |
//|  (padrão da maioria dos brokers MT5 e das prop firms). Se o seu  |
//|  broker usar outra hora, ajuste InpHourShift.                    |
//+------------------------------------------------------------------+
#property copyright "TrendBreakoutPro"
#property version   "1.00"
#property description "Breakout de tendência H1 (ouro + cruzados do iene) com gestão de risco para prop firms."

#include <Trade\Trade.mqh>

enum ENUM_RISK_BASE { RISK_INITIAL = 0,  // % do saldo inicial (recomendado em prop firms)
                      RISK_BALANCE = 1,  // % do saldo atual
                      RISK_EQUITY  = 2 };// % da equity atual

//--- Símbolos e risco
input group "=== Símbolos e risco ==="
input string         InpSymbols        = "XAUUSD,GBPJPY,AUDJPY,USDJPY,EURJPY"; // Símbolos (separados por vírgula)
input string         InpSuffix         = "";       // Sufixo do broker (ex.: ".r", "m", ".raw")
input double         InpRiskPct        = 0.30;     // Risco por trade (%)
input ENUM_RISK_BASE InpRiskBase       = RISK_INITIAL; // Base do risco
input int            InpMaxOpen        = 2;        // Máximo de posições abertas (todos os símbolos)
input long           InpMagic          = 550200;   // Número mágico

//--- Estratégia (valores validados no backtest; alterar só se souber o que faz)
input group "=== Estratégia ==="
input int            InpBreakBars      = 55;       // Barras do breakout (Donchian)
input int            InpEmaLen         = 200;      // EMA de tendência (0 = sem filtro)
input int            InpAtrLen         = 20;       // Período do ATR
input double         InpSlAtr          = 2.0;      // Stop inicial (x ATR)
input double         InpTrailAtr       = 5.0;      // Trailing (x ATR, 0 = desligado)
input int            InpHourFrom       = 8;        // Aceitar sinais a partir da hora (servidor)
input int            InpHourTo         = 22;       // ... até antes desta hora
input bool           InpFridayFlat     = true;     // Fechar tudo à sexta-feira
input int            InpFridayHour     = 22;       // Hora de fecho de sexta (servidor)
input int            InpHourShift      = 0;        // Correção de hora se o servidor não for GMT+2/+3

//--- Prop firm
input group "=== Proteção prop firm ==="
input double         InpInitialBalance = 0;        // Saldo inicial da conta (0 = automático)
input double         InpDailyLossPct   = 5.0;      // Perda diária máxima da firma (%)
input double         InpMaxLossPct     = 10.0;     // Perda total máxima da firma (%)
input double         InpBufferPct      = 1.0;      // Margem de segurança (%): pára antes do limite
input double         InpTargetPct      = 0.0;      // Meta de lucro (%) - pára ao atingir (0 = desligado)
input bool           InpDailyOnEquity  = true;     // Base diária = máx(saldo, equity) (mais seguro)
input int            InpDayResetHour   = 0;        // Hora do servidor em que o dia da firma reinicia

//--- Execução
input group "=== Execução ==="
input double         InpMaxSpreadAtr   = 0.15;     // Spread máximo (fração do ATR) para abrir
input int            InpSlippagePts    = 30;       // Desvio máximo (pontos)
input bool           InpNewsFilter     = false;    // Filtro de notícias de alto impacto (calendário MT5)
input int            InpNewsMinutes    = 30;       // Minutos antes/depois da notícia sem novas entradas
input bool           InpVerbose        = true;     // Registos detalhados no diário

//+------------------------------------------------------------------+
CTrade   g_trade;
string   g_syms[];
datetime g_lastBar[];
int      g_nsym = 0;
double   g_initial = 0;
datetime g_dayStart = 0;
double   g_dayBase = 0;
bool     g_haltDay = false;
bool     g_haltAll = false;
string   g_gv;

//+------------------------------------------------------------------+
//| Indicadores (mesmas fórmulas que research/indicators.py)         |
//| Os arrays de MqlRates vêm em ordem cronológica (0 = mais antiga). |
//+------------------------------------------------------------------+
double CalcEMA(const MqlRates &r[], int n, int len, int upto)
  {
   // EMA semeada com SMA das primeiras `len` barras da janela
   if(upto < len) return EMPTY_VALUE;
   double a = 2.0 / (len + 1.0), s = 0;
   for(int i = 0; i < len; i++) s += r[i].close;
   double v = s / len;
   for(int i = len; i <= upto; i++) v = a * r[i].close + (1 - a) * v;
   return v;
  }

double CalcATR(const MqlRates &r[], int n, int len, int upto)
  {
   // ATR de Wilder, semente = média simples dos primeiros `len` TR
   if(upto < len) return EMPTY_VALUE;
   double s = r[0].high - r[0].low;
   for(int i = 1; i < len; i++)
      s += MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i-1].close), MathAbs(r[i].low - r[i-1].close)));
   double v = s / len;
   for(int i = len; i <= upto; i++)
     {
      double tr = MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i-1].close), MathAbs(r[i].low - r[i-1].close)));
      v = (v * (len - 1) + tr) / len;
     }
   return v;
  }

//+------------------------------------------------------------------+
int ServerHour(datetime t) { MqlDateTime d; TimeToStruct(t + InpHourShift * 3600, d); return d.hour; }
int ServerDow(datetime t)  { MqlDateTime d; TimeToStruct(t + InpHourShift * 3600, d); return d.day_of_week; }

datetime FirmDayStart(datetime t)
  {
   MqlDateTime d; TimeToStruct(t - InpDayResetHour * 3600, d);
   d.hour = 0; d.min = 0; d.sec = 0;
   return StructToTime(d) + InpDayResetHour * 3600;
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   if(Period() != PERIOD_H1)
      Print("Aviso: a estratégia usa sempre barras H1 internamente; o timeframe da carta não importa.");
   string parts[];
   int n = StringSplit(InpSymbols, ',', parts);
   ArrayResize(g_syms, 0);
   for(int i = 0; i < n; i++)
     {
      string s = parts[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(s == "") continue;
      s = s + InpSuffix;
      if(!SymbolSelect(s, true))
        { PrintFormat("Símbolo %s não existe neste broker - ignorado. Verifique o sufixo.", s); continue; }
      int k = ArraySize(g_syms);
      ArrayResize(g_syms, k + 1);
      g_syms[k] = s;
     }
   g_nsym = ArraySize(g_syms);
   if(g_nsym == 0) { Print("Nenhum símbolo válido."); return INIT_PARAMETERS_INCORRECT; }
   ArrayResize(g_lastBar, g_nsym);
   ArrayInitialize(g_lastBar, 0);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpSlippagePts);
   g_trade.SetAsyncMode(false);

   // estado persistente (sobrevive a reinícios do terminal/EA)
   g_gv = "TBP_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(InpMagic) + "_";
   if(InpInitialBalance > 0) g_initial = InpInitialBalance;
   else if(GlobalVariableCheck(g_gv + "init")) g_initial = GlobalVariableGet(g_gv + "init");
   else { g_initial = AccountInfoDouble(ACCOUNT_BALANCE); GlobalVariableSet(g_gv + "init", g_initial); }
   g_haltAll = GlobalVariableCheck(g_gv + "halt") && GlobalVariableGet(g_gv + "halt") > 0;
   if(GlobalVariableCheck(g_gv + "day") && (datetime)GlobalVariableGet(g_gv + "day") == FirmDayStart(TimeCurrent()))
     {
      g_dayStart = (datetime)GlobalVariableGet(g_gv + "day");
      g_dayBase  = GlobalVariableGet(g_gv + "base");
      g_haltDay  = GlobalVariableCheck(g_gv + "haltday") && GlobalVariableGet(g_gv + "haltday") > 0;
     }
   PrintFormat("TrendBreakoutPro iniciado: %d símbolos, risco %.2f%%, saldo inicial de referência %.2f%s",
               g_nsym, InpRiskPct, g_initial, g_haltAll ? " [PARADO: limite/meta atingido anteriormente]" : "");
   EventSetTimer(1);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick()  { Process(); }
void OnTimer() { Process(); }

//+------------------------------------------------------------------+
//| Proteção de conta                                                |
//+------------------------------------------------------------------+
bool GuardOk()
  {
   datetime ds = FirmDayStart(TimeCurrent());
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   if(ds != g_dayStart)
     {
      g_dayStart = ds;
      g_dayBase  = InpDailyOnEquity ? MathMax(bal, eq) : bal;
      g_haltDay  = false;
      GlobalVariableSet(g_gv + "day", (double)ds);
      GlobalVariableSet(g_gv + "base", g_dayBase);
      GlobalVariableSet(g_gv + "haltday", 0);
     }
   double dailyFloor = g_dayBase - g_initial * (InpDailyLossPct - InpBufferPct) / 100.0;
   double totalFloor = g_initial * (1.0 - (InpMaxLossPct - InpBufferPct) / 100.0);
   if(!g_haltDay && eq <= dailyFloor)
     {
      g_haltDay = true; GlobalVariableSet(g_gv + "haltday", 1);
      PrintFormat("PROTEÇÃO: limite diário de segurança atingido (equity %.2f <= %.2f). Fecha tudo e pára até ao próximo dia.", eq, dailyFloor);
     }
   if(!g_haltAll && eq <= totalFloor)
     {
      g_haltAll = true; GlobalVariableSet(g_gv + "halt", 1);
      PrintFormat("PROTEÇÃO: limite total de segurança atingido (equity %.2f <= %.2f). EA desligado.", eq, totalFloor);
     }
   if(!g_haltAll && InpTargetPct > 0 && eq >= g_initial * (1.0 + InpTargetPct / 100.0))
     {
      g_haltAll = true; GlobalVariableSet(g_gv + "halt", 1);
      PrintFormat("META atingida (equity %.2f). Fecha tudo e pára. Apague a variável global %shalt para recomeçar.", eq, g_gv);
     }
   if(g_haltDay || g_haltAll) { CloseAll("proteção"); return false; }
   return true;
  }

// Perda que ainda podemos sofrer antes da margem de segurança (para nunca arriscar mais do que isso)
double RoomLeft()
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double d = eq - (g_dayBase - g_initial * (InpDailyLossPct - InpBufferPct) / 100.0);
   double t = eq - g_initial * (1.0 - (InpMaxLossPct - InpBufferPct) / 100.0);
   return MathMax(0.0, MathMin(d, t));
  }

//+------------------------------------------------------------------+
//| Posições                                                         |
//+------------------------------------------------------------------+
int CountOpen()
  {
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic) c++;
     }
   return c;
  }

// devolve +1/-1/0 e o ticket da posição do EA neste símbolo
int PosDir(const string sym, ulong &ticket)
  {
   ticket = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic || PositionGetString(POSITION_SYMBOL) != sym) continue;
      ticket = tk;
      return PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
     }
   return 0;
  }

void CloseAll(const string why)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      g_trade.SetTypeFillingBySymbol(PositionGetString(POSITION_SYMBOL));
      for(int k = 0; k < 3; k++)
        {
         if(g_trade.PositionClose(tk)) break;
         Sleep(250);
        }
      if(InpVerbose) PrintFormat("Fechada posição %I64u (%s)", tk, why);
     }
  }

//+------------------------------------------------------------------+
//| Dimensionamento                                                  |
//+------------------------------------------------------------------+
double LotsForRisk(const string sym, double money, double sl_dist)
  {
   if(sl_dist <= 0 || money <= 0) return 0;
   double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0) tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double ts   = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   if(tv <= 0 || ts <= 0 || step <= 0) return 0;
   double lots = money / (sl_dist / ts * tv);
   lots = MathFloor(lots / step + 1e-9) * step;   // arredonda SEMPRE para baixo
   if(lots < vmin) return 0;                      // nunca arrisca mais do que o pedido
   return NormalizeDouble(MathMin(lots, vmax), 8);
  }

double RiskMoney()
  {
   double base = g_initial;
   if(InpRiskBase == RISK_BALANCE) base = AccountInfoDouble(ACCOUNT_BALANCE);
   if(InpRiskBase == RISK_EQUITY)  base = AccountInfoDouble(ACCOUNT_EQUITY);
   double m = base * InpRiskPct / 100.0;
   return MathMin(m, RoomLeft() * 0.9);   // nunca arrisca a perda que resta até ao limite
  }

//+------------------------------------------------------------------+
//| Filtro de notícias (calendário económico do MT5)                 |
//+------------------------------------------------------------------+
bool NewsBlocked(const string sym)
  {
   if(!InpNewsFilter || MQLInfoInteger(MQL_TESTER)) return false;
   string c1 = SymbolInfoString(sym, SYMBOL_CURRENCY_BASE), c2 = SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT);
   datetime now = TimeTradeServer();
   MqlCalendarValue vals[];
   if(CalendarValueHistory(vals, now - InpNewsMinutes * 60, now + InpNewsMinutes * 60) <= 0) return false;
   for(int i = 0; i < ArraySize(vals); i++)
     {
      MqlCalendarEvent ev; MqlCalendarCountry co;
      if(!CalendarEventById(vals[i].event_id, ev)) continue;
      if(ev.importance != CALENDAR_IMPORTANCE_HIGH) continue;
      if(!CalendarCountryById(ev.country_id, co)) continue;
      if(co.currency == c1 || co.currency == c2 || (co.currency == "USD" && StringFind(sym, "XAU") >= 0))
         return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Envio de ordens                                                  |
//+------------------------------------------------------------------+
bool Open(const string sym, int dir, double sl_dist)
  {
   double money = RiskMoney();
   double lots  = LotsForRisk(sym, money, sl_dist);
   if(lots <= 0)
     {
      if(InpVerbose) PrintFormat("%s: lote calculado abaixo do mínimo (risco %.2f, stop %.5f) - sem entrada.", sym, money, sl_dist);
      return false;
     }
   g_trade.SetTypeFillingBySymbol(sym);
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   double minDist = (SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) + 2) * pt;
   if(sl_dist < minDist) sl_dist = minDist;
   for(int k = 0; k < 3; k++)
     {
      MqlTick tk; if(!SymbolInfoTick(sym, tk)) { Sleep(200); continue; }
      double sl = (dir == 1) ? tk.ask - sl_dist : tk.bid + sl_dist;
      sl = NormalizeDouble(sl, digits);
      bool ok = (dir == 1) ? g_trade.Buy(lots, sym, 0, sl, 0, "TBP")
                           : g_trade.Sell(lots, sym, 0, sl, 0, "TBP");
      uint rc = g_trade.ResultRetcode();
      if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
        {
         if(InpVerbose) PrintFormat("%s %s %.2f lotes @ %.5f SL %.5f (risco %.2f)", dir == 1 ? "COMPRA" : "VENDA", sym, lots,
                                    g_trade.ResultPrice(), sl, money);
         return true;
        }
      PrintFormat("%s: envio falhou (%u %s), tentativa %d", sym, rc, g_trade.ResultRetcodeDescription(), k + 1);
      if(rc != TRADE_RETCODE_REQUOTE && rc != TRADE_RETCODE_PRICE_OFF && rc != TRADE_RETCODE_PRICE_CHANGED &&
         rc != TRADE_RETCODE_CONNECTION && rc != TRADE_RETCODE_TIMEOUT && rc != TRADE_RETCODE_TOO_MANY_REQUESTS)
         return false;
      Sleep(300);
     }
   return false;
  }

void Trail(const string sym, ulong ticket, int dir, const MqlRates &r[], int last, double atr)
  {
   if(InpTrailAtr <= 0 || !PositionSelectByTicket(ticket)) return;
   datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
   double cur_sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   double open_px = PositionGetDouble(POSITION_PRICE_OPEN);
   // melhor preço desde a entrada, usando as barras fechadas (incluindo a barra de entrada)
   double best = open_px;
   datetime entryBar = (datetime)((long)opened - ((long)opened % 3600));
   double spread = SymbolInfoDouble(sym, SYMBOL_ASK) - SymbolInfoDouble(sym, SYMBOL_BID);
   for(int i = last; i >= 0 && r[i].time >= entryBar; i--)
     {
      if(dir == 1) best = MathMax(best, r[i].high);
      else         best = MathMin(best, r[i].low + spread);
     }
   double ns = (dir == 1) ? best - InpTrailAtr * atr : best + InpTrailAtr * atr;
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   ns = NormalizeDouble(ns, digits);
   bool better = (dir == 1) ? (cur_sl == 0 || ns > cur_sl) : (cur_sl == 0 || ns < cur_sl);
   if(!better) return;
   MqlTick tk; if(!SymbolInfoTick(sym, tk)) return;
   double minDist = (SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) + 1) * SymbolInfoDouble(sym, SYMBOL_POINT);
   if(dir == 1 && tk.bid - ns < minDist) return;
   if(dir == -1 && ns - tk.ask < minDist) return;
   if(g_trade.PositionModify(ticket, ns, tp) && InpVerbose)
      PrintFormat("%s trailing: SL %.5f -> %.5f", sym, cur_sl, ns);
  }

//+------------------------------------------------------------------+
//| Ciclo principal                                                  |
//+------------------------------------------------------------------+
void Process()
  {
   static bool busy = false;
   if(busy) return;
   busy = true;
   bool canTrade = GuardOk();
   if(!g_haltAll && !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && !MQLInfoInteger(MQL_TESTER))
      canTrade = false;
   for(int k = 0; k < g_nsym; k++)
      ProcessSymbol(k, canTrade);
   busy = false;
  }

void ProcessSymbol(int k, bool canTrade)
  {
   string sym = g_syms[k];
   datetime bar0 = iTime(sym, PERIOD_H1, 0);
   if(bar0 == 0 || bar0 == g_lastBar[k]) return;        // só atua uma vez por nova barra H1

   int need = MathMax(InpEmaLen, InpBreakBars) + 1000;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(sym, PERIOD_H1, 1, need, r);       // só barras FECHADAS
   if(got < MathMax(InpEmaLen, InpBreakBars) + InpAtrLen + 50)
     {
      // pede o histórico ao servidor e tenta de novo na próxima barra (evita spam no diário)
      g_lastBar[k] = bar0;
      PrintFormat("%s: histórico H1 insuficiente (%d barras) - a descarregar, volta a tentar na próxima barra.", sym, got);
      return;
     }
   g_lastBar[k] = bar0;
   int last = got - 1;                                     // última barra fechada (sinal)
   double close1 = r[last].close;
   double atr = CalcATR(r, got, InpAtrLen, last);
   double ema = (InpEmaLen > 0) ? CalcEMA(r, got, InpEmaLen, last) : 0;
   double hh = r[last - 1].high, ll = r[last - 1].low;
   for(int i = last - InpBreakBars; i < last; i++) { hh = MathMax(hh, r[i].high); ll = MathMin(ll, r[i].low); }
   int hr  = ServerHour(r[last].time);
   int dow = ServerDow(r[last].time);

   ulong ticket; int dir = PosDir(sym, ticket);
   g_trade.SetTypeFillingBySymbol(sym);

   // 1) fecho de sexta-feira: a barra que acabou de fechar começou às (FridayHour-1)h
   if(InpFridayFlat && dow == 5 && hr >= InpFridayHour - 1)
     {
      if(dir != 0) { g_trade.PositionClose(ticket); if(InpVerbose) PrintFormat("%s: fecho de sexta-feira.", sym); }
      return;
     }

   // 2) sinal
   int sig = 0;
   bool hoursOk = (hr >= InpHourFrom && hr < InpHourTo);
   bool fridayLate = InpFridayFlat && dow == 5 && hr >= InpFridayHour - 2;
   if(hoursOk && !fridayLate && atr != EMPTY_VALUE && atr > 0)
     {
      if(close1 > hh && (InpEmaLen == 0 || close1 > ema)) sig = 1;
      else if(close1 < ll && (InpEmaLen == 0 || close1 < ema)) sig = -1;
     }

   // 3) sinal contrário: fecha (e inverte abaixo)
   if(dir != 0 && sig != 0 && sig != dir)
     {
      if(!g_trade.PositionClose(ticket))
        { PrintFormat("%s: falhou o fecho por sinal contrário (%u) - tenta na próxima barra.", sym, g_trade.ResultRetcode()); return; }
      if(InpVerbose) PrintFormat("%s: sinal contrário, posição fechada.", sym);
      dir = 0;
     }

   // 4) trailing stop da posição aberta
   if(dir != 0) { Trail(sym, ticket, dir, r, last, atr); return; }

   // 5) nova entrada
   if(sig == 0 || !canTrade) return;
   if(CountOpen() >= InpMaxOpen)
     { if(InpVerbose) PrintFormat("%s: sinal ignorado (já existem %d posições abertas).", sym, InpMaxOpen); return; }
   double spread = SymbolInfoDouble(sym, SYMBOL_ASK) - SymbolInfoDouble(sym, SYMBOL_BID);
   if(spread > InpMaxSpreadAtr * atr)
     { if(InpVerbose) PrintFormat("%s: spread demasiado alto (%.5f > %.5f) - sem entrada.", sym, spread, InpMaxSpreadAtr * atr); return; }
   if(NewsBlocked(sym))
     { if(InpVerbose) PrintFormat("%s: notícia de alto impacto próxima - sem entrada.", sym); return; }
   Open(sym, sig, InpSlAtr * atr);
  }
//+------------------------------------------------------------------+
