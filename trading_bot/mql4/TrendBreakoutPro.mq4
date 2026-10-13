//+------------------------------------------------------------------+
//|                                          TrendBreakoutPro.mq4    |
//|  Versão MetaTrader 4 — mesma estratégia e proteção do .mq5       |
//|  (sem filtro de notícias: o MT4 não tem calendário económico)    |
//|  Ver explicação completa no ficheiro .mq5 e no README.           |
//+------------------------------------------------------------------+
#property copyright "TrendBreakoutPro"
#property version   "1.00"
#property strict

enum ENUM_RISK_BASE { RISK_INITIAL = 0, RISK_BALANCE = 1, RISK_EQUITY = 2 };

extern string         InpSymbols        = "XAUUSD,GBPJPY,AUDJPY,USDJPY,EURJPY"; // Símbolos
extern string         InpSuffix         = "";       // Sufixo do broker
extern double         InpRiskPct        = 0.30;     // Risco por trade (%)
extern ENUM_RISK_BASE InpRiskBase       = RISK_INITIAL;
extern int            InpMaxOpen        = 2;        // Máximo de posições abertas
extern int            InpMagic          = 550200;
extern int            InpBreakBars      = 55;
extern int            InpEmaLen         = 200;
extern int            InpAtrLen         = 20;
extern double         InpSlAtr          = 2.0;
extern double         InpTrailAtr       = 5.0;
extern int            InpHourFrom       = 8;
extern int            InpHourTo         = 22;
extern bool           InpFridayFlat     = true;
extern int            InpFridayHour     = 22;
extern int            InpHourShift      = 0;
extern double         InpInitialBalance = 0;
extern double         InpDailyLossPct   = 5.0;
extern double         InpMaxLossPct     = 10.0;
extern double         InpBufferPct      = 1.0;
extern double         InpTargetPct      = 0.0;
extern bool           InpDailyOnEquity  = true;
extern int            InpDayResetHour   = 0;
extern double         InpMaxSpreadAtr   = 0.15;
extern int            InpSlippagePts    = 30;
extern bool           InpVerbose        = true;

string   g_syms[];
datetime g_lastBar[];
int      g_nsym = 0;
double   g_initial = 0;
datetime g_dayStart = 0;
double   g_dayBase = 0;
bool     g_haltDay = false, g_haltAll = false;
string   g_gv;

//+------------------------------------------------------------------+
int ServerHour(datetime t) { return TimeHour(t + InpHourShift * 3600); }
int ServerDow(datetime t)  { return TimeDayOfWeek(t + InpHourShift * 3600); }
datetime FirmDayStart(datetime t)
  {
   datetime x = t - InpDayResetHour * 3600;
   return (datetime)((long)x - ((long)x % 86400) + InpDayResetHour * 3600);
  }

int OnInit()
  {
   string parts[];
   int n = StringSplit(InpSymbols, ',', parts);
   ArrayResize(g_syms, 0);
   for(int i = 0; i < n; i++)
     {
      string s = StringTrimRight(StringTrimLeft(parts[i]));
      if(s == "") continue;
      s = s + InpSuffix;
      if(!SymbolSelect(s, true)) { PrintFormat("Símbolo %s inexistente - ignorado.", s); continue; }
      int k = ArraySize(g_syms); ArrayResize(g_syms, k + 1); g_syms[k] = s;
     }
   g_nsym = ArraySize(g_syms);
   if(g_nsym == 0) return INIT_PARAMETERS_INCORRECT;
   ArrayResize(g_lastBar, g_nsym); ArrayInitialize(g_lastBar, 0);
   g_gv = "TBP_" + IntegerToString(AccountNumber()) + "_" + IntegerToString(InpMagic) + "_";
   if(InpInitialBalance > 0) g_initial = InpInitialBalance;
   else if(GlobalVariableCheck(g_gv + "init")) g_initial = GlobalVariableGet(g_gv + "init");
   else { g_initial = AccountBalance(); GlobalVariableSet(g_gv + "init", g_initial); }
   g_haltAll = GlobalVariableCheck(g_gv + "halt") && GlobalVariableGet(g_gv + "halt") > 0;
   if(GlobalVariableCheck(g_gv + "day") && (datetime)GlobalVariableGet(g_gv + "day") == FirmDayStart(TimeCurrent()))
     {
      g_dayStart = (datetime)GlobalVariableGet(g_gv + "day");
      g_dayBase  = GlobalVariableGet(g_gv + "base");
      g_haltDay  = GlobalVariableCheck(g_gv + "haltday") && GlobalVariableGet(g_gv + "haltday") > 0;
     }
   EventSetTimer(1);
   PrintFormat("TrendBreakoutPro (MT4): %d símbolos, risco %.2f%%, saldo de referência %.2f", g_nsym, InpRiskPct, g_initial);
   return INIT_SUCCEEDED;
  }
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick()  { Process(); }
void OnTimer() { Process(); }

