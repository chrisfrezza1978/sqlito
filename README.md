# SQLito — versão desktop

> **Esta pasta é a versão exclusiva para computadores**, pronta para publicar de graça.
> - **Para rodar no seu PC:** dê dois cliques em `iniciar.bat`. Se ainda não tiver SQL Server, use `iniciar_demo.bat`.
> - **Para publicar na internet sem custo:** siga o passo a passo de [`docs/HOSPEDAGEM_GRATUITA.md`](docs/HOSPEDAGEM_GRATUITA.md). Para o Netlify Drop e o GitHub Pages há um guia ilustrado: abra `docs/PUBLICAR_NETLIFY_E_GITHUB.html` no navegador.
> - **Celulares e tablets** veem a tela *"O SQLito é exclusivo para computadores"*, com o link para copiar. As páginas de certificado e portfólio continuam abrindo no celular.

Plataforma gamificada de ensino de SQL Server, com lições curtas, desafios de código e trilhas por setor de negócio, para o navegador do computador. Logo após o login, o aluno escolhe uma das **6 trilhas completas** (Hotel Menta, Clínica Menta Vet, Cooperativa Menta Agro, Menta Store, **Banco Menta** e **Economia do Agro**) ou uma das **trilhas especiais**, **SQL para Power BI** e **SQL no Databricks**: nas completas o currículo é o mesmo e muda o banco de dados dos exercícios; as especiais são cursos mais curtos, com conteúdo próprio. Cada setor do negócio é uma etapa, o aluno acumula XP, disputa um ranking semanal e recebe **certificados** dos níveis Básico, Intermediário, Avançado e Especialista em cada trilha (na trilha especial, Básico e Intermediário).

**Mascote: SQLito, o Mestre dos Dados** (apelido: Seu Queri). Um robozinho menta cuja missão é transformar iniciantes em mestres em SQL Server. Bordão: *"Menos achismo, mais SELECT!"*. Ele é professor, amigo, treinador e personagem de videogame ao mesmo tempo:

| Situação | Reação do SQLito |
|---|---|
| Acerto | *EU SABIA! Esse SELECT nasceu para brilhar!* (pula e acena) |
| Erro | *Calma! Até os melhores DBAs já esqueceram um WHERE.* (triste); no segundo erro na mesma questão: *eu explico quantas vezes for preciso* |
| Acertou o código, mas sem `;` no fim | *MEU BANCO DE DADOS NÃO É LUGAR DE BAGUNÇA!* (assustado; 1 vez por lição, sem tirar ponto) |
| Desafio de código difícil (etapa 9+ ou resposta longa) | *Modo mestre Jedi dos dados: ATIVADO!* (levita com aura) |
| Acha o erro numa questão de "o que está errado" | *Achou o erro que EU plantei!* (sarcástico) |
| Lição concluída | *Query executada com sucesso! Você está ficando perigoso!* |
| 2 dias ou mais sem estudar | *Alô?! Tem alguém aí ou o banco entrou em modo offline?* (dormindo; 1 vez por dia) |
| Aprovação no Especialista ou chegada ao último nível | *Parabéns! Você desbloqueou o nível DBA!* |
| Ranking | Competitivo: provoca para subir e comemora o 1º lugar |

**Evolução do SQLito** (acompanha as etapas concluídas na trilha atual; aparece no Perfil):

| Nível | Forma | Quando | Visual |
|---|---|---|---|
| 1 | Estagiário | etapas 1–2 (SELECT, FROM, WHERE, filtros) | crachá |
| 2 | Analista | etapas 3–4 (agregações, ordenações, DML) | óculos |
| 3 | Desenvolvedor | etapas 5–10 (JOIN, funções, subqueries, CTEs, janelas) | headset e `</>` no peito |
| 4 | DBA Supremo | etapas 11–23 (estrutura, transações, metadados e todo o nível Especialista) | coroa e capa |

**Conteúdo:** 6 trilhas × 23 etapas × 10 lições × 5 exercícios = 6.900, mais as trilhas especiais Power BI (8 etapas × 10 lições × 5 = 400) e Databricks (12 etapas × 10 lições × 5 = 600): **7.900 exercícios** (múltipla escolha, montagem com blocos e desafios de código), no dialeto do **SQL Server** (e do **Databricks SQL** na trilha Databricks). A cada acesso, a ordem dos exercícios, as alternativas e os blocos são embaralhados.

**Além das lições:** autocompletar de tabelas e colunas no editor, *Onde a consulta errou* (comparação do resultado com o esperado), *Passo a passo* da execução, laboratório livre com diagrama do banco, **projeto final por trilha publicado num portfólio público** (`/portfolio/{apelido}`), botão **Adicionar ao LinkedIn** nos certificados, **Modo Entrevista** cronometrado (Júnior, Pleno e Sênior) e **tutor com IA** (o SQLito explica o erro a partir da 2ª tentativa, via API da Anthropic).

| Camada | Tecnologia |
|---|---|
| Front end | HTML5 + CSS3 + JavaScript puro, em um único `index.html` (layout de desktop com menu lateral, tema claro e escuro). `config.js` define o modo (servidor ou demonstração) e o bloqueio de celulares |
| Back end | Python 3.10+ com FastAPI e Uvicorn |
| Banco | SQL Server 2017 ou superior (o Express também serve) ou **Azure SQL Database** (oferta gratuita), via ODBC (`pyodbc`) |
| Certificado | PDF gerado com ReportLab, com QR Code apontando para a página pública de verificação |
| Tutor com IA (opcional) | API da Anthropic (Claude), chamada só pelo servidor com `urllib` (sem dependência nova) |
| Exercícios de SQL | Executados no navegador do aluno (sql.js) com uma camada que aceita a sintaxe do SQL Server. O SQL do aluno **nunca** roda no SQL Server. |

---

## Estrutura de pastas

