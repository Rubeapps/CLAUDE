//+------------------------------------------------------------------+
//| Exec.mqh — dimensionamento por risco e execução robusta          |
//+------------------------------------------------------------------+
#property strict
#include <Trade\Trade.mqh>

// Lote para arriscar `money` com um stop de `sl_dist` (em preço).
double LotsForRisk(const string sym, double money, double sl_dist)
  {
   if(sl_dist <= 0 || money <= 0) return 0.0;
   double tick_val  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tick_val <= 0) tick_val = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double tick_size = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   if(tick_val <= 0 || tick_size <= 0 || step <= 0) return 0.0;
   double loss_per_lot = sl_dist / tick_size * tick_val;
   // inclui a comissão estimada por lote (ida+volta) no risco
   double lots = money / loss_per_lot;
   lots = MathFloor(lots / step) * step;          // arredonda SEMPRE para baixo
   if(lots < vmin) return 0.0;                     // nunca arrisca mais do que o pedido
   return MathMin(lots, vmax);
  }

ENUM_ORDER_TYPE_FILLING FillingFor(const string sym)
  {
   long f = SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   if((f & SYMBOL_FILLING_FOK) != 0) return ORDER_FILLING_FOK;
   if((f & SYMBOL_FILLING_IOC) != 0) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
  }

// Garante que SL/TP respeitam o stops level do broker.
bool StopsOk(const string sym, double price, double sl, double tp)
  {
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   long lvl = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
   double min_d = (lvl + 1) * pt;
   if(sl > 0 && MathAbs(price - sl) < min_d) return false;
   if(tp > 0 && MathAbs(price - tp) < min_d) return false;
   return true;
  }

bool SendWithRetry(CTrade &trade, ENUM_ORDER_TYPE type, const string sym, double lots,
                   double sl, double tp, const string comment, int retries = 3)
  {
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   for(int k = 0; k < retries; k++)
     {
      MqlTick tk; if(!SymbolInfoTick(sym, tk)) { Sleep(200); continue; }
      double price = (type == ORDER_TYPE_BUY) ? tk.ask : tk.bid;
      double s = NormalizeDouble(sl, digits), t = (tp > 0 ? NormalizeDouble(tp, digits) : 0.0);
      if(!StopsOk(sym, price, s, t)) { Print("Exec: SL/TP demasiado perto (stops level)."); return false; }
      bool ok = (type == ORDER_TYPE_BUY) ? trade.Buy(lots, sym, 0, s, t, comment)
                                         : trade.Sell(lots, sym, 0, s, t, comment);
      uint rc = trade.ResultRetcode();
      if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
         return true;
      PrintFormat("Exec: falhou envio (%u %s), tentativa %d", rc, trade.ResultRetcodeDescription(), k + 1);
      if(rc == TRADE_RETCODE_REQUOTE || rc == TRADE_RETCODE_PRICE_OFF || rc == TRADE_RETCODE_PRICE_CHANGED ||
         rc == TRADE_RETCODE_CONNECTION || rc == TRADE_RETCODE_TIMEOUT || rc == TRADE_RETCODE_TOO_MANY_REQUESTS)
        { Sleep(300); continue; }
      return false;
     }
   return false;
  }

bool ModifySL(CTrade &trade, ulong ticket, const string sym, double new_sl, double tp)
  {
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   MqlTick tk; if(!SymbolInfoTick(sym, tk)) return false;
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   double min_d = (SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) + 1) * pt;
   if(!PositionSelectByTicket(ticket)) return false;
   long ptype = PositionGetInteger(POSITION_TYPE);
   if(ptype == POSITION_TYPE_BUY && tk.bid - new_sl < min_d) return false;
   if(ptype == POSITION_TYPE_SELL && new_sl - tk.ask < min_d) return false;
   return trade.PositionModify(ticket, NormalizeDouble(new_sl, digits), tp);
  }