//+------------------------------------------------------------------+
bool GuardOk()
  {
   datetime ds = FirmDayStart(TimeCurrent());
   double bal = AccountBalance(), eq = AccountEquity();
   if(ds != g_dayStart)
     {
      g_dayStart = ds; g_dayBase = InpDailyOnEquity ? MathMax(bal, eq) : bal; g_haltDay = false;
      GlobalVariableSet(g_gv + "day", (double)ds); GlobalVariableSet(g_gv + "base", g_dayBase);
      GlobalVariableSet(g_gv + "haltday", 0);
     }
   double dailyFloor = g_dayBase - g_initial * (InpDailyLossPct - InpBufferPct) / 100.0;
   double totalFloor = g_initial * (1.0 - (InpMaxLossPct - InpBufferPct) / 100.0);
   if(!g_haltDay && eq <= dailyFloor)
     { g_haltDay = true; GlobalVariableSet(g_gv + "haltday", 1); PrintFormat("PROTEÇÃO diária: equity %.2f <= %.2f", eq, dailyFloor); }
   if(!g_haltAll && eq <= totalFloor)
     { g_haltAll = true; GlobalVariableSet(g_gv + "halt", 1); PrintFormat("PROTEÇÃO total: equity %.2f <= %.2f", eq, totalFloor); }
   if(!g_haltAll && InpTargetPct > 0 && eq >= g_initial * (1.0 + InpTargetPct / 100.0))
     { g_haltAll = true; GlobalVariableSet(g_gv + "halt", 1); PrintFormat("META atingida: equity %.2f", eq); }
   if(g_haltDay || g_haltAll) { CloseAll(); return false; }
   return true;
  }

double RoomLeft()
  {
   double eq = AccountEquity();
   double d = eq - (g_dayBase - g_initial * (InpDailyLossPct - InpBufferPct) / 100.0);
   double t = eq - g_initial * (1.0 - (InpMaxLossPct - InpBufferPct) / 100.0);
   return MathMax(0.0, MathMin(d, t));
  }

int CountOpen()
  {
   int c = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES) && OrderMagicNumber() == InpMagic && OrderType() <= OP_SELL) c++;
   return c;
  }

int PosDir(string sym, int &ticket)
  {
   ticket = -1;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != InpMagic || OrderSymbol() != sym || OrderType() > OP_SELL) continue;
      ticket = OrderTicket();
      return OrderType() == OP_BUY ? 1 : -1;
     }
   return 0;
  }

bool ClosePos(int ticket)
  {
   for(int k = 0; k < 3; k++)
     {
      if(!OrderSelect(ticket, SELECT_BY_TICKET)) return false;
      RefreshRates();
      double px = OrderType() == OP_BUY ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
      if(OrderClose(ticket, OrderLots(), px, InpSlippagePts, clrNONE)) return true;
      Sleep(300);
     }
   PrintFormat("Falhou fecho do ticket %d (erro %d)", ticket, GetLastError());
   return false;
  }

void CloseAll()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES) && OrderMagicNumber() == InpMagic && OrderType() <= OP_SELL)
         ClosePos(OrderTicket());
  }