```
sqlito-desktop/
├── iniciar.bat                ← inicia tudo (dois cliques); aceita --demo, --testar-banco, --executar-sql
├── iniciar_demo.bat           ← inicia sem SQL Server (banco em memória com alunos de exemplo)
├── iniciar.py                 ← o que o .bat chama (use direto onde .bat é bloqueado)
├── config.exemplo.ini         ← modelo de configuração (copiado para config.ini)
├── Dockerfile                 ← imagem para hospedagem (Render e similares), com ODBC Driver 18
├── render.yaml                ← blueprint opcional do Render
├── .github/workflows/pages-demo.yml ← publica a demonstração no GitHub Pages
├── deploy/vps/                ← VPS (Hostinger KVM 2): docker-compose, Caddy (HTTPS), instalar.sh, backup.sh, atualizar.sh
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py            ← aplicação FastAPI: /api, /certificado/{codigo} e o front end
│       ├── config.py          ← lê config.ini e variáveis HM_*
│       ├── db.py              ← conexão pyodbc (insiste enquanto o Azure SQL acorda)
│       ├── repositorio.py     ← TODO o T-SQL do sistema
│       ├── servicos.py        ← regras: progresso, ofensiva, ranking, prova, certificado
│       ├── seguranca.py       ← senha PBKDF2, tokens, códigos de certificado, limite de tentativas
│       ├── modelos.py         ← validação das entradas (mensagens em português)
│       ├── dependencias.py    ← autenticação por token Bearer
│       ├── certificado_pdf.py ← PDF do certificado
│       ├── pagina_verificacao.py
│       ├── pagina_portfolio.py ← página pública /portfolio/{apelido}
│       ├── ia.py              ← tutor com IA (chamada à API da Anthropic)
│       └── rotas/             ← autenticacao, progresso, certificados, portfolio, entrevistas, tutor
├── frontend/
│   ├── index.html             ← app (login, trilha, lições, ranking, provas, certificados)
│   ├── config.js              ← modo (auto/demo/servidor), endereço da API e bloqueio de celular
│   ├── somente-desktop.html   ← aviso entregue pelo servidor a celulares e tablets
│   ├── js/somente-desktop.js  ← o mesmo bloqueio no navegador (tela, toque, iPadOS)
│   ├── js/motor-sql.js        ← motor do laboratório + tradução T-SQL
│   ├── js/motor-databricks.js ← dialeto Databricks SQL (Unity Catalog, Delta, volumes) sobre o motor
│   ├── js/trilhas/hotel.js    ← banco + 230 lições do Hotel Menta
│   ├── js/trilhas/vet.js      ← banco + 230 lições da Clínica Menta Vet
│   ├── js/trilhas/agro.js     ← banco + 230 lições da Cooperativa Menta Agro
│   ├── js/trilhas/loja.js     ← banco + 230 lições da Menta Store
│   ├── js/trilhas/banco.js    ← banco + 230 lições do Banco Menta (economia bancária e crédito)
│   ├── js/trilhas/agroeco.js  ← banco + 230 lições da Economia do Agro
│   ├── js/trilhas/powerbi.js  ← trilha especial SQL para Power BI (modelo estrela + 80 lições)
│   ├── js/trilhas/databricks.js ← trilha especial SQL no Databricks (lakehouse bronze/prata/ouro + 120 lições)
│   ├── js/projetos.js         ← projetos finais do portfólio (1 por trilha, 5 tarefas)
│   ├── js/entrevista.js       ← perguntas clássicas do Modo Entrevista
│   ├── js/vendor/sql-asm.js   ← sql.js local (funciona sem acesso ao CDN)
│   └── icone.svg
├── database/
│   ├── 01_criar_banco.sql     ← banco, schema hm, tabelas, função de ranking, procedures, catálogo
│   ├── 02_carga_teste.sql     ← 15 alunos fictícios com progresso, provas e certificados
│   ├── 03_limpeza.sql         ← remove só os dados de teste (opção comentada para zerar tudo)
│   ├── 04_remover_banco.sql   ← apaga o banco (desenvolvimento)
│   └── azure_sql/             ← os mesmos scripts para o Azure SQL Database (sem CREATE DATABASE/USE)
├── ferramentas/
│   ├── validar_conteudo.js    ← valida as 8 trilhas e gera o catálogo de hm.licoes
│   ├── executar_sql.py        ← roda um .sql (com GO) no banco do config.ini, sem SSMS
│   ├── gerar_scripts_azure.py ← regenera database/azure_sql/
│   └── cidr_para_azure.py     ← converte os IPs de saída do Render em regras de firewall do Azure
├── tests/
│   ├── test_api.py            ← testes automatizados da API
│   ├── test_desktop_e_hospedagem.py ← bloqueio de celular, conexão com o Azure, scripts e hospedagem
│   ├── e2e/desktop.e2e.js     ← teste de ponta a ponta no Chrome (computador, janela estreita, celular)
│   ├── portfolio_exemplo.json ← projeto publicado usado pelo servidor de demonstração
│   ├── repositorio_memoria.py ← banco em memória para testes e demonstração
│   └── servidor_demo.py       ← sobe o app sem SQL Server
└── docs/
    ├── HOSPEDAGEM_GRATUITA.md ← passo a passo para publicar o curso de graça
    ├── PUBLICAR_NETLIFY_E_GITHUB.html ← guia ilustrado (abra no navegador): Netlify Drop e GitHub Pages
    ├── PUBLICAR_RENDER_AZURE.html ← guia ilustrado PT/EN: app completo no Render + Azure SQL (contas, ranking, certificados)
    ├── MARCA_REGISTRO_VPS_E_CUSTOS.html ← guia ilustrado: marca e software no INPI, VPS Hostinger KVM 2 e custos
    ├── API.md                 ← todos os endpoints, com exemplos
    └── BANCO_DE_DADOS.md      ← dicionário de dados e consultas úteis
```

---

## Instalação (Windows)

### 1. Pré-requisitos
- **Python 3.10 ou superior** (marque "Add Python to PATH" na instalação).
- **SQL Server** (Express, Developer ou Standard) e o **SQL Server Management Studio**. Também serve o **Azure SQL Database** gratuito (veja `docs/HOSPEDAGEM_GRATUITA.md`).
- **Microsoft ODBC Driver 18 for SQL Server** (ou 17). Confira em *Fontes de Dados ODBC (64 bits) → Drivers*.

### 2. Criar o banco
No SSMS, conectado ao seu servidor, abra e execute (F5) na ordem:
1. `database/01_criar_banco.sql` — obrigatório.
2. `database/02_carga_teste.sql` — opcional, para ter alunos e ranking de exemplo.

Sem SSMS: configure o `config.ini` (passo 3) e rode `iniciar.bat --executar-sql database\01_criar_banco.sql`. No Azure SQL, use os arquivos de `database\azure_sql\`.

### 3. Configurar e iniciar
Dê dois cliques em **`iniciar.bat`** (ou, no terminal, `python iniciar.py`).
Na primeira vez o script cria o ambiente virtual `.venv`, instala as dependências e copia `config.exemplo.ini` para `config.ini`. Abra o `config.ini` e ajuste a seção `[banco]`:

```ini
[banco]
driver = ODBC Driver 18 for SQL Server
servidor = localhost\SQLEXPRESS        ; ou NOME-DO-PC\INSTANCIA, ou um IP
banco = HotelMentaSQL
autenticacao_windows = sim             ; nao = usa usuario/senha
trust_server_certificate = sim
```

Rode o `iniciar.bat` de novo. Ele testa o banco, mostra os endereços e abre o navegador:

```
[SQLito] OK: Banco conectado (1460 lições no catálogo).
[SQLito] Abra no computador: http://localhost:8000
[SQLito] Em outro computador da mesma rede: http://192.168.0.15:8000  (celulares e tablets veem o aviso de uso só no computador)
[SQLito] Documentação da API: http://localhost:8000/api/docs
```

Outras opções: `iniciar.bat --testar-banco`, `--porta 8080`, `--sem-navegador`, `--demo` (sem SQL Server) e `--executar-sql ARQUIVO.sql`.

> **Proxy corporativo:** se o `pip` não conseguir baixar pacotes, defina `set HTTPS_PROXY=http://usuario:senha@proxy:porta` antes de rodar o `iniciar.py`.

### 4. Contas de teste (após o `02_carga_teste.sql`)
Senha de todas: **`Hotel@2026`**

