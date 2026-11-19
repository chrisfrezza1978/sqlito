/* SQLito — banco de perguntas do Modo Entrevista.
   Perguntas clássicas de processo seletivo para analista de dados, adaptadas ao banco de cada trilha.
   Cada sessão sorteia 3 clássicas do nível escolhido e completa com 2 desafios de código das etapas do nível. */
(function (raiz) {
  const B = {
    hotel: { itens: 'pratos', item: 'prato', cat: 'categoria', pessoas: 'hospedes', rotulo: 'hóspedes', negocio: 'o hotel' },
    vet: { itens: 'medicamentos', item: 'medicamento', cat: 'categoria', pessoas: 'tutores', rotulo: 'tutores', negocio: 'a clínica' },
    agro: { itens: 'insumos', item: 'insumo', cat: 'tipo', pessoas: 'cooperados', rotulo: 'cooperados', negocio: 'a cooperativa' },
    loja: { itens: 'produtos', item: 'produto', cat: 'categoria', pessoas: 'clientes', rotulo: 'clientes', negocio: 'a loja' },
    banco: { itens: 'tarifas', item: 'tarifa', cat: 'categoria', pessoas: 'clientes', rotulo: 'clientes', negocio: 'o banco' },
    agroeco: { itens: 'insumos', item: 'insumo', cat: 'categoria', pessoas: 'produtores', rotulo: 'produtores', negocio: 'a Menta Agro' }
    // powerbi: trilha especial, sem Modo Entrevista
  };
  function perguntas(id) {
    const b = B[id];
    if (!b) return [];
    return [
      { id: 'j1', nivel: 'junior', tema: 'TOP e ORDER BY', p: `O gerente quer saber os <b>3 ${b.itens} mais caros</b>. Mostre <b>nome</b> e <b>preco</b>, do mais caro para o mais barato (empate: por nome).`, a: `SELECT TOP 3 nome, preco FROM ${b.itens} ORDER BY preco DESC, nome` },
      { id: 'j2', nivel: 'junior', tema: 'GROUP BY', p: `Para cada <b>${b.cat}</b> de ${b.itens}, mostre a quantidade de <b>itens</b> e o <b>preco_medio</b> (2 casas), da ${b.cat} com mais itens para a com menos (empate: pela ${b.cat}).`, a: `SELECT ${b.cat}, COUNT(*) AS itens, ROUND(AVG(preco), 2) AS preco_medio FROM ${b.itens} GROUP BY ${b.cat} ORDER BY itens DESC, ${b.cat}` },
      { id: 'j3', nivel: 'junior', tema: 'NULL e COUNT', p: `Qualidade de dados: na tabela ${b.pessoas}, mostre numa linha o <b>total</b> de ${b.rotulo}, quantos têm telefone (<b>com_telefone</b>) e quantos não têm (<b>sem_telefone</b>).`, a: `SELECT COUNT(*) AS total, COUNT(telefone) AS com_telefone, COUNT(*) - COUNT(telefone) AS sem_telefone FROM ${b.pessoas}` },
      { id: 'p1', nivel: 'pleno', tema: 'Subconsulta', p: 'A pergunta mais famosa das entrevistas: qual é o <b>segundo maior salário</b> entre os funcionários? Mostre numa coluna <b>segundo_maior</b>.', a: 'SELECT MAX(salario) AS segundo_maior FROM funcionarios WHERE salario < (SELECT MAX(salario) FROM funcionarios)' },
      { id: 'p2', nivel: 'pleno', tema: 'SELF JOIN', p: 'Mostre o nome de cada <b>funcionario</b> e o nome do seu <b>gerente</b> (NULL para quem não tem gerente), em ordem de nome do funcionário.', a: 'SELECT f.nome AS funcionario, g.nome AS gerente FROM funcionarios f LEFT JOIN funcionarios g ON g.id = f.gerente_id ORDER BY f.nome' },
      { id: 'p3', nivel: 'pleno', tema: 'Percentual do total', p: 'Mostre cada <b>forma</b> de pagamento, o <b>total</b> recebido e o <b>percentual</b> que ela representa sobre tudo o que foi recebido (1 casa decimal), do maior total para o menor (empate: pela forma).', a: 'SELECT forma, SUM(valor) AS total, ROUND(100.0 * SUM(valor) / (SELECT SUM(valor) FROM pagamentos), 1) AS percentual FROM pagamentos GROUP BY forma ORDER BY total DESC, forma' },
      { id: 's1', nivel: 'senior', tema: 'Top 1 por grupo', p: 'Para cada <b>setor</b>, mostre o funcionário com o maior salário: <b>setor</b>, <b>nome</b> e <b>salario</b>. Se houver empate no setor, fique com o primeiro nome em ordem alfabética. Ordene por setor.', a: 'WITH r AS (SELECT setor, nome, salario, ROW_NUMBER() OVER (PARTITION BY setor ORDER BY salario DESC, nome) AS n FROM funcionarios) SELECT setor, nome, salario FROM r WHERE n = 1 ORDER BY setor' },
      { id: 's2', nivel: 'senior', tema: 'Soma acumulada', p: 'Mostre, para cada <b>dia</b> com pagamento (CAST(pago_em AS DATE)), o <b>total_dia</b> recebido e o <b>acumulado</b> desde o primeiro dia, em ordem de dia.', a: 'SELECT CAST(pago_em AS DATE) AS dia, SUM(valor) AS total_dia, SUM(SUM(valor)) OVER (ORDER BY CAST(pago_em AS DATE)) AS acumulado FROM pagamentos GROUP BY CAST(pago_em AS DATE) ORDER BY dia' },
      { id: 's3', nivel: 'senior', tema: 'LAG e variação', p: `Mostre o <b>mes</b> (MONTH(pago_em)), o <b>total</b> recebido no mês e a <b>variacao</b> em relação ao mês anterior (NULL no primeiro), em ordem de mês. É assim que ${b.negocio} acompanha o crescimento.`, a: 'WITH m AS (SELECT MONTH(pago_em) AS mes, SUM(valor) AS total FROM pagamentos GROUP BY MONTH(pago_em)) SELECT mes, total, total - LAG(total) OVER (ORDER BY mes) AS variacao FROM m ORDER BY mes' }
    ];
  }
  raiz.ENTREVISTA = {
    niveis: {
      junior: { nome: 'Júnior', minutos: 15, etapas: [1, 5], desc: 'SELECT, filtros, ordenação, agregação e JOIN básico.' },
      pleno: { nome: 'Pleno', minutos: 20, etapas: [3, 10], desc: 'JOINs, subconsultas, CASE, datas e funções de janela.' },
      senior: { nome: 'Sênior', minutos: 25, etapas: [9, 23], desc: 'Janelas, CTEs, transações, objetos e PIVOT.' }
    },
    perguntas,
    disponivel: id => !!B[id]
  };
})(typeof window !== 'undefined' ? window : globalThis);