double LotsForRisk(string sym, double money, double sl_dist)
  {
   if(sl_dist <= 0 || money <= 0) return 0;
   double tv = MarketInfo(sym, MODE_TICKVALUE), ts = MarketInfo(sym, MODE_TICKSIZE);
   double step = MarketInfo(sym, MODE_LOTSTEP), vmin = MarketInfo(sym, MODE_MINLOT), vmax = MarketInfo(sym, MODE_MAXLOT);
   if(tv <= 0 || ts <= 0 || step <= 0) return 0;
   double lots = MathFloor(money / (sl_dist / ts * tv) / step + 1e-9) * step;
   if(lots < vmin) return 0;
   return NormalizeDouble(MathMin(lots, vmax), 2);
  }

double RiskMoney()
  {
   double base = g_initial;
   if(InpRiskBase == RISK_BALANCE) base = AccountBalance();
   if(InpRiskBase == RISK_EQUITY)  base = AccountEquity();
   return MathMin(base * InpRiskPct / 100.0, RoomLeft() * 0.9);
  }

//+------------------------------------------------------------------+
// Indicadores com barras em série (índice 1 = última fechada), mesmas fórmulas do .mq5
double CalcEMA(string sym, int oldest, int len)
  {
   double a = 2.0 / (len + 1.0), s = 0;
   for(int i = oldest; i > oldest - len; i--) s += iClose(sym, PERIOD_H1, i);
   double v = s / len;
   for(int i = oldest - len; i >= 1; i--) v = a * iClose(sym, PERIOD_H1, i) + (1 - a) * v;
   return v;
  }

double TR(string sym, int i)
  {
   double h = iHigh(sym, PERIOD_H1, i), l = iLow(sym, PERIOD_H1, i), pc = iClose(sym, PERIOD_H1, i + 1);
   return MathMax(h - l, MathMax(MathAbs(h - pc), MathAbs(l - pc)));
  }

double CalcATR(string sym, int oldest, int len)
  {
   double s = iHigh(sym, PERIOD_H1, oldest) - iLow(sym, PERIOD_H1, oldest);
   for(int i = oldest - 1; i > oldest - len; i--) s += TR(sym, i);
   double v = s / len;
   for(int i = oldest - len; i >= 1; i--) v = (v * (len - 1) + TR(sym, i)) / len;
   return v;
  }

//+------------------------------------------------------------------+
void Process()
  {
   bool canTrade = GuardOk() && IsTradeAllowed();
   for(int k = 0; k < g_nsym; k++) ProcessSymbol(k, canTrade);
  }