| E-mail | Situação |
|---|---|
| `anasouza@teste.hotelmenta.dev` | Hotel: etapas 1 a 14 e 4 lições da 15 (144 lições, 3 certificados; nível Especialista em andamento) e 20 lições da Vet. Portfólio público com o projeto do Hotel e 3 entrevistas no histórico |
| `brunolima@teste.hotelmenta.dev` | Vet: 85 lições, certificados Básico e Intermediário |
| `carlad@teste.hotelmenta.dev` | Agro: 47 lições, reprovada na prova Básica (nota 6,0) |
| `diegorocha@teste.hotelmenta.dev` | Loja: 40 lições, certificado Básico |
| `lucasf@teste.hotelmenta.dev` | Agro: começando (3 lições) |
| `marinacl@teste.hotelmenta.dev` | Banco Menta: etapas 1 a 8 (80 lições), certificados Básico e Intermediário |
| `nelsonagro@teste.hotelmenta.dev` | Economia do Agro: etapas 1 a 5, reprovado e depois aprovado na prova Básica |
| `oliviabi@teste.hotelmenta.dev` | SQL para Power BI: trilha especial completa (8 etapas) e os 2 certificados |
| `rafadbx@teste.hotelmenta.dev` | SQL no Databricks: etapas 1 a 4 (camada bronze) e o certificado Básico |

Para ver a tela de escolha de trilha, crie uma conta nova.

Certificados de teste para verificar: `http://localhost:8000/certificado/HM-TEST-0001` (até `HM-TEST-0012`). Portfólio público de teste: `http://localhost:8000/portfolio/ana.souza`.

### Sem SQL Server (só para conhecer)
Dê dois cliques em **`iniciar_demo.bat`** (ou `iniciar.bat --demo`).
Sobe o app com banco em memória (os dados somem ao fechar). Login: `anasouza@teste.hotelmenta.dev` / `Hotel@2026`.

---

## Como funciona

### Login, cadastro e sessões
- Cadastro pede **nome completo** (impresso no certificado), **apelido** (único, o único dado exibido no ranking), e-mail, senha (8+ caracteres com letras e números) e aceite dos termos (LGPD).
- A senha é guardada com **PBKDF2-SHA256, 200.000 iterações e sal individual** (biblioteca padrão do Python).
- Cada login gera um token aleatório por aparelho. O banco guarda só o **hash SHA-256** do token (`hm.sessoes`), válido por 30 dias (`sessao_dias`). Sair em um aparelho não derruba os outros.
- Proteção contra força bruta: 8 tentativas de login a cada 5 minutos por IP + e-mail; 5 cadastros a cada 10 minutos por IP.
- O aluno pode **excluir a conta** no Perfil (confirmando a senha): a procedure `hm.sp_excluir_aluno` apaga tudo.

### Sincronização entre computadores
1. Ao terminar uma lição, o aparelho cria uma *tentativa* com um identificador único (`client_id`) e a coloca numa **fila local**.
2. A fila é enviada para `POST /api/progresso/sincronizar`. O servidor grava cada tentativa uma única vez: reenvio por queda de conexão não duplica XP.
3. A resposta traz o **progresso consolidado** (XP, lições, impulso, níveis, certificados), que passa a valer em todos os aparelhos.
4. O app sincroniza ao abrir, ao terminar cada lição, ao voltar para a aba, quando a internet volta e a cada 45 segundos. O ícone de nuvem no topo mostra o estado e quantas lições estão na fila.
5. **Sem internet** o aluno continua estudando; as lições ficam guardadas e sobem quando a conexão voltar.

### Ranking
- **Esta semana**: XP ganho de segunda 00:00 (horário de Brasília, configurável em `fuso`) até agora. **Geral**: XP total.
- Calculado pela função `hm.fn_ranking(@desde)` com `RANK()`, então empates dividem a posição.
- Mostra pódio dos 3 primeiros, lista até 50 e a posição do aluno, mesmo fora do top 50.

### As trilhas
Na primeira entrada, o aluno escolhe a trilha; dá para trocar a qualquer momento em **Perfil → Trocar de trilha** (ou no botão acima do mapa). Progresso, provas e certificados ficam guardados por trilha; XP e ranking somam todas.

| # | Tema | Hotel Menta | Clínica Menta Vet | Cooperativa Menta Agro | Menta Store | Nível |
|---|---|---|---|---|---|---|
| 1 | Comandos básicos (SELECT) | Recepção | Recepção da Clínica | Portaria da Cooperativa | Vitrine | Básico |
| 2 | Comparação e filtros | Restaurante | Triagem | Classificação de Grãos | Busca e Filtros | Básico |
| 3 | Agregação | Serviços & Spa | Laboratório | Balança e Armazém | Painel de Vendas | Básico |
| 4 | Manipulação (DML) | Governança | Prontuários | Escritório de Campo | Cadastro de Produtos | Básico |
| 5 | JOIN | Central de Reservas | Consultórios | Talhões e Safras | Carrinho e Pedidos | Intermediário |
| 6 | Funções de texto | Concierge | Banho e Tosa | Comunicação Rural | Catálogo e SEO | Intermediário |
| 7 | Data e hora | Portaria | Sala de Vacinas | Calendário Agrícola | Logística | Intermediário |
| 8 | Condicionais e nulos | Bar da Piscina | Farmácia | Loja Agropecuária | Promoções | Intermediário |
| 9 | Subconsultas e CTEs | Gerência | Diretoria Clínica | Assistência Técnica | Inteligência Comercial | Avançado |
| 10 | Funções de janela | Mirante | Centro de Diagnóstico | Central de Indicadores | Ranking de Vendas | Avançado |
| 11 | Estrutura (DDL) | Obras e Manutenção | Infraestrutura | Galpão de Máquinas | Plataforma | Avançado |
| 12 | Transações | Tesouraria | Financeiro | Tesouraria da Cooperativa | Pagamentos | Avançado |
| 13 | Metadados | Arquivo do Hotel | Arquivo Clínico | Arquivo da Cooperativa | Arquivo de Dados | Avançado |
| 14 | CRUD avançado (OUTPUT, UPDATE/DELETE com JOIN, MERGE) | Central de Cadastros | Cadastro de Pacientes | Cadastro de Cooperados | Gestão de Catálogo | Especialista |
| 15 | Constraints (PK, FK com CASCADE, UNIQUE, CHECK, DEFAULT, NOCHECK) | Controle de Qualidade | Vigilância Sanitária | Normas e Certificação | Regras de Negócio | Especialista |
| 16 | Sequências (SEQUENCE, NEXT VALUE FOR, CYCLE, RESTART) | Emissão de Vouchers | Emissão de Receitas | Emissão de Romaneios | Notas Fiscais | Especialista |
| 17 | Regex (LIKE com [ ], PATINDEX e REGEXP_* do SQL Server 2025) | Central de Atendimento | Microchips e Registros | Rastreabilidade | Antifraude | Especialista |
| 18 | Transactions (TRY/CATCH, THROW, XACT_ABORT, SAVE TRAN, isolamento) | Auditoria Financeira | Faturamento Clínico | Liquidação Financeira | Conciliação de Pagamentos | Especialista |
| 19 | Functions (escalares, inline e multi-instrução) | Escritório de Tarifas | Calculadora Clínica | Calculadora Agronômica | Calculadora de Preços | Especialista |
| 20 | Procedures (parâmetros, OUTPUT, RETURN, SQL dinâmico) | Central de Automação | Rotinas da Clínica | Rotinas da Cooperativa | Automação da Loja | Especialista |
| 21 | Triggers DML (AFTER, INSTEAD OF, inserted/deleted) | Sala de Monitoramento | Prontuário Auditado | Auditoria de Safras | Auditoria de Pedidos | Especialista |
| 22 | Triggers DDL (ON DATABASE, EVENTDATA, bloqueio de DROP) | TI e Segurança | TI da Clínica | TI da Cooperativa | TI da Loja | Especialista |
| 23 | Pivot table (PIVOT, UNPIVOT, pivot dinâmico) | Sala da Diretoria | Painel da Diretoria | Conselho Administrativo | Diretoria Comercial | Especialista |

