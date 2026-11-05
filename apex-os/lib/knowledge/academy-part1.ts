import type { AcademyArea } from "./academy-types";

export const ACADEMY_PART_1: AcademyArea[] = [
  {
    id: "empresa",
    title: "Gestão de empresas & estratégia",
    why: "Decide onde pões tempo e dinheiro. Uma boa execução de uma má estratégia só te leva mais depressa ao sítio errado.",
    levels: [
      {
        id: "amador",
        mindset: "Trabalha NO negócio para o perceberes; depois começa a trabalhar SOBRE o negócio.",
        principles: [
          "O fundador técnico é a armadilha: se tudo passa por ti, não tens uma empresa, tens um emprego (Gerber).",
          "Constrói → mede → aprende: lança um MVP, mede com dados reais e só depois escalas (Ries).",
          "Faz coisas que não escalam no início: falar com clientes um a um mostra-te o que construir (Paul Graham).",
          "Um produto, um canal, um mercado. A dispersão é a principal causa de morte de negócios pequenos.",
        ],
        actions: [
          "Escreve numa página: quem é o cliente, que problema resolves, porque compra a ti e não ao concorrente.",
          "Lista as 10 tarefas que repetes todas as semanas: são as primeiras a passar a processo escrito.",
        ],
        metrics: ["Lucro líquido semanal", "Horas por semana que só tu consegues fazer"],
        sources: [
          { who: "Michael E. Gerber", work: "The E-Myth Revisited" },
          { who: "Eric Ries", work: "The Lean Startup" },
          { who: "Paul Graham", work: "Do Things That Don't Scale (ensaio)" },
        ],
      },
      {
        id: "pro",
        mindset: "O teu output é o output da tua organização: gere alavancagem, não tarefas.",
        principles: [
          "Output do gestor = output da equipa + das equipas que influencia. Escolhe as atividades de maior alavancagem (Grove).",
          "OKRs: objetivos ambiciosos e 3–5 resultados mensuráveis por trimestre (Grove, Doerr).",
          "Sistema operativo da empresa: scorecard semanal, 3–7 prioridades trimestrais (rocks) e uma reunião semanal com agenda fixa (Wickman, EOS).",
          "Escalar exige pessoas, estratégia, execução e caixa ao mesmo tempo (Harnish).",
        ],
        actions: [
          "Define 3 prioridades para os próximos 90 dias, cada uma com dono e número final.",
          "Cria um scorecard semanal com 5–10 números e revê-o sempre no mesmo dia.",
        ],
        metrics: ["% de prioridades trimestrais cumpridas", "Margem de contribuição por canal"],
        inApex: "O Dashboard e o P&L diário são o teu scorecard; o War Chest é a tua regra de alocação.",
        sources: [
          { who: "Andy Grove", work: "High Output Management" },
          { who: "John Doerr", work: "Measure What Matters" },
          { who: "Gino Wickman", work: "Traction (EOS)" },
          { who: "Verne Harnish", work: "Scaling Up" },
        ],
      },
      {
        id: "goat",
        mindset: "Constrói poder estrutural e aloca capital como um investidor, não como um operador.",
        principles: [
          "7 Powers: economias de escala, efeitos de rede, contra-posicionamento, custos de mudança, marca, recurso exclusivo e poder de processo. Sem um deles, as margens acabam por ser copiadas (Helmer).",
          "Decisões tipo 1 (irreversíveis) devagar; tipo 2 (reversíveis) depressa e por quem está mais perto do problema (Bezos).",
          "Working backwards: escreve primeiro o comunicado de imprensa e as perguntas frequentes do produto, depois constrói (Amazon PR/FAQ).",
          "O ouriço: a interseção entre aquilo em que podes ser o melhor do mundo, aquilo que te apaixona e o que move o teu motor económico. Depois, o volante: pequenos empurrões consistentes (Collins).",
          "A tarefa mais importante do CEO é alocar capital (Buffett, Thorndike).",
        ],
        actions: [
          "Identifica qual dos 7 Powers podes construir em 12 meses (para e-commerce é normalmente marca ou poder de processo).",
          "Classifica as 5 decisões pendentes em tipo 1 e tipo 2 e despacha as de tipo 2 hoje.",
        ],
        metrics: ["Retorno sobre o capital investido (ROIC)", "Margem bruta vs. concorrentes"],
        sources: [
          { who: "Hamilton Helmer", work: "7 Powers" },
          { who: "Jeff Bezos", work: "Cartas aos acionistas da Amazon (1997–2020)" },
          { who: "Jim Collins", work: "Good to Great" },
          { who: "William Thorndike", work: "The Outsiders" },
        ],
      },
    ],
  },
  {
    id: "contabilidade",
    title: "Contabilidade & finanças",
    why: "Faturação é vaidade, lucro é sanidade, caixa é realidade. A maioria das lojas morre com lucro no papel e sem dinheiro no banco.",
    levels: [
      {
        id: "amador",
        mindset: "Sabe exatamente quanto ganhas por encomenda e separa o dinheiro da empresa do teu.",
        principles: [
          "Conta bancária da empresa separada da pessoal, sem exceções.",
          "Profit First: Vendas − Lucro = Despesas. Retira primeiro a percentagem de lucro e de impostos para contas separadas, e gere a operação com o que sobra (Michalowicz).",
          "Lucro ≠ caixa: o dinheiro preso no gateway, no stock e nos anúncios não paga contas.",
          "Regista todos os custos: COGS, portes, taxas, apps, anúncios. O que não registas, não controlas.",
        ],
        actions: [
          "Preenche os custos por produto no Apex para cada encomenda mostrar o lucro real.",
          "Abre contas separadas para Lucro, Impostos e Operação.",
        ],
        metrics: ["Lucro por encomenda", "Margem líquida %", "Saldo de caixa disponível"],
        inApex: "Dropshipping → Custos por produto e P&L diário; Playbook → Cofre fiscal.",
        sources: [
          { who: "Mike Michalowicz", work: "Profit First" },
          { who: "Robert Kiyosaki", work: "Rich Dad Poor Dad (ativos vs. passivos)" },
        ],
      },
      {
        id: "pro",
        mindset: "Gere por unit economics e por previsão de caixa, não pelo saldo de hoje.",
        principles: [
          "Margem de contribuição (CM3) por produto e por canal: decide o que escalar e o que matar.",
          "Previsão de caixa a 13 semanas, atualizada semanalmente: antecipa as falhas de liquidez antes de acontecerem.",
          "Ciclo de conversão de caixa: quanto mais depressa recebes e mais tarde pagas, menos capital precisas para crescer.",
          "LTV:CAC ≥ 3 e recuperação do CAC rápida. No dropshipping de compra única, o CAC tem de ser pago logo na primeira encomenda.",
          "Separa custos fixos e variáveis: o ponto de equilíbrio é o número que tens de bater todos os meses.",
        ],
        actions: [
          "Monta uma folha de previsão de caixa a 13 semanas, com entradas do gateway e saídas de ads e fornecedor.",
          "Calcula a CM3 dos teus 3 produtos principais e corta o que estiver abaixo de 10%.",
        ],
        metrics: ["CM3 %", "Dias de caixa disponível (runway)", "LTV:CAC"],
        inApex: "Playbook → P&L em cascata e Ciclo de conversão de caixa; Simulador de cenários.",
        sources: [
          { who: "Greg Crabtree", work: "Simple Numbers, Straight Talk, Big Profits!" },
          { who: "Verne Harnish", work: "Scaling Up (capítulo Cash)" },
          { who: "Mike Michalowicz", work: "Profit First (alocações avançadas)" },
        ],
      },
      {
        id: "goat",
        mindset: "Pensa como Buffett: o dinheiro que o negócio gera e o retorno de cada euro reinvestido.",
        principles: [
          "Owner Earnings = lucro + depreciações − capex de manutenção − Δ fundo de maneio. É isto que vale um negócio (Buffett).",
          "ROIC acima do custo de capital e uma pista longa para reinvestir: é esta a máquina de compostos.",
          "Os grandes alocadores (Singleton, Murphy) eram frugais, descentralizados e obcecados com o fluxo de caixa por ação (Thorndike).",
          "Mostra-me o incentivo e eu mostro-te o resultado: desenha as métricas e as comissões para que o interesse de todos seja o do dono (Munger).",
          "Float: dinheiro dos clientes recebido antes de pagares (pré-encomendas, assinaturas) é capital gratuito.",
        ],
        actions: [
          "Calcula os teus Owner Earnings dos últimos 3 meses (calculadora no separador Governança).",
          "Avalia uma oferta de pré-encomenda ou de assinatura para gerar float.",
        ],
        metrics: ["Owner Earnings", "ROIC", "Cash conversion cycle (dias)"],
        sources: [
          { who: "Warren Buffett", work: "Cartas aos acionistas da Berkshire Hathaway" },
          { who: "Charlie Munger", work: "Poor Charlie's Almanack" },
          { who: "William Thorndike", work: "The Outsiders" },
        ],
      },
    ],
  },
  {
    id: "pessoas",
    title: "Gestão de pessoas & liderança",
    why: "Sem pessoas, o teu teto é o teu tempo. Com as pessoas erradas, o teto passa a ser o teu stress.",
    levels: [
      {
        id: "amador",
        mindset: "Contrata devagar, despede depressa, e escreve o que esperas de cada pessoa.",
        principles: [
          "Antes de contratar, escreve o scorecard da função: missão, 3–5 resultados mensuráveis e competências (método Who).",
          "Who: scorecard → procurar candidatos → selecionar com entrevistas estruturadas → convencer os melhores (Smart & Street).",
          "Candura radical: importa-te pessoalmente e desafia diretamente. Elogio específico, crítica em privado e cedo (Kim Scott).",
          "Começa por freelancers (apoio ao cliente, edição de vídeo) com tarefas bem definidas antes de contratar a tempo inteiro.",
        ],
        actions: [
          "Grava em vídeo as 3 tarefas que mais repetes: esse vídeo é o primeiro manual (SOP) para delegar.",
          "Escreve o scorecard do primeiro reforço (ex.: assistente de apoio ao cliente).",
        ],
        metrics: ["Horas por semana libertadas por delegação", "Tempo médio de resposta ao cliente"],
        sources: [
          { who: "Geoff Smart & Randy Street", work: "Who: The A Method for Hiring" },
          { who: "Kim Scott", work: "Radical Candor" },
          { who: "Dan Martell", work: "Buy Back Your Time (método camcorder)" },
        ],
      },
      {
        id: "pro",
        mindset: "Gere pela maturidade de cada pessoa na tarefa e trata a confiança como infraestrutura.",
        principles: [
          "Maturidade na tarefa: pouca experiência pede instruções claras, alta maturidade pede só objetivos e autonomia (Grove).",
          "Reuniões 1:1 regulares em que a agenda é da outra pessoa: o canal de informação de maior alavancagem (Grove).",
          "As 5 disfunções das equipas: falta de confiança, medo do conflito, falta de compromisso, fuga à responsabilização e desatenção aos resultados (Lencioni).",
          "Delega resultados, não tarefas: o quê, porquê e como se mede. O como fica com a pessoa.",
        ],
        actions: [
          "Marca 1:1 quinzenais de 30 minutos com cada colaborador ou freelancer recorrente.",
          "Define para cada função 1–2 números que a pessoa controla e revê-os semanalmente.",
        ],
        metrics: ["Retenção das pessoas boas", "Resultados por pessoa vs. scorecard"],
        sources: [
          { who: "Andy Grove", work: "High Output Management" },
          { who: "Patrick Lencioni", work: "The Five Dysfunctions of a Team" },
          { who: "Ben Horowitz", work: "The Hard Thing About Hard Things" },
        ],
      },
      {
        id: "goat",
        mindset: "Densidade de talento e verdade radical: poucas pessoas excelentes, com contexto e liberdade.",
        principles: [
          "Densidade de talento primeiro, depois candura, e só então menos regras e controlos (Hastings, Netflix).",
          "Keeper test: se esta pessoa dissesse que se vai embora, lutarias para a manter? Se não, faz já a conversa difícil (Netflix).",
          "Liderar com contexto, não com controlo: explica o porquê e deixa as pessoas decidir.",
          "Meritocracia de ideias: transparência radical e decisões ponderadas pela credibilidade de cada um nesse tema (Dalio).",
          "O coach: o sucesso de um gestor mede-se pelo sucesso das pessoas que lidera; primeiro a equipa, depois o problema (Bill Campbell).",
        ],
        actions: [
          "Aplica o keeper test a cada pessoa ou fornecedor-chave e decide o que fazer.",
          "Escreve os 5 princípios inegociáveis da tua empresa e partilha-os com a equipa.",
        ],
        metrics: ["Receita por pessoa", "% de decisões tomadas sem ti"],
        sources: [
          { who: "Reed Hastings & Erin Meyer", work: "No Rules Rules" },
          { who: "Ray Dalio", work: "Principles" },
          { who: "Eric Schmidt, Jonathan Rosenberg & Alan Eagle", work: "Trillion Dollar Coach" },
        ],
      },
    ],
  },
  {
    id: "marketing",
    title: "Marketing & aquisição de clientes",
    why: "Sem tráfego qualificado não há negócio. O marketing é a tua máquina de transformar euros em clientes.",
    levels: [
      {
        id: "amador",
        mindset: "Um avatar de cliente, uma oferta irresistível, um canal dominado.",
        principles: [
          "Equação de valor: (Resultado sonhado × Probabilidade percebida) ÷ (Tempo de espera × Esforço). Mexe nos 4 fatores (Hormozi).",
          "Fala com a dor e o desejo do cliente nas palavras dele: tira-as das avaliações dos concorrentes.",
          "Nos anúncios, os primeiros 3 segundos são o produto: sem hook, ninguém vê o resto.",
          "Testa criativos, não botões: o criativo é o maior fator de resultado na Meta e no TikTok.",
        ],
        actions: [
          "Lê 50 avaliações de 1 e 5 estrelas de concorrentes e copia as frases mais repetidas.",
          "Lança 5 hooks diferentes para o mesmo vídeo e mede o hook rate de cada um.",
        ],
        metrics: ["Hook rate (3s / impressões)", "CTR", "CPA vs. break-even CPA"],
        inApex: "Dropshipping → Ad Fatigue Radar; Anúncios Meta para ver o que os concorrentes estão a escalar.",
        sources: [
          { who: "Alex Hormozi", work: "$100M Offers" },
          { who: "Robert Cialdini", work: "Influence" },
        ],
      },
      {
        id: "pro",
        mindset: "Sistema de testes criativos e mensagem ajustada ao nível de consciência do público.",
        principles: [
          "5 níveis de consciência: não consciente, consciente do problema, da solução, do produto e totalmente consciente. Cada nível pede um anúncio diferente (Schwartz).",
          "Disponibilidade mental e física: as marcas crescem com alcance amplo e ativos distintivos consistentes, não com nichos minúsculos (Sharp).",
          "Mede o MER (receita total ÷ gasto total em anúncios) e não só o ROAS atribuído pela plataforma.",
          "Fadiga criativa é inevitável: precisas de um pipeline de criativos novos todas as semanas.",
          "Core Four: contacto quente, contacto frio, conteúdo e anúncios pagos. Domina um e depois acrescenta (Hormozi).",
        ],
        actions: [
          "Cria uma grelha de testes: 3 ângulos × 3 hooks × 2 formatos, com orçamento igual.",
          "Calcula o MER semanal e compara-o com o ROAS que a Meta reporta.",
        ],
        metrics: ["MER", "Custo por criativo vencedor", "Frequência"],
        sources: [
          { who: "Eugene Schwartz", work: "Breakthrough Advertising" },
          { who: "Byron Sharp", work: "How Brands Grow" },
          { who: "Alex Hormozi", work: "$100M Leads" },
        ],
      },
      {
        id: "goat",
        mindset: "Constrói uma marca de que as pessoas se lembram e escolhem sem pensar no preço.",
        principles: [
          "O consumidor não é estúpido, é a tua mulher: respeito, pesquisa e promessas concretas vendem (Ogilvy).",
          "Alquimia: a perceção vale tanto como a realidade. Pequenas mudanças psicológicas podem valer mais do que grandes mudanças no produto (Sutherland).",
          "Marca é a soma das promessas cumpridas: cada envio, embalagem e resposta constroem ou destroem valor.",
          "Distribuição é poder: quem controla a atenção (comunidade, email, criadores) não depende das subidas de CPM.",
        ],
        actions: [
          "Define 3 ativos distintivos (cor, frase, formato) e usa-os em todos os criativos durante 90 dias.",
          "Começa uma lista de email/SMS própria com uma oferta de entrada.",
        ],
        metrics: ["% de vendas sem anúncios pagos", "Procuras pelo nome da marca"],
        sources: [
          { who: "David Ogilvy", work: "Ogilvy on Advertising" },
          { who: "Rory Sutherland", work: "Alchemy" },
          { who: "Seth Godin", work: "This Is Marketing" },
        ],
      },
    ],
  },
  {
    id: "vendas",
    title: "Oferta, vendas & conversão",
    why: "Duplicar a conversão é igual a reduzir o CPA para metade. É a alavanca mais barata do negócio.",
    levels: [
      {
        id: "amador",
        mindset: "Uma oferta clara, prova social a sério e zero fricção até ao pagamento.",
        principles: [
          "Princípios de persuasão: reciprocidade, compromisso, prova social, autoridade, simpatia e escassez (real, nunca inventada) (Cialdini).",
          "Garantia forte reduz o risco percebido: reembolso simples vende mais do que custa.",
          "Página de produto: benefício principal no topo, fotos reais, avaliações verificadas, portes e prazos claros.",
          "Cerca de 70% dos carrinhos são abandonados (Baymard): portes inesperados e criar conta obrigatória são as maiores causas.",
        ],
        actions: [
          "Mostra o prazo e os portes na página de produto, não só no checkout.",
          "Ativa o checkout sem conta e métodos de pagamento locais (MB Way, Multibanco).",
        ],
        metrics: ["Taxa de conversão", "Taxa de adição ao carrinho", "Abandono do checkout"],
        sources: [
          { who: "Robert Cialdini", work: "Influence" },
          { who: "Baymard Institute", work: "Estudos de usabilidade do checkout" },
        ],
      },
      {
        id: "pro",
        mindset: "Aumenta o valor por cliente: AOV, bundles e testes A/B com significância.",
        principles: [
          "Bundles (2 ou 3 unidades) com desconto progressivo aumentam o AOV e diluem os portes.",
          "Upsell e cross-sell no carrinho e no pós-compra (one-click) aumentam o lucro sem custo de aquisição extra.",
          "Testes A/B só com tráfego suficiente: corre até à significância e mede o lucro, não só a conversão.",
          "Ancoragem de preço: mostra o preço de referência real e a poupança do bundle.",
        ],
        actions: [
          "Cria uma oferta de 2 e 3 unidades e vê o efeito na tabela de portes por escalão do Apex.",
          "Adiciona um upsell pós-compra com um produto complementar.",
        ],
        metrics: ["AOV", "% de encomendas com bundle", "Lucro por visita"],
        inApex: "Dropshipping → Custos por produto (portes por 1/2/3 unidades) e Simulador de cenários.",
        sources: [
          { who: "Alex Hormozi", work: "$100M Offers (grand slam offer)" },
          { who: "Peep Laja", work: "CXL — conversion research" },
        ],
      },
      {
        id: "goat",
        mindset: "Poder de preço: vende valor, não preço, e define o preço antes de criar o produto.",
        principles: [
          "O preço é a alavanca de lucro mais poderosa: 1% a mais no preço costuma valer mais do que 1% a mais no volume (Simon).",
          "Desenha o produto à volta do preço que o cliente está disposto a pagar, não o contrário (Simon-Kucher).",
          "Grand slam offer: tão boa que o cliente se sente estúpido se disser que não. Bónus, garantia, escassez e urgência reais.",
          "Quem compete no preço mais baixo compete com quem está disposto a perder mais dinheiro.",
        ],
        actions: [
          "Testa um aumento de preço de 10% com mais valor percebido (bónus, garantia) e mede o lucro total.",
          "Pergunta a 10 clientes quanto pagariam e porquê (Van Westendorp).",
        ],
        metrics: ["Margem bruta %", "Elasticidade de preço observada"],
        sources: [
          { who: "Hermann Simon", work: "Confessions of the Pricing Man" },
          { who: "Madhavan Ramanujam", work: "Monetizing Innovation" },
        ],
      },
    ],
  },
  {
    id: "operacoes",
    title: "Operações, fornecedores & logística",
    why: "O cliente não compra o produto, compra a promessa de o receber bem e a tempo. As operações cumprem essa promessa.",
    levels: [
      {
        id: "amador",
        mindset: "Fornecedor fiável, amostras sempre, e tudo o que se repete passa a SOP.",
        principles: [
          "Encomenda sempre amostras antes de vender: qualidade, embalagem e prazo real.",
          "Um fornecedor de reserva para o produto principal: a dependência de um só é risco de falência.",
          "Procedimentos escritos (SOP) para encomendas, reembolsos e apoio: é o que te permite delegar.",
          "Prazo de envio honesto na loja: a principal causa de disputas é a expectativa errada.",
        ],
        actions: [
          "Mede o tempo real entre a encomenda e a entrega nas últimas 20 encomendas.",
          "Contacta um segundo fornecedor e pede amostra do produto principal.",
        ],
        metrics: ["Tempo médio de entrega", "% de encomendas com problema"],
        sources: [
          { who: "Michael E. Gerber", work: "The E-Myth Revisited (sistemas)" },
        ],
      },
      {
        id: "pro",
        mindset: "Encontra o estrangulamento e otimiza só esse; o resto é distração.",
        principles: [
          "Teoria dos constrangimentos: identifica o gargalo, explora-o, subordina tudo a ele, eleva-o e repete (Goldratt).",
          "Agente de sourcing ou armazém próprio (3PL) quando o volume o justificar: prazos de 3–7 dias mudam a conversão.",
          "Controlo de qualidade antes do envio e inspeção por amostragem.",
          "Previsão de stock com base nas vendas e no prazo de reposição: rutura mata o ROAS e o algoritmo.",
        ],
        actions: [
          "Identifica hoje o teu estrangulamento: tráfego, conversão, fornecedor, caixa ou o teu tempo?",
          "Negoceia com o fornecedor prazos de envio por escrito e penalizações por atraso.",
        ],
        metrics: ["Taxa de defeitos", "Dias de cobertura de stock", "Custo logístico por encomenda"],
        sources: [
          { who: "Eliyahu M. Goldratt", work: "The Goal" },
          { who: "Gene Kim", work: "The Phoenix Project" },
        ],
      },
      {
        id: "goat",
        mindset: "Excelência operacional como fosso: mais rápido, mais barato e mais fiável do que qualquer concorrente.",
        principles: [
          "Sistema Toyota: just-in-time, jidoka (parar ao primeiro defeito), kaizen (melhoria contínua) e os 5 porquês até à causa raiz (Ohno).",
          "Velocidade como estratégia: a Zara passa do design à loja em semanas, não meses. O tempo de ciclo curto reduz o risco de stock.",
          "Volante da Amazon: preços mais baixos e melhor experiência → mais tráfego → mais vendedores → custos mais baixos.",
          "Mede tudo em processo, não só em resultado: o defeito evita-se a montante.",
        ],
        actions: [
          "Faz os 5 porquês para o último problema de entrega e corrige a causa raiz, não o sintoma.",
          "Desenha o fluxo completo da encomenda e corta um passo que não acrescenta valor.",
        ],
        metrics: ["Tempo de ciclo da encomenda", "Taxa de entregas perfeitas"],
        sources: [
          { who: "Taiichi Ohno", work: "Toyota Production System" },
          { who: "James Womack & Daniel Jones", work: "Lean Thinking" },
          { who: "Brad Stone", work: "The Everything Store" },
        ],
      },
    ],
  },
  {
    id: "produto",
    title: "Produto & marca",
    why: "O produto certo faz o marketing parecer fácil. O errado faz o melhor marketing do mundo parecer inútil.",
    levels: [
      {
        id: "amador",
        mindset: "Vende algo que resolve um problema visível e se demonstra num vídeo de 15 segundos.",
        principles: [
          "Produtos vencedores: efeito \"uau\" visível, problema claro, margem para pagar anúncios (preço ≥ 3× o custo) e difícil de encontrar em lojas físicas.",
          "Valida a procura antes de investir: anúncios ativos há muito tempo e com várias cópias são sinal de lucro.",
          "Mais vale um produto ótimo do que dez medianos.",
        ],
        actions: [
          "Usa os Anúncios Meta para ver os criativos dos concorrentes com mais dias ativos e mais cópias.",
          "Calcula o preço-alvo: custo × 3 é o mínimo para aguentar o CPA.",
        ],
        metrics: ["Margem bruta por produto", "Taxa de devolução"],
        inApex: "Spy Engine e Anúncios Meta (Winner Score).",
        sources: [{ who: "Rob Fitzpatrick", work: "The Mom Test (validar com clientes)" }],
      },
      {
        id: "pro",
        mindset: "Posicionamento: escolhe a categoria e o cliente em que és obviamente a melhor escolha.",
        principles: [
          "Posicionamento: alternativas competitivas → atributos únicos → valor → cliente ideal → categoria de mercado (Dunford).",
          "Ganha um lugar na mente do cliente: ser o primeiro numa categoria vale mais do que ser melhor (Ries & Trout).",
          "Embalagem, unboxing e cartão de agradecimento: é aí que nasce a repetição e o boca-a-boca.",
          "Transforma o produto genérico numa marca: nome próprio, garantia, conteúdo e apoio que o concorrente não tem.",
        ],
        actions: [
          "Escreve a frase de posicionamento: \"Para [cliente] que [problema], [marca] é a única [categoria] que [diferença]\".",
          "Melhora a embalagem do produto principal e mede o efeito nas avaliações.",
        ],
        metrics: ["Nota média das avaliações", "Taxa de recompra"],
        sources: [
          { who: "April Dunford", work: "Obviously Awesome" },
          { who: "Al Ries & Jack Trout", work: "Positioning" },
        ],
      },
      {
        id: "goat",
        mindset: "Foco é dizer não a mil coisas boas; cria um oceano azul em vez de lutar no vermelho.",
        principles: [
          "Foco: o que te orgulhas de não ter feito vale tanto como o que fizeste (Steve Jobs).",
          "Oceano azul: elimina, reduz, eleva e cria fatores até deixares de ter concorrência direta (Kim & Mauborgne).",
          "Obsessão pelo detalhe que o cliente sente, mesmo que não o veja (Dyson, Apple).",
          "Produto, marca e experiência são um sistema só: cada ponto de contacto conta a mesma história.",
        ],
        actions: [
          "Faz a grelha eliminar/reduzir/elevar/criar para o teu nicho.",
          "Corta os produtos que vendem pouco e concentra a energia no principal.",
        ],
        metrics: ["Quota de mercado no nicho", "Margem vs. média da categoria"],
        sources: [
          { who: "Walter Isaacson", work: "Steve Jobs" },
          { who: "W. Chan Kim & Renée Mauborgne", work: "Blue Ocean Strategy" },
          { who: "James Dyson", work: "Invention: A Life" },
        ],
      },
    ],
  },
];