void ProcessSymbol(int k, bool canTrade)
  {
   string sym = g_syms[k];
   datetime bar0 = iTime(sym, PERIOD_H1, 0);
   if(bar0 == 0 || bar0 == g_lastBar[k]) return;
   int need = MathMax(InpEmaLen, InpBreakBars) + 1000;
   if(iBars(sym, PERIOD_H1) < need + 2) { if(InpVerbose) PrintFormat("%s: histórico H1 insuficiente.", sym); return; }
   g_lastBar[k] = bar0;
   int oldest = need;                        // janela = barras [need .. 1], igual ao .mq5
   double close1 = iClose(sym, PERIOD_H1, 1);
   double atr = CalcATR(sym, oldest, InpAtrLen);
   double ema = InpEmaLen > 0 ? CalcEMA(sym, oldest, InpEmaLen) : 0;
   double hh = iHigh(sym, PERIOD_H1, iHighest(sym, PERIOD_H1, MODE_HIGH, InpBreakBars, 2));
   double ll = iLow(sym, PERIOD_H1, iLowest(sym, PERIOD_H1, MODE_LOW, InpBreakBars, 2));
   datetime t1 = iTime(sym, PERIOD_H1, 1);
   int hr = ServerHour(t1), dow = ServerDow(t1);
   int ticket; int dir = PosDir(sym, ticket);

   if(InpFridayFlat && dow == 5 && hr >= InpFridayHour - 1)
     { if(dir != 0) ClosePos(ticket); return; }

   int sig = 0;
   bool fridayLate = InpFridayFlat && dow == 5 && hr >= InpFridayHour - 2;
   if(hr >= InpHourFrom && hr < InpHourTo && !fridayLate && atr > 0)
     {
      if(close1 > hh && (InpEmaLen == 0 || close1 > ema)) sig = 1;
      else if(close1 < ll && (InpEmaLen == 0 || close1 < ema)) sig = -1;
     }
   if(dir != 0 && sig != 0 && sig != dir) { if(!ClosePos(ticket)) return; dir = 0; }

   if(dir != 0)
     {
      // trailing chandelier
      if(InpTrailAtr <= 0 || !OrderSelect(ticket, SELECT_BY_TICKET)) return;
      datetime entryBar = (datetime)((long)OrderOpenTime() - ((long)OrderOpenTime() % 3600));
      double best = OrderOpenPrice();
      double spread = MarketInfo(sym, MODE_ASK) - MarketInfo(sym, MODE_BID);
      for(int i = 1; i < 5000 && iTime(sym, PERIOD_H1, i) >= entryBar; i++)
        {
         if(dir == 1) best = MathMax(best, iHigh(sym, PERIOD_H1, i));
         else         best = MathMin(best, iLow(sym, PERIOD_H1, i) + spread);
        }
      int digits = (int)MarketInfo(sym, MODE_DIGITS);
      double ns = NormalizeDouble(dir == 1 ? best - InpTrailAtr * atr : best + InpTrailAtr * atr, digits);
      double cur = OrderStopLoss();
      double minD = (MarketInfo(sym, MODE_STOPLEVEL) + 1) * MarketInfo(sym, MODE_POINT);
      bool better = dir == 1 ? (cur == 0 || ns > cur) : (cur == 0 || ns < cur);
      if(better && ((dir == 1 && MarketInfo(sym, MODE_BID) - ns >= minD) || (dir == -1 && ns - MarketInfo(sym, MODE_ASK) >= minD)))
         if(OrderModify(ticket, OrderOpenPrice(), ns, OrderTakeProfit(), 0, clrNONE) && InpVerbose)
            PrintFormat("%s trailing: %.5f -> %.5f", sym, cur, ns);
      return;
     }

   if(sig == 0 || !canTrade) return;
   if(CountOpen() >= InpMaxOpen) { if(InpVerbose) PrintFormat("%s: sinal ignorado (limite de posições).", sym); return; }
   double spr = MarketInfo(sym, MODE_ASK) - MarketInfo(sym, MODE_BID);
   if(spr > InpMaxSpreadAtr * atr) { if(InpVerbose) PrintFormat("%s: spread alto - sem entrada.", sym); return; }
   double sl_dist = InpSlAtr * atr;
   double minDist = (MarketInfo(sym, MODE_STOPLEVEL) + 2) * MarketInfo(sym, MODE_POINT);
   if(sl_dist < minDist) sl_dist = minDist;
   double money = RiskMoney(), lots = LotsForRisk(sym, money, sl_dist);
   if(lots <= 0) { if(InpVerbose) PrintFormat("%s: lote abaixo do mínimo.", sym); return; }
   int digits = (int)MarketInfo(sym, MODE_DIGITS);
   for(int t = 0; t < 3; t++)
     {
      RefreshRates();
      double ask = MarketInfo(sym, MODE_ASK), bid = MarketInfo(sym, MODE_BID);
      double px = sig == 1 ? ask : bid;
      double sl = NormalizeDouble(sig == 1 ? ask - sl_dist : bid + sl_dist, digits);
      int tk = OrderSend(sym, sig == 1 ? OP_BUY : OP_SELL, lots, px, InpSlippagePts, sl, 0, "TBP", InpMagic, 0, clrNONE);
      if(tk > 0) { if(InpVerbose) PrintFormat("%s %s %.2f @ %.5f SL %.5f", sig == 1 ? "COMPRA" : "VENDA", sym, lots, px, sl); return; }
      int err = GetLastError();
      PrintFormat("%s: OrderSend falhou (erro %d), tentativa %d", sym, err, t + 1);
      if(err != 135 && err != 136 && err != 138 && err != 146 && err != 129) return;   // requote/preço/ocupado
      Sleep(300);
     }
  }
//+------------------------------------------------------------------+