Nas trilhas novas, o tema de cada etapa é o mesmo da tabela acima:

| # | Banco Menta | Economia do Agro |
|---|---|---|
| 1–4 | Atendimento · Busca de Clientes · Painel de Resultados · Abertura de Contas | Mesa de Operações · Busca de Produtores · Painel da Safra · Cadastro do Campo |
| 5–8 | Carteira de Crédito · Relacionamento com Clientes · Vencimentos · Ofertas e Tarifas | Cadeia Produtiva · Relacionamento com Produtores · Calendário Agrícola · Política Comercial |
| 9–13 | Análise de Risco · Ranking de Carteira · Core Bancário · Tesouraria · Arquivo do Banco | Inteligência de Mercado · Ranking de Produtividade · Plataforma de Dados · Tesouraria · Arquivo de Dados |
| 14–18 | Gestão de Contratos · Regras de Crédito · Boletos e Protocolos · Prevenção à Fraude · Conciliação Bancária | Gestão da Carteira Rural · Regras do Crédito Rural · Emissão de CPR · Qualidade de Cadastro · Conciliação Financeira |
| 19–23 | Calculadora de Juros · Automação do Banco · Auditoria de Contratos · TI do Banco · Diretoria de Crédito | Calculadora do Agro · Automação do Agro · Auditoria do Crédito Rural · TI do Agro · Diretoria de Agronegócio |

Os exercícios trazem situações reais de cada negócio: carteira por modalidade, parcelas vencidas, LTV de garantias, juros compostos e tabela Price, conciliação bancária e prevenção à fraude no Banco Menta; produtividade por hectare, exportações convertidas pelo câmbio do dia, crédito rural (custeio, investimento, Pronaf), sinistralidade do seguro agrícola, clima e CPR na Economia do Agro.

### Trilha especial: SQL para Power BI
Curso curto (**8 etapas, 80 lições, 400 exercícios**), recomendado depois do nível Básico de qualquer trilha. O banco é o *data warehouse* da Distribuidora Menta, já em **modelo estrela**: `fato_vendas` (com chaves órfãs, loja nula e linhas atualizadas depois da última carga, de propósito), `fato_metas`, `dim_calendario` (2025–2026), `dim_cliente`, `dim_produto`, `dim_loja`, `stg_vendas` (área de staging com duplicados, quantidades inválidas, datas inválidas e SKU desconhecido) e `controle_carga`.

| # | Etapa | O que ensina | Nível |
|---|---|---|---|
| 1 | Modelo Estrela | fato × dimensão, granularidade, chave substituta, 1:N, chaves órfãs e membro desconhecido | Básico |
| 2 | Consultas de Importação | só as colunas necessárias, filtros na origem, tipos, agregação antes de importar | Básico |
| 3 | Dimensão Calendário | CTE recursiva, `OPTION (MAXRECURSION)`, dias úteis, `DATETRUNC`, `FORMAT` com mês abreviado | Básico |
| 4 | Limpeza na Origem | `TRY_CAST`/`TRY_CONVERT`, `ISNUMERIC`, `CONVERT` estilo 103, deduplicação com `ROW_NUMBER` | Básico |
| 5 | Views para o Modelo | `CREATE OR ALTER VIEW`, views de fato e dimensão, `GRANT SELECT` para o usuário do gateway | Intermediário |
| 6 | SQL × DAX | `CALCULATE`, `SAMEPERIODLASTYEAR`, `TOTALYTD`, `DIVIDE`, `RANKX` traduzidos para SQL com janelas | Intermediário |
| 7 | Carga Incremental | `RangeStart/RangeEnd`, coluna de controle, `MERGE`, SCD tipo 2 | Intermediário |
| 8 | Performance e Projeto Final | índices, `COLUMNSTORE`, `INCLUDE`, `STRING_AGG … WITHIN GROUP`, query folding e projeto final | Intermediário |

Cargos: Usuário de Excel → Modelador Iniciante → … → **Especialista em BI**. Não há Modo Entrevista nessa trilha; o projeto final (*Modelo estrela pronto para o Power BI*) libera ao concluir as 8 etapas.

### Trilha especial: SQL no Databricks
Curso de **12 etapas, 120 lições e 600 exercícios**, recomendado depois do nível Básico de qualquer trilha e alinhado ao guia do exame **Databricks Certified Data Analyst Associate**. O banco é o *lakehouse* do Banco Menta no catálogo `banco`, organizado na **arquitetura medalhão**, e as etapas seguem as camadas:

| # | Etapa | O que ensina | Camada · Nível |
|---|---|---|---|
| 1 | Bem-vindo ao Lakehouse | SQL warehouse, Photon, Unity Catalog, `catálogo.esquema.tabela`, `LIMIT` em vez de `TOP`, `DESCRIBE`, gerenciadas × externas | Bronze · Básico |
| 2 | Chegada dos Arquivos | volumes, `LIST`, `read_files`, `_metadata`, CTAS com colunas de auditoria, `COPY INTO` idempotente, Auto Loader, Delta Sharing | Bronze · Básico |
| 3 | Explorando o Cru | perfil de dados, `count_if`, `approx_count_distinct`, `try_cast`, `::`, `to_date`, `ILIKE`, `RLIKE` | Bronze · Básico |
| 4 | JSON e Eventos do App | `payload:campo`, campos aninhados, arrays, `explode`, `array_contains`, `collect_list` | Bronze · Básico |
| 5 | Limpeza para a Prata | padronização, números com vírgula, `regexp_replace`, datas, nulos, `GROUP BY ALL`, gravar a prata | Prata · Intermediário |
| 6 | Duplicatas e Junções | `ROW_NUMBER`, **`QUALIFY`**, JOINs, `UNION`, `EXCEPT`, `SELECT * EXCEPT` | Prata · Intermediário |
| 7 | Delta Lake: Alterando Dados | `INSERT`, `UPDATE`, `DELETE`, `INSERT OVERWRITE`, `MERGE` (`SET *`, `NOT MATCHED BY SOURCE`), evolução de esquema, constraints | Prata · Intermediário |
| 8 | Histórico e Viagem no Tempo | `DESCRIBE HISTORY`, `VERSION/TIMESTAMP AS OF`, `@v`, `RESTORE`, `VACUUM`, `UNDROP` | Prata · Intermediário |
| 9 | Modelagem do Ouro | fatos e dimensões, views, materialized views, `REFRESH`, streaming tables, Federation | Ouro · Avançado |
| 10 | Indicadores com Janelas | `date_trunc`, acumulados, `LAG`, participação %, rankings, top N com `QUALIFY`, `NTILE`, atraso, média móvel, percentis | Ouro · Avançado |
| 11 | Performance e Governança | Query Profile, `OPTIMIZE`, liquid clustering, Predictive Optimization, `GRANT`/`REVOKE`, views dinâmicas, filtro de linhas, comentários e tags | Ouro · Avançado |
| 12 | Painéis, Genie e Projeto Final | AI/BI dashboards, parâmetros, alertas, agendamento, Genie e o projeto final bronze → prata → ouro | Ouro · Avançado |

