import type { AcademyArea } from "./academy-types";

export const ACADEMY_PART_2: AcademyArea[] = [
  {
    id: "clientes",
    title: "Apoio ao cliente & retenção",
    why: "Um cliente que volta não custa CPA. A retenção transforma uma loja de produtos numa marca com margem.",
    levels: [
      {
        id: "amador",
        mindset: "Responde depressa, reembolsa sem drama e evita que o cliente vá ao banco.",
        principles: [
          "Resposta em menos de 24 h (idealmente menos de 4 h) com tracking e prazo claros.",
          "Reembolsar um cliente irritado é sempre mais barato do que uma disputa: taxa de disputa + valor + risco para a conta.",
          "Tracking enviado por email assim que a encomenda é expedida.",
          "Respostas prontas para as 10 perguntas mais frequentes.",
        ],
        actions: [
          "Escreve as respostas prontas: onde está a encomenda, troca, reembolso, atraso, defeito.",
          "Ativa os emails automáticos de expedição com tracking no Shopify.",
        ],
        metrics: ["Tempo médio de primeira resposta", "Taxa de disputas"],
        sources: [{ who: "Shep Hyken", work: "The Amazement Revolution" }],
      },
      {
        id: "pro",
        mindset: "Fluxos automáticos e LTV: cada cliente vale mais do que a primeira encomenda.",
        principles: [
          "Fluxos essenciais: boas-vindas, carrinho abandonado, checkout abandonado, pós-compra e pedido de avaliação.",
          "NPS: \"de 0 a 10, recomendarias?\". Promotores (9–10) menos detratores (0–6) mostram a saúde da marca (Reichheld).",
          "Análise por coorte: que % dos clientes de cada mês volta a comprar aos 30, 60 e 90 dias.",
          "O pedido de avaliação no momento certo (entrega + 3 dias) alimenta a prova social.",
        ],
        actions: [
          "Configura os fluxos de carrinho abandonado e pós-compra no Shopify Email ou Klaviyo.",
          "Envia um inquérito NPS às últimas 100 encomendas.",
        ],
        metrics: ["LTV a 90 dias", "Taxa de recompra", "NPS", "% receita por email/SMS"],
        sources: [
          { who: "Fred Reichheld", work: "The Ultimate Question" },
          { who: "Chase Dimond", work: "Ecommerce Email Marketing (fluxos)" },
        ],
      },
      {
        id: "goat",
        mindset: "Obsessão pelo cliente: o serviço é o produto e o marketing ao mesmo tempo.",
        principles: [
          "Começa pelo cliente e trabalha para trás; os concorrentes são secundários (Bezos).",
          "Zappos: o apoio ao cliente como departamento de marketing, sem guiões rígidos nem limite de tempo por chamada (Hsieh).",
          "A cadeira vazia: nas reuniões, lembra-te de que o cliente está presente.",
          "Recuperar bem um erro cria mais lealdade do que nunca errar.",
        ],
        actions: [
          "Lê 20 mensagens de clientes por semana, tu próprio, e muda uma coisa por causa delas.",
          "Cria uma política de \"surpresa\": brinde ou upgrade para clientes que tiveram problemas.",
        ],
        metrics: ["Clientes que recomendam espontaneamente", "Taxa de recompra a 12 meses"],
        sources: [
          { who: "Tony Hsieh", work: "Delivering Happiness" },
          { who: "Jeff Bezos", work: "Cartas aos acionistas (customer obsession)" },
          { who: "Will Guidara", work: "Unreasonable Hospitality" },
        ],
      },
    ],
  },
  {
    id: "dados",
    title: "Dados, métricas & tomada de decisão",
    why: "O que não medes, não melhoras. O que medes mal, pioras com confiança.",
    levels: [
      {
        id: "amador",
        mindset: "Olha todos os dias para 5 números e decide com eles, não com a intuição.",
        principles: [
          "5 números diários: faturação, encomendas, ad spend, lucro líquido e ROAS vs. break-even.",
          "O lucro do dia vale mais do que o ROAS do Gestor de Anúncios.",
          "Decisões com pelo menos 3–5 dias de dados, nunca com uma hora de resultados.",
        ],
        actions: [
          "Abre o Dashboard do Apex todos os dias à mesma hora e regista o ad spend.",
          "Define a regra: se o ROAS ficar abaixo do break-even 3 dias seguidos, corta o conjunto de anúncios.",
        ],
        metrics: ["ROAS vs. Break-Even ROAS", "Lucro líquido diário"],
        inApex: "Dashboard e P&L diário.",
        sources: [{ who: "Andy Grove", work: "High Output Management (indicadores)" }],
      },
      {
        id: "pro",
        mindset: "Indicadores preditivos, coortes e incrementalidade: mede o que causa, não só o que acontece.",
        principles: [
          "Indicadores preditivos (hook rate, CTR, adição ao carrinho) mexem antes do lucro: age sobre eles.",
          "MER e contribuição total são mais fiáveis do que a atribuição da plataforma.",
          "Testes de incrementalidade (holdout por região ou por tempo): o anúncio gerou a venda ou ela ia acontecer na mesma?",
          "Lei de Goodhart: quando uma métrica passa a ser objetivo, deixa de ser boa métrica. Mede também o efeito colateral.",
        ],
        actions: [
          "Cria um painel semanal com 3 indicadores preditivos e 2 de atraso.",
          "Pausa os anúncios de uma campanha durante 3 dias e mede a queda real de vendas.",
        ],
        metrics: ["MER", "Hook rate / hold rate", "Conversão por fonte de tráfego"],
        sources: [
          { who: "Avinash Kaushik", work: "Web Analytics 2.0" },
          { who: "Alistair Croll & Benjamin Yoskovitz", work: "Lean Analytics" },
        ],
      },
      {
        id: "goat",
        mindset: "Sistemas de decisão: regras escritas, testadas no passado e revistas quando a realidade muda.",
        principles: [
          "Transforma decisões recorrentes em algoritmos e testa-os com dados históricos antes de os usar (Dalio).",
          "Quando os dados e as histórias dos clientes discordam, normalmente são as histórias que têm razão: investiga a métrica (Bezos).",
          "Pensa em probabilidades e valor esperado, não em certezas (Annie Duke).",
          "Separa a qualidade da decisão da qualidade do resultado: uma boa decisão pode correr mal por azar.",
        ],
        actions: [
          "Escreve um diário de decisões: hipótese, probabilidade estimada e resultado, revisto mensalmente.",
          "Formaliza as 3 regras de corte e escala de anúncios e segue-as durante 30 dias sem exceções.",
        ],
        metrics: ["Taxa de acerto das previsões", "Valor esperado por decisão"],
        sources: [
          { who: "Ray Dalio", work: "Principles" },
          { who: "Annie Duke", work: "Thinking in Bets" },
          { who: "Daniel Kahneman", work: "Thinking, Fast and Slow" },
        ],
      },
    ],
  },
  {
    id: "fiscal",
    title: "Fiscal, legal & conformidade (Portugal / UE)",
    why: "Um problema fiscal ou legal pode apagar anos de lucro. A conformidade é uma barreira contra a falência. Confirma sempre com um contabilista certificado.",
    levels: [
      {
        id: "amador",
        mindset: "Tudo legal desde o primeiro dia: atividade aberta, faturas certificadas, loja conforme.",
        principles: [
          "Abre atividade nas Finanças com o CAE certo (ex.: 47910, comércio a retalho via Internet) e o regime de IVA adequado.",
          "Fatura emitida por software certificado pela AT em cada venda.",
          "Loja online conforme: política de privacidade (RGPD), termos, direito de livre resolução de 14 dias, livro de reclamações eletrónico e informação sobre resolução alternativa de litígios.",
          "Guarda todas as faturas de custos (fornecedor, Meta, Shopify, apps).",
        ],
        actions: [
          "Confirma com o teu contabilista o CAE e o regime de IVA.",
          "Revê se a loja tem os links obrigatórios no rodapé.",
        ],
        metrics: ["% de vendas faturadas", "Faturas de custos em falta"],
        sources: [
          { who: "Autoridade Tributária", work: "Portal das Finanças (início de atividade)" },
          { who: "Direção-Geral do Consumidor", work: "Regras de venda online" },
        ],
      },
      {
        id: "pro",
        mindset: "Domina o IVA europeu e escolhe o regime e a estrutura que te deixam deduzir os custos reais.",
        principles: [
          "OSS: acima de 10.000 €/ano de vendas B2C para outros países da UE, cobras o IVA do país do cliente e declaras no balcão único.",
          "IOSS: envios de fora da UE até 150 € com IVA cobrado no checkout, sem surpresas alfandegárias para o cliente.",
          "No regime simplificado as vendas de mercadorias são tributadas sobre 15% da receita; com ads e COGS altos, a contabilidade organizada ou uma Lda. tende a compensar.",
          "Faturas da Meta, Google e TikTok vêm da Irlanda: tratamento de IVA por autoliquidação conforme o teu enquadramento.",
          "Regista a marca (INPI em Portugal ou EUIPO na UE) antes de investir a sério em branding.",
        ],
        actions: [
          "Pede ao contabilista uma simulação: simplificado vs. organizada vs. Lda. com os teus números reais.",
          "Verifica o total anual de vendas para outros países da UE face ao limiar OSS.",
        ],
        metrics: ["Vendas UE acumuladas vs. 10.000 €", "Taxa efetiva de imposto"],
        inApex: "Playbook → Cofre fiscal e Checklist de conformidade.",
        sources: [
          { who: "Comissão Europeia", work: "VAT e-commerce package (OSS/IOSS)" },
          { who: "INPI / EUIPO", work: "Registo de marca" },
        ],
      },
      {
        id: "goat",
        mindset: "A estrutura jurídica e fiscal é estratégia: protege o património e aumenta o capital que reinvestes.",
        principles: [
          "Separa o risco operacional do património: sociedade operacional e, com escala, holding para reter e reinvestir lucros (com aconselhamento).",
          "Planeamento fiscal legítimo, documentado e com substância. Evasão destrói negócios e reputações.",
          "Propriedade intelectual (marca, domínios, conteúdos, fórmulas) é um ativo do balanço: regista-a e protege-a.",
          "Conformidade como fosso: marketplaces, gateways e parceiros preferem operadores impecáveis.",
        ],
        actions: [
          "Reúne com um contabilista e um advogado para desenhar a estrutura para os próximos 3 anos.",
          "Cria uma pasta de compliance: contratos, marcas, políticas, certificados.",
        ],
        metrics: ["Lucro retido para reinvestimento", "Riscos legais em aberto"],
        sources: [
          { who: "Ordem dos Contabilistas Certificados", work: "Aconselhamento profissional" },
          { who: "Warren Buffett", work: "Cartas (reter e reinvestir lucros)" },
        ],
      },
    ],
  },
  {
    id: "tesouraria",
    title: "Tesouraria, capital & risco",
    why: "Crescer consome caixa. Quem não planeia a liquidez morre de sucesso.",
    levels: [
      {
        id: "amador",
        mindset: "Nunca fiques sem caixa: reserva primeiro, gasta depois.",
        principles: [
          "Colchão de liquidez de pelo menos 20% da faturação dos últimos 30 dias.",
          "Impostos não são teus: guarda o IVA e o IRS/IRC numa conta à parte, à medida que vendes.",
          "Não escales os anúncios mais depressa do que a tua caixa aguenta o atraso do gateway.",
        ],
        actions: [
          "Configura o cofre fiscal do Apex com as tuas taxas.",
          "Abre uma conta poupança só para impostos.",
        ],
        metrics: ["Caixa disponível", "Reserva fiscal acumulada"],
        inApex: "Dashboard → Cofre fiscal; Playbook → Ciclo de conversão de caixa.",
        sources: [{ who: "Mike Michalowicz", work: "Profit First" }],
      },
      {
        id: "pro",
        mindset: "Gere o ciclo de caixa e os riscos dos parceiros de pagamento como um CFO.",
        principles: [
          "Os gateways podem impor reservas de 10%–20% durante 90–180 dias com crescimento rápido: planeia isso.",
          "Diversifica gateways (Shopify Payments, PayPal, Stripe) para não depender de um só.",
          "Negoceia prazos com fornecedores (pagamento a 15–30 dias) à medida que o volume cresce.",
          "Escala o orçamento de anúncios em degraus de 20%–30% para o caixa e o algoritmo acompanharem.",
        ],
        actions: [
          "Simula no Ciclo de caixa o que acontece se as vendas duplicarem amanhã.",
          "Configura um segundo método de pagamento ativo na loja.",
        ],
        metrics: ["Ciclo de conversão de caixa (dias)", "Liquidez necessária vs. disponível"],
        sources: [
          { who: "Verne Harnish", work: "Scaling Up (Cash)" },
          { who: "Stripe", work: "Documentação sobre reservas e disputas" },
        ],
      },
      {
        id: "goat",
        mindset: "Antifrágil: estrutura o negócio para ganhar com o caos, não só para sobreviver.",
        principles: [
          "Estratégia barbell: a maior parte do capital em segurança e uma pequena parte em apostas assimétricas (Taleb).",
          "Evita a ruína a todo o custo: um único evento não pode matar a empresa (ex.: bloqueio de conta, fornecedor único).",
          "Float e capital paciente: dinheiro recebido antes de pagares é a base dos grandes compostos (Buffett).",
          "Margem de segurança em tudo: preços, prazos, stock e caixa (Graham).",
        ],
        actions: [
          "Lista os 5 eventos que poderiam matar o negócio e um plano B para cada um.",
          "Define a regra de alocação: % segura, % reinvestida, % de apostas (War Chest).",
        ],
        metrics: ["Meses de sobrevivência sem vendas", "Exposição máxima a um único parceiro"],
        sources: [
          { who: "Nassim Nicholas Taleb", work: "Antifragile" },
          { who: "Benjamin Graham", work: "The Intelligent Investor (margem de segurança)" },
          { who: "Warren Buffett", work: "Cartas (float)" },
        ],
      },
    ],
  },
  {
    id: "negociacao",
    title: "Negociação & parcerias",
    why: "Cada ponto de margem negociado com fornecedores, agentes ou criadores vai direto para o lucro.",
    levels: [
      {
        id: "amador",
        mindset: "Separa as pessoas do problema e conhece sempre a tua alternativa.",
        principles: [
          "Foca-te nos interesses, não nas posições; cria opções de ganho mútuo; usa critérios objetivos (Fisher & Ury).",
          "BATNA: a tua melhor alternativa sem acordo define o teu poder. Tem sempre um segundo fornecedor em cima da mesa.",
          "Pede sempre: preço, prazo, amostras grátis, embalagem personalizada.",
        ],
        actions: [
          "Pede orçamento a 3 fornecedores para o produto principal antes de renegociar com o atual.",
        ],
        metrics: ["Custo unitário vs. mercado"],
        sources: [{ who: "Roger Fisher & William Ury", work: "Getting to Yes" }],
      },
      {
        id: "pro",
        mindset: "Empatia tática: descobre o que o outro realmente precisa e usa perguntas calibradas.",
        principles: [
          "Espelhar (repetir as últimas palavras) e rotular emoções (\"parece que…\") baixam a defesa do outro (Voss).",
          "Perguntas calibradas (\"como é que eu faria isso?\") põem o outro a resolver o teu problema.",
          "Procura o \"é isso mesmo\", não o \"sim\": o \"sim\" fácil é muitas vezes falso.",
          "Ancora primeiro com um número bem preparado e justificado.",
        ],
        actions: [
          "Prepara a próxima negociação com 3 perguntas calibradas e 3 rótulos.",
        ],
        metrics: ["Poupança anual negociada", "Prazos de pagamento conseguidos"],
        sources: [
          { who: "Chris Voss", work: "Never Split the Difference" },
          { who: "Stuart Diamond", work: "Getting More" },
        ],
      },
      {
        id: "goat",
        mindset: "Desenha incentivos alinhados: o melhor acordo é aquele que o outro quer cumprir.",
        principles: [
          "Mostra-me o incentivo e eu mostro-te o resultado: estrutura comissões e bónus para que o parceiro ganhe quando tu ganhas (Munger).",
          "Jogos repetidos valem mais do que uma vitória: reputação e confiança compõem como juros.",
          "Parcerias de longo prazo com fornecedores-chave (exclusividade, volume garantido) criam vantagem de custo e de prazo.",
        ],
        actions: [
          "Propõe ao fornecedor principal um acordo de volume com preço escalonado e prazo garantido.",
        ],
        metrics: ["Margem bruta ao longo do tempo", "Fiabilidade do fornecedor"],
        sources: [
          { who: "Charlie Munger", work: "The Psychology of Human Misjudgment" },
          { who: "Robert Axelrod", work: "The Evolution of Cooperation" },
        ],
      },
    ],
  },
  {
    id: "fundador",
    title: "Mentalidade & produtividade do fundador",
    why: "Tu és o sistema operativo da empresa. A tua energia, foco e decisões determinam o teto do negócio.",
    levels: [
      {
        id: "amador",
        mindset: "Hábitos pequenos, foco profundo e uma prioridade por dia.",
        principles: [
          "Melhorar 1% por dia compõe: os sistemas vencem os objetivos (Clear).",
          "Trabalho profundo: blocos de 90 minutos sem notificações para o que realmente move o negócio (Newport).",
          "Uma única prioridade por dia: qual é a coisa que torna todas as outras mais fáceis ou desnecessárias? (Keller)",
          "Sono, treino e alimentação são infraestrutura, não luxo.",
        ],
        actions: [
          "Bloqueia 2 horas de trabalho profundo por dia na agenda, de manhã.",
          "Escolhe a ONE thing de amanhã antes de fechar o dia.",
        ],
        metrics: ["Horas de trabalho profundo por semana"],
        sources: [
          { who: "James Clear", work: "Atomic Habits" },
          { who: "Cal Newport", work: "Deep Work" },
          { who: "Gary Keller", work: "The ONE Thing" },
        ],
      },
      {
        id: "pro",
        mindset: "Compra de volta o teu tempo e aplica 80/20 a tudo.",
        principles: [
          "Princípio 80/20: 20% dos produtos, clientes e criativos geram 80% do resultado. Corta ou delega o resto (Koch).",
          "Matriz de Eisenhower: o importante e não urgente (estratégia, contratar, sistemas) é onde está o crescimento.",
          "Compra de volta o teu tempo: delega o que custa menos do que o valor da tua hora (Martell).",
          "Decide uma vez: regras e checklists eliminam a fadiga de decisão.",
        ],
        actions: [
          "Calcula o valor da tua hora e lista tudo o que fazes abaixo desse valor.",
          "Faz uma auditoria 80/20 aos produtos e criativos do último mês.",
        ],
        metrics: ["% do tempo em tarefas de alta alavancagem"],
        sources: [
          { who: "Richard Koch", work: "The 80/20 Principle" },
          { who: "Dan Martell", work: "Buy Back Your Time" },
          { who: "Tim Ferriss", work: "The 4-Hour Workweek" },
        ],
      },
      {
        id: "goat",
        mindset: "Alavancagem sem permissão e uma rede de modelos mentais.",
        principles: [
          "Alavancagem: trabalho, capital, código e media. As duas últimas não precisam de permissão de ninguém (Naval).",
          "Conhecimento específico: aquilo que só tu sabes fazer e que parece brincadeira para ti mas trabalho para os outros (Naval).",
          "Rede de modelos mentais de várias disciplinas para decidir melhor: inversão, incentivos, juros compostos, margem de segurança (Munger).",
          "Estoicismo: controla o que depende de ti (esforço, decisões) e aceita o resto (mercado, algoritmo) (Marco Aurélio).",
        ],
        actions: [
          "Escreve qual é o teu conhecimento específico e como o transformas em código ou media.",
          "Uma vez por semana, aplica a inversão a um problema: o que garantiria o fracasso?",
        ],
        metrics: ["Receita gerada por sistemas vs. pelo teu tempo"],
        sources: [
          { who: "Naval Ravikant / Eric Jorgenson", work: "The Almanack of Naval Ravikant" },
          { who: "Charlie Munger", work: "Poor Charlie's Almanack" },
          { who: "Marco Aurélio", work: "Meditações" },
        ],
      },
    ],
  },
  {
    id: "trading",
    title: "Trading & gestão de risco",
    why: "No trading, o primeiro trabalho não é ganhar: é sobreviver tempo suficiente para a tua vantagem funcionar.",
    levels: [
      {
        id: "amador",
        mindset: "Protege o capital: risco fixo por trade, stop sempre e diário de todos os trades.",
        principles: [
          "Nunca arrisques mais de 1% do capital por trade: 10 perdas seguidas custam ~10%, não a conta.",
          "Stop loss definido antes da entrada, no nível técnico que invalida a ideia, nunca movido contra ti.",
          "Diário de trading: setup, razão, emoção e resultado. Sem registo não há melhoria.",
          "Limite de perda diária: atingido, desligas o ecrã.",
        ],
        actions: [
          "Usa a calculadora de risco do Apex em todos os trades durante 30 dias.",
          "Define o teu limite de perda diária na conta (circuit breaker).",
        ],
        metrics: ["% de trades com stop", "Perda máxima diária"],
        inApex: "Trading → Calculadora de risco, checklist anti-FOMO e circuit breaker.",
        sources: [
          { who: "Mark Douglas", work: "Trading in the Zone" },
          { who: "Jack Schwager", work: "Market Wizards" },
        ],
      },
      {
        id: "pro",
        mindset: "Pensa em expectativa e em múltiplos de R, não em trades individuais.",
        principles: [
          "Expectativa = (win rate × ganho médio) − (loss rate × perda médio). Sem expectativa positiva, nenhum dimensionamento te salva (Van Tharp).",
          "Mede tudo em R (múltiplos do risco inicial): normaliza os resultados entre trades diferentes.",
          "Profit Factor acima de 1,5 e drawdown máximo controlado são os sinais de um sistema saudável.",
          "Consistência mental: aceitar o risco antes de entrar elimina o medo e a ganância (Douglas).",
        ],
        actions: [
          "Revê os últimos 50 trades no diário: expectativa, R médio e o pior setup.",
          "Corta o setup com expectativa negativa.",
        ],
        metrics: ["Expectativa por trade (R)", "Profit Factor", "Drawdown máximo"],
        inApex: "Trading → Diário (Profit Factor, média R, curva de capital).",
        sources: [
          { who: "Van K. Tharp", work: "Trade Your Way to Financial Freedom" },
          { who: "Mark Douglas", work: "Trading in the Zone" },
        ],
      },
      {
        id: "goat",
        mindset: "Defesa primeiro, tamanho quando a vantagem é clara, e respeito pelas caudas gordas.",
        principles: [
          "Critério de Kelly: o tamanho ótimo depende da vantagem e das probabilidades. Os profissionais usam uma fração (½ ou ¼ de Kelly) para reduzir a volatilidade (Thorp).",
          "Joga à defesa: foca-te em proteger o que tens, não em ganhar dinheiro (Paul Tudor Jones).",
          "Não importa se tens razão; importa quanto ganhas quando tens e quanto perdes quando não tens (Soros, contado por Druckenmiller).",
          "Os mercados têm caudas gordas: eventos \"impossíveis\" acontecem. Nunca uses alavancagem que um único movimento possa destruir (Taleb).",
          "Reflexividade: as perceções dos participantes mudam os fundamentos, criando ciclos de euforia e pânico (Soros).",
        ],
        actions: [
          "Calcula o Kelly do teu sistema com o diário e usa no máximo ¼ desse valor.",
          "Automatiza as regras com o bot (testnet) para eliminar a execução emocional.",
        ],
        metrics: ["Retorno ajustado ao risco", "Maior drawdown histórico vs. limite"],
        inApex: "Trading Bots (testnet), com circuit breaker e OCO automáticos.",
        sources: [
          { who: "Edward O. Thorp", work: "A Man for All Markets" },
          { who: "Nassim Nicholas Taleb", work: "Fooled by Randomness" },
          { who: "George Soros", work: "The Alchemy of Finance" },
          { who: "Jack Schwager", work: "The New Market Wizards (Paul Tudor Jones, Druckenmiller)" },
        ],
      },
    ],
  },
];
