//+------------------------------------------------------------------+
//| PropGuard.mqh — proteção de conta para prop firms (FTMO e afins) |
//|  * perda diária máxima (equity vs. base do dia, como a FTMO)     |
//|  * perda total máxima (estática, sobre o saldo inicial)          |
//|  * objetivo de lucro (pára de operar ao atingir a meta)          |
//|  * margens de segurança configuráveis (buffer)                   |
//| A verificação usa EQUITY (inclui flutuante), em cada tick.       |
//+------------------------------------------------------------------+
#property strict

class CPropGuard
  {
private:
   double   m_initial;        // saldo inicial da conta/desafio
   double   m_daily_pct;      // limite diário da firma (%)
   double   m_total_pct;      // limite total da firma (%)
   double   m_buffer_pct;     // margem: o EA pára ANTES do limite real
   double   m_target_pct;     // 0 = sem meta
   int      m_reset_hour;     // hora do servidor em que o dia da firma reinicia
   double   m_day_base;       // max(saldo, equity) no início do dia
   datetime m_day_start;
   bool     m_halt_day;
   bool     m_halt_all;
   string   m_gv;             // prefixo das variáveis globais (persistência)

   datetime DayStart(datetime t)
     {
      MqlDateTime d; TimeToStruct(t - m_reset_hour * 3600, d);
      d.hour = 0; d.min = 0; d.sec = 0;
      return StructToTime(d) + m_reset_hour * 3600;
     }

public:
   void Init(double initial, double daily_pct, double total_pct, double buffer_pct,
             double target_pct, int reset_hour, long magic)
     {
      m_gv = "PG_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(magic) + "_";
      // saldo inicial: 0 = usar o primeiro saldo visto (guardado em variável global)
      if(initial <= 0)
        {
         if(GlobalVariableCheck(m_gv + "init")) initial = GlobalVariableGet(m_gv + "init");
         else { initial = AccountInfoDouble(ACCOUNT_BALANCE); GlobalVariableSet(m_gv + "init", initial); }
        }
      m_initial    = initial;
      m_daily_pct  = daily_pct;
      m_total_pct  = total_pct;
      m_buffer_pct = buffer_pct;
      m_target_pct = target_pct;
      m_reset_hour = reset_hour;
      m_day_start  = 0;
      m_halt_day   = false;
      m_halt_all   = GlobalVariableCheck(m_gv + "halt") && GlobalVariableGet(m_gv + "halt") > 0;
      // recupera a base do dia se o EA for reiniciado a meio do dia
      if(GlobalVariableCheck(m_gv + "day") && (datetime)GlobalVariableGet(m_gv + "day") == DayStart(TimeCurrent()))
        {
         m_day_start = (datetime)GlobalVariableGet(m_gv + "day");
         m_day_base  = GlobalVariableGet(m_gv + "base");
        }
     }

   double Initial() const { return m_initial; }

   // chamar em cada tick; devolve true se for permitido abrir novas posições
   bool Update()
     {
      datetime now = TimeCurrent();
      datetime ds  = DayStart(now);
      double bal = AccountInfoDouble(ACCOUNT_BALANCE);
      double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
      if(ds != m_day_start)
        {
         m_day_start = ds;
         m_day_base  = MathMax(bal, eq);
         m_halt_day  = false;
         GlobalVariableSet(m_gv + "day", (double)ds);
         GlobalVariableSet(m_gv + "base", m_day_base);
        }
      double daily_floor = m_day_base - m_initial * (m_daily_pct - m_buffer_pct) / 100.0;
      double total_floor = m_initial * (1.0 - (m_total_pct - m_buffer_pct) / 100.0);
      if(eq <= daily_floor && !m_halt_day)
        {
         m_halt_day = true;
         PrintFormat("PropGuard: limite DIÁRIO de segurança atingido (equity %.2f <= %.2f). Fecha tudo e pára até amanhã.", eq, daily_floor);
        }
      if(eq <= total_floor && !m_halt_all)
        {
         m_halt_all = true;
         GlobalVariableSet(m_gv + "halt", 1);
         PrintFormat("PropGuard: limite TOTAL de segurança atingido (equity %.2f <= %.2f). EA desativado.", eq, total_floor);
        }
      if(m_target_pct > 0 && eq >= m_initial * (1.0 + m_target_pct / 100.0) && !m_halt_all)
        {
         m_halt_all = true;
         GlobalVariableSet(m_gv + "halt", 1);
         PrintFormat("PropGuard: META de lucro atingida (equity %.2f). Fecha tudo e pára.", eq);
        }
      return !(m_halt_day || m_halt_all);
     }

   bool MustFlatten() const { return m_halt_day || m_halt_all; }

   // perda ainda disponível hoje/no total (em moeda da conta) — usada para limitar o risco
   double RoomLeft() const
     {
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      double d = eq - (m_day_base - m_initial * (m_daily_pct - m_buffer_pct) / 100.0);
      double t = eq - m_initial * (1.0 - (m_total_pct - m_buffer_pct) / 100.0);
      return MathMax(0.0, MathMin(d, t));
     }

   void ResetHalt() { m_halt_all = false; GlobalVariableDel(m_gv + "halt"); }
  };