O banco tem sujeira de propósito no bronze (textos com espaços e caixa misturada, valores `1.234,56` e `R$`, datas `dd/MM/yyyy`, linhas reenviadas, lixo) e um **incidente para investigar**: a versão 2 de `prata.limites` é um `UPDATE` de `estagiario@banco.dev` que zerou o limite dos clientes de SP, desfeito com `RESTORE` na etapa 8.

**Laboratório Databricks (simulado).** O `motor-databricks.js` registra o dialeto `databricks` sobre o motor do SQL Server: nomes de três níveis, `USE CATALOG/SCHEMA`, `SHOW`, `DESCRIBE` (`EXTENDED`, `DETAIL`, `HISTORY`), histórico de versões com viagem no tempo e `RESTORE`, `MERGE` com `SET *`/`INSERT *`, CHECK e NOT NULL, `OPTIMIZE`, `CLUSTER BY`, `VACUUM`, `UNDROP`, `COPY INTO`, `read_files` com `_metadata`, JSON com dois-pontos, `explode`, `QUALIFY`, `GROUP BY ALL`, `SELECT * EXCEPT`, views e materialized views, `GRANT`/`REVOKE`/`SHOW GRANTS`, `is_account_group_member`, `mask` e funções de data, texto, arrays e percentis do Databricks. `TOP` é recusado com a dica de usar `LIMIT`, como no Databricks de verdade. Streaming tables e parâmetros `:nome` aparecem só nas perguntas teóricas.

Níveis: **Básico** (etapas 1–4), **Intermediário** (5–8) e **Avançado** (9–12). Cargos: Analista SQL → Explorador do Lakehouse → … → **Analista de Dados Databricks**. Não há Modo Entrevista; o projeto final (*Lakehouse do Banco Menta: da prata ao ouro*) libera ao concluir as 8 primeiras etapas.

Para praticar no Databricks real, a **Free Edition** (gratuita, uso não comercial) tem um SQL warehouse serverless; o catálogo `banco` pode ser recriado lá com os mesmos nomes.

Bancos de exercício (dados fictícios, com nulos, registros sem relacionamento e hierarquia de funcionários de propósito):
- **Hotel Menta** (11 tabelas): hospedes, quartos, reservas, pratos, pedidos, servicos, uso_servicos, funcionarios, pagamentos, caixas, contatos_marketing.
- **Clínica Menta Vet** (12): tutores, pets, consultas, medicamentos, prescricoes, vacinas, vacinacoes, internacoes, funcionarios, pagamentos, caixas, contatos_marketing.
- **Cooperativa Menta Agro** (13): cooperados, talhoes, colheitas, insumos, compras_insumos, maquinas, uso_maquinas, entregas, pagamentos, leituras_clima, funcionarios, caixas, contatos_marketing.
- **Menta Store** (11): clientes, produtos, pedidos, itens_pedido, avaliacoes, transportadoras, entregas, pagamentos, funcionarios, caixas, contatos_marketing.
- **Banco Menta**: clientes, agencias, contas, movimentacoes, produtos, contratos, parcelas, garantias, cartoes, tarifas, funcionarios, caixas, contatos_marketing (e as tabelas de apoio das etapas avançadas).
- **Economia do Agro** (15): municipios, culturas, produtores, safras, precos, exportacoes, credito_rural, seguros, clima, insumos, compras_insumos, pagamentos, funcionarios, caixas, contatos_marketing.
- **SQL para Power BI** (8): fato_vendas, fato_metas, dim_calendario, dim_cliente, dim_produto, dim_loja, stg_vendas, controle_carga.
- **SQL no Databricks** (catálogo `banco`, 14 tabelas + volume): bronze.clientes_raw, bronze.transacoes_raw, bronze.eventos_app, bronze.emprestimos_raw; prata.clientes, prata.contas, prata.transacoes, prata.emprestimos, prata.parcelas, prata.limites; ouro.dim_cliente, ouro.dim_data, ouro.transacoes_diarias; volume `/Volumes/banco/bronze/arquivos` (CSV e JSON).

Cada lição tem explicação com exemplo executável e 5 exercícios. Conceitos gerais (ex.: "o que é ACID") se repetem entre as trilhas; consultas e desafios usam o banco de cada uma. Só a trilha escolhida é baixada pelo navegador.

**Laboratório com sintaxe do SQL Server.** O `motor-sql.js` traz um interpretador de T-SQL que roda no navegador sobre o sql.js: `TOP`, `OFFSET/FETCH`, `GETDATE`, `DATEADD`, `DATEDIFF`, `DATEPART`, `DATENAME`, `EOMONTH`, `FORMAT`, `LEN`, `LEFT/RIGHT`, `CHARINDEX`, `PATINDEX`, `TRANSLATE`, `QUOTENAME`, `ISNULL`, `IIF`, `CHOOSE`, `CAST/CONVERT` (estilos 103, 23, 108; `CONVERT(DATE, '31/03/2026', 103)` também lê texto), `TRY_CAST/TRY_CONVERT` (NULL quando não converte), `ISNUMERIC`, `DATETRUNC`, `FORMAT` com `MMM`/`ddd`, `IDENTITY`, `TRUNCATE`, `GO`, `INFORMATION_SCHEMA.*`, `sys.*` (tables, columns, indexes, objects, foreign_keys, check_constraints, key_constraints, default_constraints, sequences, procedures, triggers, trigger_events, sql_modules), `sp_columns`, `sp_help`, `@@VERSION` e `DB_NAME()`. Também executa de verdade:
- **Lotes T-SQL:** `DECLARE`/`SET`, variáveis de tabela, `IF/ELSE`, `WHILE`/`BREAK`, `BEGIN…END`, `PRINT`, `RETURN`, tabelas temporárias `#tmp` e `SELECT … INTO`.
- **CRUD avançado:** `OUTPUT inserted/deleted` (inclusive `OUTPUT … INTO @tabela`), `UPDATE`/`DELETE` com `JOIN`, `MERGE` com `WHEN MATCHED / NOT MATCHED [BY SOURCE]` e `$action`, `@@ROWCOUNT`, `SCOPE_IDENTITY()`.
- **Constraints:** `ALTER TABLE … ADD/DROP CONSTRAINT`, `CHECK`, `UNIQUE`, `DEFAULT … FOR`, `FOREIGN KEY … ON DELETE CASCADE / SET NULL`, `NOCHECK`/`WITH CHECK`.
- **Sequências:** `CREATE/ALTER/DROP SEQUENCE`, `NEXT VALUE FOR` (também em `DEFAULT`), `MINVALUE/MAXVALUE/CYCLE`, `RESTART`, `sp_sequence_get_range`.
- **Regex:** `LIKE` com `[ ]` e `[^ ]`, `PATINDEX` e as funções do SQL Server 2025 `REGEXP_LIKE`, `REGEXP_REPLACE`, `REGEXP_SUBSTR`, `REGEXP_INSTR`, `REGEXP_COUNT`, `REGEXP_SPLIT_TO_TABLE` e `REGEXP_MATCHES`.
- **Transações e erros:** `BEGIN TRY/CATCH`, `THROW`, `RAISERROR`, `ERROR_NUMBER/MESSAGE/SEVERITY/STATE/LINE/PROCEDURE()`, `XACT_ABORT`, `XACT_STATE()`, `@@TRANCOUNT`, `SAVE TRAN` e `ROLLBACK TRAN ponto`.
- **Functions e procedures:** `CREATE [OR ALTER] FUNCTION` (escalar, inline e multi-instrução), `CREATE [OR ALTER] PROC` com parâmetros padrão, `OUTPUT`, `RETURN`, `EXEC @status = …`, `INSERT … EXEC` e `sp_executesql`.
- **Triggers:** DML `AFTER` e `INSTEAD OF` (em tabelas e views), `inserted/deleted`, `UPDATE(coluna)`, `DISABLE/ENABLE TRIGGER`; DDL `ON DATABASE` com grupos de eventos e `EVENTDATA()`.
- **PIVOT / UNPIVOT**, inclusive com CTE na origem e pivot dinâmico com `STRING_AGG` + `sp_executesql`.
- **Sintaxe de BI aceita:** `STRING_AGG … WITHIN GROUP (ORDER BY …)`, `OPTION (MAXRECURSION n)` e outras dicas de consulta, índices `CLUSTERED`/`NONCLUSTERED`/`COLUMNSTORE` com `INCLUDE`, `CREATE OR ALTER VIEW`. `GRANT/DENY/REVOKE` e `CREATE USER/ROLE/LOGIN` são aceitos e só exibem mensagem (o laboratório não tem usuários). `ROLLUP`/`GROUPING SETS` ainda não; as lições usam `UNION ALL`.

Chaves estrangeiras são verificadas. O relógio é fixo em **20/11/2026 09:30**, para que exercícios com datas tenham sempre a mesma resposta. O que depende de várias sessões ao mesmo tempo (bloqueios, deadlocks, níveis de isolamento) e os gatilhos de servidor (`ON ALL SERVER`) são ensinados com exemplos de referência, múltipla escolha e montagem.

**Como a resposta de código é corrigida:** o app executa a consulta do aluno e a resposta esperada no mesmo banco e compara os resultados (ordem só importa quando o exercício pede ORDER BY). Por isso respostas escritas de outro jeito, mas corretas, também valem. Alguns exercícios exigem um comando específico (ex.: `EXISTS`, `ROLLBACK`, `MERGE`). Exercícios que precisam de objetos prontos (uma procedure, um gatilho, uma sequência) trazem um `setup` escondido, executado antes da resposta do aluno e da resposta esperada.

**Ferramentas de aprendizagem**
- **Onde a consulta errou.** Quando a resposta de código está errada, o app compara o resultado do aluno com o esperado e explica a diferença em linguagem simples: colunas a mais ou faltando, linhas sobrando (filtro faltando), linhas faltando (filtro restritivo ou INNER JOIN no lugar de LEFT JOIN), linhas repetidas (JOIN multiplicando ou falta de DISTINCT), ordem errada (ORDER BY) ou coluna com valor diferente (com exemplo). O botão *Comparar os resultados lado a lado* abre as duas tabelas com as linhas sobrando, as faltando e as colunas divergentes destacadas.
- **Passo a passo da consulta.** Disponível no exemplo de cada lição, nos desafios de código e no laboratório. Mostra a consulta sendo executada na ordem real do SQL Server: FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → TOP/OFFSET. A cada passo, destaca a cláusula, mostra a tabela intermediária e um gráfico com quantas linhas sobraram. Tem reprodução automática e navegação pelas setas do teclado. Funciona com um SELECT por vez (com ou sem CTE); consultas com UNION, PIVOT ou SELECT INTO são executadas normalmente.
- **Laboratório livre** (botão *Laboratório* acima da trilha ou em Perfil → Laboratório SQL): diagrama das tabelas com chaves primárias, chaves estrangeiras e linhas de relacionamento (1 → N), zoom e modo lista. Ao tocar numa tabela, aparecem as colunas com tipos (toque para inserir no editor), os relacionamentos com o botão *Montar JOIN*, *Ver dados* e *Contar linhas*. O banco fica vivo durante a sessão, como uma janela de consulta do SSMS: tabelas, procedures e dados criados continuam lá entre execuções (e aparecem no diagrama) até o aluno tocar em *Reiniciar banco*. Mostra todos os conjuntos de resultados do lote, mensagens de PRINT, tempo de execução e aviso de transação aberta; guarda o rascunho e o histórico das últimas 10 execuções por trilha; Ctrl+Enter executa.

**Para criar ou alterar lições:** edite `frontend/js/trilhas/<trilha>.js` (cada arquivo traz o banco da trilha e as 23 etapas), rode `npm install sql.js@1.10.3` e `node ferramentas/validar_conteudo.js` (ou `node ferramentas/validar_conteudo.js vet` para uma trilha só). Ele executa todos os exemplos e respostas no laboratório. Se mudar a quantidade de lições, gere as linhas novas com `node ferramentas/validar_conteudo.js --catalogo`, cole no `MERGE hm.licoes` do `01_criar_banco.sql` e execute o script de novo.

**Nova trilha:** crie `frontend/js/trilhas/<id>.js` no mesmo formato, inclua-a em `TRILHAS_INFO` e `CARGOS` (index.html), em `CARGOS` (servicos.py), em `ETAPAS` (certificado_pdf.py), no `MERGE hm.trilhas` do `01_criar_banco.sql`, em `PROJETOS` (projetos.js) e no mapa da entrevista (entrevista.js). Uma **trilha especial** (curta) leva `et: <etapas>` e `especial: 1` em `TRILHAS_INFO`; o app ajusta mapa, cargos, níveis de certificado e liberação do projeto à quantidade de etapas, e o servidor só mostra os níveis que têm lições.

### Níveis, provas e certificados
| Nível | Etapas | Carga horária | Mascote no certificado |
|---|---|---|---|
| Básico | 1 a 4 | 20 h | óculos (Analista) |
| Intermediário | 5 a 8 | 20 h | headset (Desenvolvedor) |
| Avançado | 9 a 13 | 25 h | coroa e capa (DBA Supremo) |
| Especialista | 14 a 23 | 50 h | coroa e capa (DBA Supremo), faixa vinho |

- A prova é liberada quando **todas as lições** do nível estão concluídas (o servidor confere).
- **15 questões sorteadas**, distribuídas igualmente entre as etapas do nível, sem gastar energia, sem dicas e sem correção durante a prova.
- **Nota mínima 7,0.** Aprovado → o certificado é emitido na hora, com código único `HM-XXXX-XXXX`. Pode refazer a prova quantas vezes quiser; a melhor nota fica registrada e o certificado é emitido uma única vez por nível.
- O certificado aparece no app, pode ser baixado em **PDF (A4 paisagem, com QR Code)** e conferido por qualquer pessoa em `/certificado/{codigo}`.
- Para os links e QR Codes apontarem para o endereço certo, ajuste `url_publica` no `config.ini`.

### XP e regras de jogo
10 XP (⭐ estrelas) por acerto, +5 de bônus a cada 3 acertos seguidos, 5 cargas de 🔋 energia (−1 por erro, +1 por lição concluída, recarga diária). O servidor aplica um **teto de XP por lição** (`xp_maximo` = 15 × nº de questões) para barrar valores adulterados. O cargo do aluno sobe a cada etapa concluída e depende da trilha: Estagiário → … (24 cargos, um por etapa) → Diretor do Hotel, Diretor Clínico, Presidente da Cooperativa ou CEO da Menta Store.

---

### Autocompletar no editor
Nos desafios de código, no projeto final, no Modo Entrevista e no laboratório, o editor sugere enquanto o aluno digita: tabelas depois de `FROM`/`JOIN`, colunas das tabelas da consulta, colunas de um apelido depois do ponto (`p.` → `id`, `status`…), variáveis `@` declaradas, funções e comandos. As sugestões aparecem numa faixa logo abaixo do editor, e **Tab** aceita a primeira. Tabelas criadas no próprio exercício (`CREATE TABLE`, `DECLARE @t TABLE`) também entram nas sugestões.

### Portfólio (projeto final e página pública)
- Cada trilha tem um **projeto final** (`frontend/js/projetos.js`) com 5 tarefas de negócio para um cliente fictício (ex.: *Relatório da diretoria da Menta Store*). Ele aparece na trilha logo depois da etapa 8 e é liberado quando as etapas 1 a 8 estão concluídas (são 7 projetos: um por trilha, inclusive *Raio-X da carteira de crédito do Banco Menta*, *Painel econômico da safra* e *Modelo estrela pronto para o Power BI*).
- Cada tarefa é corrigida como os desafios de código (resultado comparado com o gabarito), com *Onde a consulta errou*, Passo a passo e, a partir do 2º erro, ajuda do tutor. O aluno escreve uma **conclusão** para o cliente em cada tarefa.
- Com as 5 tarefas certas, **Publicar no portfólio** grava as consultas, as primeiras 10 linhas de cada resultado e as conclusões. A página pública fica em **`/portfolio/{apelido}`**, com os certificados (cada um com link de verificação), botão *Compartilhar no LinkedIn* e metadados para a prévia do link.
- Em Perfil → Portfólio o aluno liga ou desliga a página pública, copia o link, vê a prévia e **baixa o portfólio em HTML** (funciona também no modo demonstração).
- No certificado, o botão **Adicionar ao LinkedIn** abre o formulário de *Licenças e certificados* do LinkedIn já preenchido (nome, emissor SQLito, data, código e link de verificação).

### Modo Entrevista
Treino no formato de processo seletivo para analista de dados, nos níveis **Júnior (15 min)**, **Pleno (20 min)** e **Sênior (25 min)**. Cada sessão sorteia 3 perguntas clássicas do nível (ex.: segundo maior salário, SELF JOIN, percentual do total, top 1 por grupo, soma acumulada, variação com LAG), adaptadas ao banco da trilha, e completa com 2 desafios de código das etapas do nível. O cronômetro fica sempre visível; dá para executar a consulta, navegar entre as perguntas e pular, mas não há dicas nem correção na hora. No fim: acertos, nota, tempo, situação de cada pergunta, uma resposta modelo, *Comparar resultados* e ajuda do tutor nas erradas. O histórico e a melhor nota por nível ficam no servidor (`hm.entrevistas`).

### Tutor com IA
A partir do **2º erro na mesma questão** (lição, projeto final ou relatório da entrevista) aparece **Pedir ajuda ao SQLito**. O servidor envia à API da Anthropic (Claude) o enunciado, a consulta do aluno, a mensagem de erro, o diagnóstico automático, as tabelas envolvidas e a resposta esperada como referência, com a instrução de explicar o erro em até 120 palavras **sem entregar a resposta pronta**. A chave fica só no servidor.

Para ligar, edite o `config.ini`:
```
[ia]
habilitado = sim
chave_api = sk-ant-...          (ou a variável de ambiente ANTHROPIC_API_KEY)
modelo = claude-haiku-5-5
limite_diario = 20              (explicações por aluno por dia)
```
Cada explicação é uma chamada paga à API. O uso fica em `hm.tutor_usos` (tokens de entrada e saída) e a visão `hm.vw_tutor_uso_diario` resume chamadas e tokens por dia para acompanhar o custo. Falhas da API não contam no limite do aluno. Com o tutor desligado (ou no modo demonstração), o botão mostra uma explicação automática montada pelo próprio app a partir do diagnóstico.

## Conta no cabeçalho (apelido, foto/avatar e sair)
No canto superior direito aparecem a foto (ou a inicial) e o **apelido** do aluno. Clicando nele, abre um menu com:
- **Enviar foto:** a imagem é recortada no centro e reduzida para 192 × 192 px, em JPEG.
- **Avatares prontos:** 18 opções.
- **Remover a foto.**
- **Meu perfil.**
- **Sair da conta:** pede confirmação antes de sair.

A foto aparece também no Perfil e na sua linha do Ranking. Ela fica salva no navegador, separada para cada aluno (`hm.avatar.<id>`).

## Identidade visual e recompensas
A paleta é **azul-marinho** (`#0B1F3A`, textos e fundos escuros), **azul-elétrico** (`#1E6BFF`, cor principal, botões e acertos), **laranja** (`#FF7A1A`, destaques, estrelas e foco) e **tons claros** (`#F4F7FC`, `#E6EEFF`, `#FFF1E6`). O tema escuro usa as mesmas cores sobre `#0A1426`.

| Ideia | Símbolo | O que conta |
|---|---|---|
| Tentativas por lição | 🔋 **Energia** (bateria com 5 cargas) | Cada erro gasta 1 carga; a lição concluída devolve 1; recarrega todo dia e pelo botão *Recarregar energia* |
| Pontos de experiência | ⭐ **Estrelas (XP)** | 10 por acerto, +5 a cada 3 acertos seguidos |
| Constância | 🚀 **Impulso** | Dias seguidos de estudo |

Os níveis dos certificados têm cor própria: Básico (azul-elétrico), Intermediário (ciano), Avançado (laranja) e Especialista (azul-marinho). Os nomes internos da API continuam os mesmos (`vidas`, `ofensiva`, `xp`), para não quebrar bancos e integrações existentes.

**Cores das etapas na trilha:** etapa em andamento em azul-elétrico `#1E6BFF`, etapa concluída em verde-menta `#3EB489` (lições concluídas também ficam menta) e etapa ainda não iniciada em cinza-claro `#E9ECF1`.

**Ícone das aulas por trilha:** Hotel = mala, Vet = pata, Cooperativa Agro = trator, Loja = sacola, Banco = moeda, Economia do Agro = trigo, SQL para Power BI = gráfico de barras, SQL no Databricks = camadas empilhadas (campo `aula` em `TRILHAS_INFO`). 

**Trilha em linha de execução:** as aulas de cada etapa aparecem como cartões ligados por uma linha vertical ("Aula 3 de 10 · título"). Concluída: cartão com ícone menta e ✓ Concluída, e a linha fica menta até ali. Atual: cartão azul-elétrico com ponto pulsando, botão Começar e o SQLito ao lado. Bloqueada: cartão tracejado cinza com cadeado. No celular os cartões ocupam a largura toda e o SQLito sai.

**Backup do progresso (modo demonstração):** no Perfil, *Exportar meu progresso* baixa um arquivo `sqlito-progresso-<apelido>-<data>.json` com aulas, XP, provas, certificados, projetos, entrevistas, avatar e rascunhos do laboratório (a senha vai só como código/hash). Em outro computador, o aluno usa *Importar meu arquivo de backup* na tela de login (ou *Importar progresso* no Perfil): a conta é criada nesse navegador com o mesmo e-mail e senha, e o progresso aparece. A importação só acrescenta o que falta (importar duas vezes não duplica nada) e recusa arquivos danificados ou editados (código de verificação). Com servidor conectado (Render + Azure) o progresso já fica na conta e o backup não aparece.

**Ranking:** pontos formatados com separador de milhar (ex.: 999.999 XP), com espaço reservado para até 6 dígitos no pódio e na lista, no computador e no celular.

## Celulares e tablets: bloquear, avisar ou liberar
Uma linha no `frontend/config.js` decide o que acontece no celular:

| `celular:` | O que o aluno vê no celular ou tablet |
|---|---|
| `'bloquear'` | Tela *"O SQLito é exclusivo para computadores"*, com o link para copiar. O app não abre. |
| `'avisar'` (padrão) | Tela *"O SQLito fica melhor no computador"*, com **Continuar mesmo assim**. A escolha fica salva no navegador e o app abre no layout de celular: abas embaixo, telas em coluna e só a foto no cabeçalho. |
| `'liberar'` | Abre direto no layout de celular. |

- **No navegador:** `frontend/js/somente-desktop.js` roda antes do app. Ele identifica celular e tablet pelo User-Agent e também o que o User-Agent não mostra: iPad com iPadOS (que se apresenta como Mac), celular com *"versão para computador"* ligada (tela de toque sem mouse) e telas pequenas com toque. No celular, os textos dizem "toque" em vez de "clique".
- **No servidor** (caminho completo): com `celular = bloquear` no `config.ini` (ou `HM_CELULAR=bloquear`), o middleware `_somente_desktop` já entrega `frontend/somente-desktop.html` a celulares. Com `avisar` ou `liberar`, ele entrega o app normalmente. Certificados (`/certificado/...`) e portfólios (`/portfolio/...`) sempre abrem no celular.
- **No computador:** menu lateral fixo e área de conteúdo de até 1.240 px. Só no modo `'bloquear'`, uma janela com menos de 960 px mostra *"Aumente a janela do navegador"*. Nos outros modos, a janela estreita usa o layout de celular.
- **No celular, dois cuidados:**
  - os exercícios de escrever SQL e o laboratório funcionam, mas são mais confortáveis no computador;
  - no modo demonstração (GitHub Pages / Netlify), o progresso do celular fica no celular e não se junta ao do computador.

## Publicação em produção (acesso pela internet)
- **De graça:** siga [`docs/HOSPEDAGEM_GRATUITA.md`](docs/HOSPEDAGEM_GRATUITA.md). Ele traz três caminhos: Netlify Drop (demonstração em 5 minutos), GitHub Pages (demonstração com publicação automática) e Render + Azure SQL Database (completo).
- **VPS paga (Hostinger KVM 2 ou outra com Ubuntu):** a pasta `deploy/vps/` tem `docker-compose.yml` (SQL Server 2022 Express + app + Caddy com HTTPS automático), `.env.exemplo`, `instalar.sh` (Docker, firewall, swap, banco, login do app, backup diário), `backup.sh` e `atualizar.sh`. Passo a passo ilustrado e custos em `docs/MARCA_REGISTRO_VPS_E_CUSTOS.html`.
- **Registro no INPI:** `python ferramentas/gerar_hash_registro.py` gera o pacote do código-fonte e o resumo SHA-512 para o pedido de registro de programa de computador (pasta `registro_inpi/`, fora do Git).
- **Servidor próprio:** coloque o servidor atrás de um **proxy reverso com HTTPS** (IIS com ARR, Nginx ou Caddy) apontando para `http://127.0.0.1:8000`, e use `host = 127.0.0.1` no `config.ini`.
- Use um usuário SQL dedicado com permissão apenas no banco `HotelMentaSQL` (`db_datareader`, `db_datawriter` e `EXECUTE` no schema `hm`).
- Agende `EXEC hm.sp_limpar_sessoes_expiradas` diariamente no SQL Agent.
- Faça backup do banco: ele é a única fonte de verdade do progresso e dos certificados.

## Testes
**Automatizados da API** (44 testes, com banco em memória):
```
pip install fastapi uvicorn reportlab tzdata httpx pytest
python -m pytest tests -q
```
**De ponta a ponta no navegador** (Chrome automatizado; exige Node.js 18+):
```
iniciar_demo.bat                      (deixe aberto)
cd tests\e2e
npm install
npm test
```
O E2E confere:
- o computador (1440 × 900): cadastro, escolha entre as 8 trilhas, menu lateral, uma lição completa e o laboratório com Ctrl+Enter;
- a janela estreita, que pede para aumentar;
- o iPhone, que recebe o aviso do servidor;
- o celular com *"versão para computador"*, que recebe o aviso do próprio app.

A trilha Databricks tem um E2E próprio (`node databricks.e2e.js`): escolha da trilha, lição 1 com o gabarito, laboratório no dialeto Databricks (GROUP BY ALL, QUALIFY, JSON, DESCRIBE HISTORY, RESTORE, TOP recusado) e os 3 níveis de certificado.

As capturas de tela ficam em `tests/e2e/capturas/`. Para testar outro endereço (ex.: o site publicado), use `set MENTA_URL=https://sqlito.onrender.com` antes do `npm test`.

**Conteúdo das lições:** `node ferramentas/validar_conteudo.js` executa os 7.900 exercícios no motor SQL (os da trilha Databricks no dialeto Databricks).

**Testes da API, em detalhe:**
Os testes usam o repositório em memória e cobrem cadastro, escolha de trilha, certificados separados por trilha, login, validações, limite de tentativas, sincronização entre dois aparelhos, idempotência, ranking, prova (bloqueada, reprovada, aprovada), emissão única do certificado, PDF, página de verificação, portfólio (publicar, página pública, privacidade, escape de HTML), Modo Entrevista (histórico, melhor nota, idempotência), tutor com IA (desligado, limite diário, falha da API, com a API simulada) e exclusão de conta.

## Limitações conhecidas
- A correção dos exercícios e da prova acontece no navegador do aluno (é o que permite rodar SQL de verdade sem expor o SQL Server). O servidor valida liberação, limites e tetos de XP, mas um aluno com conhecimento técnico poderia forjar o número de acertos. Para provas com valor formal, o próximo passo é mover o banco de questões e a correção da prova para o servidor.
- O projeto final e o Modo Entrevista também são corrigidos no navegador; o portfólio publica o que o aluno enviou. Por isso a página pública diz que as consultas foram corrigidas automaticamente, sem valor de certificação.
- O tutor com IA pode errar; a explicação vem marcada como gerada por IA.
- Não há recuperação de senha por e-mail nesta versão (exige um servidor SMTP); a redefinição pode ser feita pelo administrador gerando um novo hash.
