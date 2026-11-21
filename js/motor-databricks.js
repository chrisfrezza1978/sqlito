/* SQLito — dialeto Databricks SQL para o laboratório (simulado no navegador).
   Traduz o Databricks SQL para o interpretador T-SQL do SQLito (que roda sobre o SQLite) e simula
   o que é do Lakehouse: Unity Catalog (banco.bronze/prata/ouro), volumes, read_files, COPY INTO,
   Delta Lake (histórico, viagem no tempo, RESTORE, VACUUM, OPTIMIZE, liquid clustering),
   MERGE com SET * / INSERT *, QUALIFY, GROUP BY ALL, SELECT * EXCEPT, JSON com dois-pontos,
   explode, GRANT/REVOKE, constraints CHECK, views dinâmicas e materialized views.
   Nomes físicos: banco.prata.clientes vira a tabela prata_clientes no SQLite. */
(function (raiz) {
  'use strict';
  const MS = raiz.MotorSQL;
  if (!MS || !MS.registrarDialeto) return;
  const ESQ = ['bronze', 'prata', 'ouro'];
  const CAT = 'banco';
  const USUARIO = 'aluno@sqlito.dev';
  const GRUPOS = ['alunos', 'analistas'];
  const RETENCAO_H = 168;
  const MAX_VERSOES = 60;

  class ErroDbx extends Error { constructor(m, n) { super(m); this.numero = n || 50000; } }
  const erro = (cls, msg) => new ErroDbx(`[${cls}] ${msg}`);

  /* ------------------------------------------------------------------ literais */
  function mascarar(sql) {
    const lits = []; let code = '';
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'" || c === '"') {
        let j = i + 1, s = '';
        while (j < sql.length) {
          if (sql[j] === '\\' && j + 1 < sql.length) { s += sql[j + 1] === "'" ? "''" : sql[j + 1]; j += 2; continue; }
          if (sql[j] === c) { if (sql[j + 1] === c) { s += c === "'" ? "''" : '"'; j += 2; continue; } break; }
          s += sql[j] === "'" && c === '"' ? "''" : sql[j]; j++;
        }
        lits.push("'" + s + "'"); code += `\u0001${lits.length - 1}\u0002`; i = j;
      } else if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; code += '\n'; }
      else if (c === '/' && sql[i + 1] === '*') { const f = sql.indexOf('*/', i + 2); i = f < 0 ? sql.length : f + 1; code += ' '; }
      else if (c === '`') { const f = sql.indexOf('`', i + 1); const nome = sql.slice(i + 1, f < 0 ? sql.length : f); code += /^[A-Za-z_]\w*$/.test(nome) ? nome : '[' + nome + ']'; i = f < 0 ? sql.length : f; }
      else code += c;
    }
    return { code, lits };
  }
  const LIT = /\u0001(\d+)\u0002/;
  const desm = (s, lits) => s.replace(/\u0001(\d+)\u0002/g, (m, i) => lits[+i]);
  const valorLit = (tok, lits) => { const m = LIT.exec(tok || ''); return m ? lits[+m[1]].slice(1, -1).replace(/''/g, "'") : null; };

  /* ------------------------------------------------------------------ utilidades de texto */
  function fechar(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { if (d === 0) return k; d--; } } return s.length; }
  function dividirTopo(s, sep) { const out = []; let d = 0, ini = 0; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(') d++; else if (c === ')') d--; else if (d === 0 && s.startsWith(sep, k)) { out.push(s.slice(ini, k)); ini = k + sep.length; } } out.push(s.slice(ini)); return out; }
  function acharTopo(s, re, de) { // primeira ocorrência de re (com \b) fora de parênteses a partir de de
    const g = new RegExp(re.source, 'gi'); g.lastIndex = de || 0; let m;
    while ((m = g.exec(s))) { let d = 0; for (let k = 0; k < m.index; k++) { if (s[k] === '(') d++; else if (s[k] === ')') d--; } if (d === 0) return m; }
    return null;
  }
  function trocarFuncao(s, nome, fn) { // troca nome(args) por fn(args[]) respeitando parênteses
    const re = new RegExp(`\\b${nome}\\s*\\(`, 'gi'); let m, out = '', ult = 0;
    while ((m = re.exec(s))) {
      const ini = m.index + m[0].length, f = fechar(s, ini);
      const args = s.slice(ini, f).trim() === '' ? [] : dividirTopo(s.slice(ini, f), ',').map(x => x.trim());
      out += s.slice(ult, m.index) + fn(args); ult = f + 1; re.lastIndex = f + 1;
    }
    return out + s.slice(ult);
  }
  const q = n => '[' + n + ']';
  const fis = (esq, t) => `${esq}_${t}`;
  const logico = n => { const m = /^(bronze|prata|ouro)_(.+)$/i.exec(n); return m ? `${CAT}.${m[1].toLowerCase()}.${m[2]}` : n; };

  /* ------------------------------------------------------------------ SQLite direto */
  const linhas = (db, sql, p) => { const r = db.exec(sql, p); return r.length ? r[0].values : []; };
  const um = (db, sql, p) => { const v = linhas(db, sql, p); return v.length ? v[0][0] : null; };
  const existe = (db, n) => !!um(db, "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [n]);
  const ehView = (db, n) => um(db, "SELECT type FROM sqlite_master WHERE lower(name)=lower(?)", [n]) === 'view';
  const nomeReal = (db, n) => um(db, "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [n]) || n;
  const colunas = (db, n) => linhas(db, `SELECT name, type FROM pragma_table_info('${n.replace(/'/g, "''")}')`);
  const contar = (db, n) => um(db, `SELECT COUNT(*) FROM "${n}"`) || 0;
  const tabelasUsuario = db => linhas(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r => r[0]);
  const json = v => JSON.stringify(v);
  const agora = () => MS.AGORA.replace(' ', 'T') + '.000+0000';

  /* ------------------------------------------------------------------ catálogo interno */
  function iniciar(db, b) {
    db.exec(`CREATE TABLE IF NOT EXISTS __historico (tabela TEXT, versao INTEGER, ts TEXT, usuario TEXT, operacao TEXT, parametros TEXT, metricas TEXT);
CREATE TABLE IF NOT EXISTS __meta (tabela TEXT PRIMARY KEY, tipo TEXT, comentario TEXT, local TEXT, cluster TEXT, consulta TEXT, criado TEXT, arquivos INTEGER, dono TEXT);
CREATE TABLE IF NOT EXISTS __comentarios (tabela TEXT, coluna TEXT, comentario TEXT);
CREATE TABLE IF NOT EXISTS __checks (tabela TEXT, nome TEXT, condicao TEXT);
CREATE TABLE IF NOT EXISTS __grants (objeto TEXT, tipo TEXT, principal TEXT, privilegio TEXT);
CREATE TABLE IF NOT EXISTS __tags (objeto TEXT, coluna TEXT, chave TEXT, valor TEXT);
CREATE TABLE IF NOT EXISTS __arquivos (caminho TEXT, tabela TEXT, tamanho INTEGER, modificado TEXT);
CREATE TABLE IF NOT EXISTS __copy (tabela TEXT, arquivo TEXT);
CREATE TABLE IF NOT EXISTS __lixeira (tabela TEXT, guardada TEXT, quando TEXT);
CREATE TABLE IF NOT EXISTS __vacuum (tabela TEXT, versao INTEGER);`);
    for (const t of tabelasUsuario(db)) {
      if (!um(db, 'SELECT 1 FROM __historico WHERE tabela=?', [t])) {
        const ts = um(db, 'SELECT criado FROM __meta WHERE tabela=?', [t]) || '2026-11-02T08:00:00.000+0000';
        db.run('INSERT INTO __historico VALUES (?,?,?,?,?,?,?)', [t, 0, ts, 'engenharia@banco.dev', 'CREATE TABLE', '{}', json({ numOutputRows: contar(db, t) })]);
        db.exec(`CREATE TABLE "__v_${t}_0" AS SELECT * FROM "${t}"`);
      }
      if (!um(db, 'SELECT 1 FROM __meta WHERE tabela=?', [t])) db.run('INSERT INTO __meta (tabela, tipo, criado, arquivos, dono) VALUES (?,?,?,?,?)', [t, 'MANAGED', '2026-11-02T08:00:00.000+0000', Math.max(1, Math.ceil(contar(db, t) / 40)), 'engenharia@banco.dev']);
    }
    for (const r of linhas(db, "SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'"))
      if (!um(db, 'SELECT 1 FROM __meta WHERE tabela=?', [r[0]])) db.run('INSERT INTO __meta (tabela, tipo, criado, dono) VALUES (?,?,?,?)', [r[0], 'VIEW', '2026-11-02T08:00:00.000+0000', 'engenharia@banco.dev']);
    funcoes(db);
  }

  /* ------------------------------------------------------------------ funções do Databricks */
  const pad2 = n => String(n).padStart(2, '0');
  const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function lerData(v) {
    if (v == null || v === '') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v));
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    return isNaN(d) ? null : d;
  }
  const iso = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const isoTs = d => `${iso(d)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  function formatar(d, f) {
    return f.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|mm|ss|EEE/g, t => ({
      yyyy: d.getUTCFullYear(), yy: String(d.getUTCFullYear()).slice(2), MMMM: MESES[d.getUTCMonth()], MMM: MESES[d.getUTCMonth()].slice(0, 3),
      MM: pad2(d.getUTCMonth() + 1), M: d.getUTCMonth() + 1, dd: pad2(d.getUTCDate()), d: d.getUTCDate(), HH: pad2(d.getUTCHours()), H: d.getUTCHours(),
      mm: pad2(d.getUTCMinutes()), ss: pad2(d.getUTCSeconds()), EEE: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] }[t]));
  }
  function lerComFormato(s, f) {
    if (s == null) return null; s = String(s).trim(); if (!f) return lerData(s);
    const partes = {}; let re = '^';
    f.replace(/yyyy|MM|M|dd|d|HH|mm|ss|[^yMdHms]+/g, t => { if (/^(yyyy|MM|M|dd|d|HH|mm|ss)$/.test(t)) { partes[Object.keys(partes).length] = t; re += t === 'yyyy' ? '(\\d{4})' : '(\\d{1,2})'; } else re += t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    const m = new RegExp(re + '$').exec(s); if (!m) return null;
    const v = { yyyy: 1970, MM: 1, dd: 1, HH: 0, mm: 0, ss: 0 };
    Object.values(partes).forEach((t, i) => { v[t === 'M' ? 'MM' : t === 'd' ? 'dd' : t] = +m[i + 1]; });
    const d = new Date(Date.UTC(v.yyyy, v.MM - 1, v.dd, v.HH, v.mm, v.ss));
    return d.getUTCMonth() === v.MM - 1 && d.getUTCDate() === v.dd ? d : null;
  }
  const arr = v => { if (v == null) return null; try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; } };
  function funcoes(db) {
    const f = (nome, fn) => { const g = (...a) => fn(...a); Object.defineProperty(g, 'length', { value: -1 }); db.create_function(nome, g); };
    f('date_format', (d, fm) => { const x = lerData(d); return x ? formatar(x, String(fm)) : null; });
    f('to_date', (s, fm) => { const x = lerComFormato(s, fm); return x ? iso(x) : null; });
    f('to_timestamp', (s, fm) => { const x = lerComFormato(s, fm); return x ? isoTs(x) : null; });
    f('date_add', (d, n) => { const x = lerData(d); if (!x || n == null) return null; x.setUTCDate(x.getUTCDate() + +n); return iso(x); });
    f('date_sub', (d, n) => { const x = lerData(d); if (!x || n == null) return null; x.setUTCDate(x.getUTCDate() - +n); return iso(x); });
    f('add_months', (d, n) => { const x = lerData(d); if (!x || n == null) return null; const dia = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + +n); const fim = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(dia, fim)); return iso(x); });
    f('last_day', d => { const x = lerData(d); return x ? iso(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0))) : null; });
    f('__dbx_datediff', (a, b) => { const x = lerData(a), y = lerData(b); return x && y ? Math.round((Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate())) / 864e5) : null; });
    f('months_between', (a, b) => { const x = lerData(a), y = lerData(b); if (!x || !y) return null; return Math.round(((x.getUTCFullYear() - y.getUTCFullYear()) * 12 + x.getUTCMonth() - y.getUTCMonth() + (x.getUTCDate() - y.getUTCDate()) / 31) * 1e8) / 1e8; });
    f('date_trunc', (u, d) => { const x = lerData(d); if (!x) return null; u = String(u).toUpperCase();
      if (u === 'YEAR' || u === 'YYYY') return `${x.getUTCFullYear()}-01-01`; if (u === 'QUARTER') return `${x.getUTCFullYear()}-${pad2(Math.floor(x.getUTCMonth() / 3) * 3 + 1)}-01`;
      if (u === 'MONTH' || u === 'MM' || u === 'MON') return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-01`;
      if (u === 'WEEK') { const k = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - k); return iso(x); }
      if (u === 'DAY' || u === 'DD') return iso(x); if (u === 'HOUR') return `${iso(x)} ${pad2(x.getUTCHours())}:00:00`; return isoTs(x); });
    f('quarter', d => { const x = lerData(d); return x ? Math.floor(x.getUTCMonth() / 3) + 1 : null; });
    f('dayofweek', d => { const x = lerData(d); return x ? x.getUTCDay() + 1 : null; });
    f('weekofyear', d => { const x = lerData(d); if (!x) return null; const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); const dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3); const p = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - p) / 864e5 - 3 + ((p.getUTCDay() + 6) % 7)) / 7); });
    f('make_date', (y, m, d) => (y == null || m == null || d == null ? null : `${y}-${pad2(m)}-${pad2(d)}`));
    f('try_divide', (a, b) => (a == null || b == null || +b === 0 ? null : +a / +b));
    f('lpad', (s, n, p) => { if (s == null) return null; s = String(s); p = p == null ? ' ' : String(p); if (s.length >= n) return s.slice(0, n); let x = ''; while (x.length + s.length < n) x += p; return x.slice(0, n - s.length) + s; });
    f('rpad', (s, n, p) => { if (s == null) return null; s = String(s); p = p == null ? ' ' : String(p); if (s.length >= n) return s.slice(0, n); let x = s; while (x.length < n) x += p; return x.slice(0, n); });
    f('initcap', s => (s == null ? null : String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())));
    f('instr', (s, sub) => (s == null || sub == null ? null : String(s).indexOf(String(sub)) + 1));
    f('split_part', (s, d, n) => { if (s == null) return null; const p = String(s).split(String(d)); n = +n; const x = n > 0 ? p[n - 1] : p[p.length + n]; return x == null ? '' : x; });
    f('split', (s, d) => (s == null ? null : json(String(s).split(new RegExp(String(d))))));
    f('regexp_extract', (s, p, g) => { if (s == null) return null; const m = new RegExp(String(p)).exec(String(s)); return m ? (m[g == null ? 1 : +g] || '') : ''; });
    f('array_contains', (a, v) => { const x = arr(a); return x ? (x.some(e => e == v) ? 1 : 0) : null; });
    f('element_at', (a, i) => { const x = arr(a); if (!x) return null; i = +i; const e = i > 0 ? x[i - 1] : x[x.length + i]; return e == null ? null : typeof e === 'object' ? json(e) : e; });
    f('array_join', (a, d) => { const x = arr(a); return x ? x.filter(e => e != null).join(d == null ? ',' : String(d)) : null; });
    f('array_distinct', a => { const x = arr(a); return x ? json([...new Set(x.map(e => json(e)))].map(e => JSON.parse(e))) : null; });
    f('sort_array', (a, asc) => { const x = arr(a); if (!x) return null; x.sort((p, q2) => (p > q2 ? 1 : p < q2 ? -1 : 0)); if (asc === 0) x.reverse(); return json(x); });
    f('array_max', a => { const x = arr(a); return x && x.length ? x.reduce((m, e) => (e > m ? e : m)) : null; });
    f('array_min', a => { const x = arr(a); return x && x.length ? x.reduce((m, e) => (e < m ? e : m)) : null; });
    f('format_number', (x, d) => (x == null ? null : Number(x).toLocaleString('en-US', { minimumFractionDigits: +d || 0, maximumFractionDigits: +d || 0 })));
    f('sha2', s => (s == null ? null : 'sha2:' + [...String(s)].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16).padStart(8, '0').repeat(8)));
    f('mask', s => (s == null ? null : String(s).replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x').replace(/\d/g, 'n')));
    f('__dbx_grupo', g => (GRUPOS.includes(String(g).toLowerCase()) ? 1 : 0));
    f('__dbx_uuid', () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
    const ag = (nome, calc) => db.create_aggregate(nome, { init: () => [], step: (st, v) => { if (v != null) st.push(+v); return st; }, finalize: st => (st.length ? calc(st.sort((a, b) => a - b)) : null) });
    const perc = (st, p) => { const k = (st.length - 1) * p, i = Math.floor(k); return i + 1 < st.length ? st[i] + (st[i + 1] - st[i]) * (k - i) : st[i]; };
    ag('median', st => perc(st, 0.5));
    db.create_aggregate('percentile', { init: () => ({ v: [], p: 0.5 }), step: (st, v, p) => { if (v != null) st.v.push(+v); if (p != null) st.p = +p; return st; }, finalize: st => (st.v.length ? perc(st.v.sort((a, b) => a - b), st.p) : null) });
    db.create_aggregate('percentile_approx', { init: () => ({ v: [], p: 0.5 }), step: (st, v, p) => { if (v != null) st.v.push(+v); if (p != null) st.p = +p; return st; }, finalize: st => { if (!st.v.length) return null; const s = st.v.sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(st.p * s.length) - 1))]; } });
    ag('stddev', st => { if (st.length < 2) return null; const m = st.reduce((a, b) => a + b) / st.length; return Math.sqrt(st.reduce((a, b) => a + (b - m) ** 2, 0) / (st.length - 1)); });
    ag('variance', st => { if (st.length < 2) return null; const m = st.reduce((a, b) => a + b) / st.length; return st.reduce((a, b) => a + (b - m) ** 2, 0) / (st.length - 1); });
  }

  /* ------------------------------------------------------------------ tipos */
  const TIPOS = [[/^STRING$/i, 'VARCHAR(MAX)'], [/^BOOLEAN$/i, 'BIT'], [/^DOUBLE$/i, 'FLOAT'], [/^LONG$/i, 'BIGINT'], [/^TIMESTAMP(_NTZ|_LTZ)?$/i, 'DATETIME2'],
    [/^(ARRAY|MAP|STRUCT)\s*<.*>$/is, 'VARCHAR(MAX)'], [/^BINARY$/i, 'VARBINARY(MAX)'], [/^SHORT$/i, 'SMALLINT'], [/^BYTE$/i, 'TINYINT'], [/^VARIANT$/i, 'VARCHAR(MAX)']];
  const tipo = t => { const x = t.trim(); for (const [re, v] of TIPOS) if (re.test(x)) return v; return x; };
  function lerTipo(s, i) { // lê um tipo a partir de i (inclui <...> e (p,s))
    const m = /^\s*([A-Za-z_]\w*)/.exec(s.slice(i)); if (!m) return null;
    let f = i + m[0].length;
    if (/^\s*</.test(s.slice(f))) { let d = 0, k = s.indexOf('<', f); for (; k < s.length; k++) { if (s[k] === '<') d++; else if (s[k] === '>') { d--; if (!d) break; } } f = k + 1; }
    else if (/^\s*\(/.test(s.slice(f))) { const a = s.indexOf('(', f); f = fechar(s, a + 1) + 1; }
    return { txt: s.slice(i, f), fim: f };
  }

  /* ------------------------------------------------------------------ nomes */
  function nomes(st, dbx, db) {
    st = st.replace(new RegExp(`\\b${CAT}\\s*\\.\\s*(bronze|prata|ouro)\\s*\\.\\s*([A-Za-z_]\\w*)`, 'gi'), (m, e, t) => fis(e.toLowerCase(), t));
    st = st.replace(/(^|[^\w.\]])(bronze|prata|ouro)\s*\.\s*([A-Za-z_]\w*)(?!\s*\()/gi, (m, a, e, t) => a + fis(e.toLowerCase(), t));
    if (dbx.esquema) {
      st = st.replace(/\b(FROM|JOIN|INTO|UPDATE|TABLE|USING|HISTORY|DETAIL|DESCRIBE|VIEW|OPTIMIZE|VACUUM|RESTORE)(\s+)([A-Za-z_]\w*)\b(?!\s*[.(])/gi, (m, k, sp, n) => {
        if (/^(SELECT|TABLE|IF|EXTENDED|HISTORY|DETAIL|AS|OR|VERSION|TIMESTAMP|TO|ON|WITH|ONLY|ALL|LATERAL)$/i.test(n)) return m;
        const c = fis(dbx.esquema, n); return existe(db, c) || /^(INTO|TABLE|VIEW)$/i.test(k) && !existe(db, n) ? k + sp + c : m;
      });
    }
    return st;
  }

  /* ------------------------------------------------------------------ expressões */
  function casts(st) {
    st = st.replace(/\b(DATE|TIMESTAMP)\s*(\u0001\d+\u0002)/gi, (m, t, l) => `CAST(${l} AS ${t.toUpperCase() === 'DATE' ? 'DATE' : 'DATETIME2'})`);
    let i;
    while ((i = st.indexOf('::')) >= 0) {
      let a = i - 1; while (a >= 0 && st[a] === ' ') a--;
      let ini;
      if (st[a] === ')') { let d = 0, k = a; for (; k >= 0; k--) { if (st[k] === ')') d++; else if (st[k] === '(') { d--; if (!d) break; } } ini = k; while (ini > 0 && /[\w.]/.test(st[ini - 1])) ini--; }
      else if (st[a] === '\u0002') { ini = st.lastIndexOf('\u0001', a); }
      else { ini = a; while (ini > 0 && /[\w.\]\[]/.test(st[ini - 1])) ini--; }
      const t = lerTipo(st, i + 2); if (!t) break;
      st = st.slice(0, ini) + `CAST(${st.slice(ini, a + 1)} AS ${tipo(t.txt)})` + st.slice(t.fim);
    }
    return st.replace(/\b(TRY_CAST|CAST)\s*\(/gi, (m) => m).replace(/(\bAS\s+)((?:STRING|BOOLEAN|DOUBLE|LONG|TIMESTAMP(?:_NTZ|_LTZ)?|BINARY|SHORT|BYTE|VARIANT)\b|(?:ARRAY|MAP|STRUCT)\s*<[^)]*?>)(?=\s*\))/gi, (m, a, t) => a + tipo(t));
  }
  function jsonPath(st) { // col:campo.sub[0] -> json_extract(col,'$.campo.sub[0]')
    return st.replace(/(\b[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)?)\s*:(?!:)\s*((?:[A-Za-z_]\w*|\[\d+\])(?:\.[A-Za-z_]\w*|\[\d+\])*)/g, (m, c, p, off, s) => {
      if (s[off - 1] === ':' || /^\d/.test(p)) return m;
      return `json_extract(${c}, '$.${p.replace(/\.\[/g, '[')}')`;
    });
  }
  const AGREG = /\b(SUM|COUNT|AVG|MIN|MAX|COUNT_IF|STRING_AGG|COLLECT_LIST|COLLECT_SET|ARRAY_AGG|JSON_GROUP_ARRAY|MEDIAN|PERCENTILE|PERCENTILE_APPROX|STDDEV|VARIANCE|APPROX_COUNT_DISTINCT|ANY_VALUE|FIRST|LAST|BOOL_AND|BOOL_OR|EVERY|MEAN)\s*\(/i;
  function funcoesExpr(st) {
    st = st.replace(/\bcurrent_date\s*\(\s*\)|\bcurrent_date\b(?!\s*\()/gi, 'CAST(GETDATE() AS DATE)')
      .replace(/\b(current_timestamp|now)\s*\(\s*\)/gi, 'GETDATE()')
      .replace(/\bcurrent_user\s*\(\s*\)|\bcurrent_user\b/gi, `'${USUARIO}'`)
      .replace(/\bcurrent_catalog\s*\(\s*\)/gi, `'${CAT}'`)
      .replace(/\b(is_account_group_member|is_member)\s*\(/gi, '__dbx_grupo(')
      .replace(/\buuid\s*\(\s*\)/gi, '__dbx_uuid()')
      .replace(/\bILIKE\b/gi, 'LIKE')
      .replace(/<=>/g, ' IS NOT DISTINCT FROM ')
      .replace(/==/g, '=')
      .replace(/\b(approx_count_distinct)\s*\(/gi, 'COUNT(DISTINCT ')
      .replace(/\b(any_value|first|first_value_agg)\s*\((?=[^)]*\)\s*(?!OVER))/gi, 'MIN(')
      .replace(/\bmean\s*\(/gi, 'AVG(')
      .replace(/\b(collect_list|array_agg)\s*\(/gi, 'json_group_array(')
      .replace(/\bcollect_set\s*\(/gi, 'json_group_array(DISTINCT ')
      .replace(/\b(size|array_size|cardinality)\s*\(/gi, 'json_array_length(')
      .replace(/\bget_json_object\s*\(/gi, 'json_extract(')
      .replace(/\bnamed_struct\s*\(/gi, 'json_object(')
      .replace(/\bto_json\s*\(/gi, '(')
      .replace(/\b(nvl|ifnull)\s*\(/gi, 'ISNULL(')
      .replace(/\bif\s*\(/gi, 'IIF(')
      .replace(/\bchar_length\s*\(|\bcharacter_length\s*\(/gi, 'LEN(')
      .replace(/\b(lcase)\s*\(/gi, 'LOWER(').replace(/\b(ucase)\s*\(/gi, 'UPPER(')
      .replace(/\b(day|dayofmonth)\s*\(/gi, 'DAY(');
    st = trocarFuncao(st, 'count_if', a => `SUM(CASE WHEN (${a[0]}) THEN 1 ELSE 0 END)`);
    st = trocarFuncao(st, 'nvl2', a => `IIF((${a[0]}) IS NOT NULL, ${a[1]}, ${a[2]})`);
    st = trocarFuncao(st, 'array', a => `json_array(${a.join(', ')})`);
    st = trocarFuncao(st, 'datediff', a => (a.length === 2 ? `__dbx_datediff(${a[0]}, ${a[1]})` : `DATEDIFF(${a.join(', ')})`));
    st = trocarFuncao(st, 'timestampdiff', a => `DATEDIFF(${a.join(', ')})`);
    st = trocarFuncao(st, 'from_json', a => `(${a[0]})`);
    st = st.replace(/([A-Za-z_][\w.]*(?:\([^()]*\))?)\s+(NOT\s+)?(?:RLIKE|REGEXP)\s+(\u0001\d+\u0002)/gi, (m, x, n, p) => `${n ? 'NOT ' : ''}regexp_like(${x}, ${p}) = 1`);
    return st;
  }
  function tiposDDL(defs) { // (col TIPO [NOT NULL] [COMMENT '...'] [GENERATED ...], ...) -> T-SQL; devolve também comentários
    const coment = [];
    const partes = dividirTopo(defs, ',').map(p => {
      let x = p.trim(); if (!x) return x;
      if (/^(CONSTRAINT|PRIMARY|FOREIGN|CHECK|UNIQUE)\b/i.test(x)) return x;
      const m = /^([A-Za-z_]\w*|\[[^\]]+\])\s+/.exec(x); if (!m) return x;
      const t = lerTipo(x, m[0].length); if (!t) return x;
      let resto = x.slice(t.fim);
      resto = resto.replace(/\bCOMMENT\s+(\u0001\d+\u0002)/i, (mm, l) => { coment.push([m[1], l]); return ''; })
        .replace(/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY(\s*\([^)]*\))?/i, '')
        .replace(/\bGENERATED\s+ALWAYS\s+AS\s*\(.*\)/i, '');
      return `${m[1]} ${tipo(t.txt)}${resto}`;
    });
    return { defs: partes.join(', '), coment };
  }

  /* explode(x) na lista do SELECT -> CROSS JOIN json_each */
  function explode(st) {
    const m0 = /\b(explode|explode_outer|posexplode)\s*\(/i.exec(st); if (!m0) return st;
    // explode dentro de subconsulta: trata só aquele SELECT
    let d = 0, abre = -1;
    for (let k = m0.index - 1; k >= 0; k--) { if (st[k] === ')') d++; else if (st[k] === '(') { if (d === 0) { abre = k; break; } d--; } }
    if (abre >= 0) {
      const fim = fechar(st, abre + 1), dentro = st.slice(abre + 1, fim);
      if (/^\s*(SELECT|WITH)\b/i.test(dentro)) return explode(st.slice(0, abre + 1) + explodeTopo(dentro) + st.slice(fim));
    }
    return explode(explodeTopo(st));
  }
  function explodeTopo(st) {
    const m = /\b(explode|explode_outer|posexplode)\s*\(/i.exec(st); if (!m) return st;
    const ini = m.index + m[0].length, f = fechar(st, ini), arg = st.slice(ini, f), outer = /outer/i.test(m[1]), pos = /^pos/i.test(m[1]);
    let s = st.slice(0, m.index) + (pos ? '__ex.[key], __ex.value' : '__ex.value') + st.slice(f + 1);
    const fr = acharTopo(s, /\bFROM\b/); if (!fr) return st;
    const fim = acharTopo(s, /\b(WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|QUALIFY|UNION|EXCEPT|INTERSECT)\b/, fr.index + 4);
    const corte = fim ? fim.index : s.length;
    const junta = outer ? ` LEFT JOIN json_each(${arg}) AS __ex ON 1 = 1 ` : ` CROSS JOIN json_each(${arg}) AS __ex `;
    s = s.slice(0, corte).replace(/\s+$/, '') + junta + s.slice(corte);
    s = s.replace(/__ex\.\[key\],\s*__ex\.value\s+AS\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i, '__ex.[key] AS $1, __ex.value AS $2');
    return s;
  }

  /* GROUP BY ALL */
  function listaSelect(st) {
    const sel = acharTopo(st, /\bSELECT\b/); const fr = acharTopo(st, /\bFROM\b/, sel ? sel.index : 0);
    if (!sel || !fr) return null;
    let corpo = st.slice(sel.index + 6, fr.index).replace(/^\s*(DISTINCT|ALL)\b/i, '');
    return dividirTopo(corpo, ',').map(x => x.trim()).filter(Boolean);
  }
  function semApelido(x) { return x.replace(/\s+AS\s+[A-Za-z_]\w*$|\s+AS\s+\[[^\]]+\]$/i, '').replace(/^(.*[\w)\]\u0002])\s+([A-Za-z_]\w*)$/s, (m, e, a) => (/^(END|DESC|ASC)$/i.test(a) ? m : e)); }
  function groupByAll(st) {
    const re = /\bGROUP\s+BY\s+ALL\b/i, m0 = re.exec(st); if (!m0) return st;
    if (acharTopo(st, /\bGROUP\s+BY\s+ALL\b/)) return groupByAll(groupByAllTopo(st));
    let d = 0, abre = -1;
    for (let k = m0.index - 1; k >= 0; k--) { if (st[k] === ')') d++; else if (st[k] === '(') { if (d === 0) { abre = k; break; } d--; } }
    if (abre < 0) return st;
    const fim = fechar(st, abre + 1);
    return groupByAll(st.slice(0, abre + 1) + groupByAllTopo(st.slice(abre + 1, fim)) + st.slice(fim));
  }
  function groupByAllTopo(st) {
    const g = acharTopo(st, /\bGROUP\s+BY\s+ALL\b/); if (!g) return st;
    const itens = listaSelect(st.slice(0, g.index)) || [];
    const chaves = itens.map(semApelido).filter(e => !AGREG.test(e) && !/\bOVER\s*\(/i.test(e) && !/^\u0001\d+\u0002$/.test(e) && !/^-?\d+(\.\d+)?$/.test(e));
    return st.slice(0, g.index) + (chaves.length ? 'GROUP BY ' + chaves.join(', ') : '') + st.slice(g.index + g[0].length);
  }

  /* ------------------------------------------------------------------ versões (Delta) */
  const versaoAtual = (db, t) => um(db, 'SELECT MAX(versao) FROM __historico WHERE tabela=?', [t]);
  function novaVersao(dbx, db, t, op, params, metricas) {
    t = nomeReal(db, t);
    if (!existe(db, t) || ehView(db, t) || /^__/.test(t)) return;
    const v = (versaoAtual(db, t) ?? -1) + 1;
    dbx.relogio = (dbx.relogio || 0) + 1;
    const ts = new Date(Date.parse(MS.AGORA.replace(' ', 'T') + 'Z') + dbx.relogio * 1000);
    db.run('INSERT INTO __historico VALUES (?,?,?,?,?,?,?)', [t, v, ts.toISOString().replace('Z', '+0000'), USUARIO, op, json(params || {}), json(metricas || {})]);
    db.exec(`DROP TABLE IF EXISTS "__v_${t}_${v}"; CREATE TABLE "__v_${t}_${v}" AS SELECT * FROM "${t}"`);
    if (v >= MAX_VERSOES) db.exec(`DROP TABLE IF EXISTS "__v_${t}_${v - MAX_VERSOES}"`);
    if (op !== 'OPTIMIZE' && op !== 'SET TBLPROPERTIES') db.run('UPDATE __meta SET arquivos = COALESCE(arquivos,1) + 1 WHERE tabela=?', [t]);
  }
  function tabelaDaVersao(db, t, v) {
    t = nomeReal(db, t);
    if (!existe(db, t)) throw erro('TABLE_OR_VIEW_NOT_FOUND', `A tabela ou view ${logico(t)} não foi encontrada.`);
    const max = versaoAtual(db, t);
    if (v > max || v < 0) throw erro('VERSION_NOT_FOUND', `Não existe a versão ${v} de ${logico(t)}. Versões disponíveis: 0 a ${max}.`);
    if (um(db, 'SELECT 1 FROM __vacuum WHERE tabela=? AND versao=?', [t, v]) || !existe(db, `__v_${t}_${v}`))
      throw erro('DELTA_FILE_NOT_FOUND', `Os arquivos da versão ${v} de ${logico(t)} foram apagados pelo VACUUM; não dá mais para voltar a ela.`);
    return `__v_${t}_${v}`;
  }
  function versaoNoInstante(db, t, ts) {
    t = nomeReal(db, t);
    const alvo = ts.replace(' ', 'T');
    const r = linhas(db, 'SELECT versao, ts FROM __historico WHERE tabela=? ORDER BY versao', [t]);
    let v = null; for (const [ver, quando] of r) if (quando.slice(0, alvo.length) <= alvo || quando.slice(0, 19) <= alvo.slice(0, 19)) v = ver;
    if (v == null) throw erro('DELTA_TIMESTAMP_TOO_EARLY', `O instante ${ts} é anterior à criação de ${logico(t)} (${r.length ? r[0][1] : '?'}).`);
    return v;
  }
  function viagem(st, db, lits) {
    st = st.replace(/\b([A-Za-z_]\w*)\s+(?:VERSION|SYSTEM_VERSION)\s+AS\s+OF\s+(\d+)/gi, (m, t, v) => tabelaDaVersao(db, t, +v));
    st = st.replace(/\b([A-Za-z_]\w*)\s+(?:TIMESTAMP|SYSTEM_TIME)\s+AS\s+OF\s+(\u0001\d+\u0002)/gi, (m, t, l) => tabelaDaVersao(db, t, versaoNoInstante(db, t, valorLit(l, lits))));
    st = st.replace(/\b([A-Za-z_]\w*)@v(\d+)\b/gi, (m, t, v) => tabelaDaVersao(db, t, +v));
    return st;
  }

  /* ------------------------------------------------------------------ resultados */
  function resultado(ctx, cols, rows) { ctx.res.push({ columns: cols, values: rows }); }
  function msg(ctx, m) { ctx.msgs.push(m); }

  /* executa um SELECT pelo interpretador para descobrir as colunas */
  function colunasDe(ctx, base, sql) {
    const res = ctx.res, msgs = ctx.msgs, rc = ctx.rowcount; ctx.res = []; ctx.msgs = [];
    try { base(`SELECT * FROM (${sql}) AS __c WHERE 1 = 0`); const u = ctx.res[ctx.res.length - 1]; return u ? u.columns : []; }
    finally { ctx.res = res; ctx.msgs = msgs; ctx.rowcount = rc; }
  }
  function qualify(st, ctx, base) {
    const m0 = /\bQUALIFY\b/i.exec(st); if (!m0) return st;
    if (!acharTopo(st, /\bQUALIFY\b/)) {
      let d = 0, abre = -1;
      for (let k = m0.index - 1; k >= 0; k--) { if (st[k] === ')') d++; else if (st[k] === '(') { if (d === 0) { abre = k; break; } d--; } }
      if (abre < 0) return st;
      const fim = fechar(st, abre + 1);
      return qualify(st.slice(0, abre + 1) + qualifyTopo(st.slice(abre + 1, fim), ctx, base) + st.slice(fim), ctx, base);
    }
    return qualify(qualifyTopo(st, ctx, base), ctx, base);
  }
  function qualifyTopo(st, ctx, base) {
    const qm = acharTopo(st, /\bQUALIFY\b/); if (!qm) return st;
    const cabeca = st.slice(0, qm.index), resto = st.slice(qm.index + 7);
    const ord = acharTopo(resto, /\b(ORDER\s+BY|LIMIT)\b/);
    let cond = ord ? resto.slice(0, ord.index) : resto; const cauda = ord ? resto.slice(ord.index) : '';
    const janelas = []; let k;
    const reW = /\b[A-Za-z_]\w*\s*\(/g; let m, nova = '', ult = 0;
    while ((m = reW.exec(cond))) {
      const f = fechar(cond, m.index + m[0].length); const depois = cond.slice(f + 1);
      const ov = /^\s*OVER\s*\(/i.exec(depois);
      if (!ov) continue;
      const fo = fechar(cond, f + 1 + ov[0].length);
      janelas.push(cond.slice(m.index, fo + 1)); nova += cond.slice(ult, m.index) + `__w${janelas.length}`; ult = fo + 1; reW.lastIndex = fo + 1;
    }
    cond = nova + cond.slice(ult);
    const fr = acharTopo(cabeca, /\bFROM\b/);
    if (!fr) throw erro('PARSE_SYNTAX_ERROR', 'QUALIFY precisa de um SELECT com FROM.');
    const interno = cabeca.slice(0, fr.index).replace(/\s+$/, '') + janelas.map((j, i) => `, ${j} AS __w${i + 1}`).join('') + ' ' + cabeca.slice(fr.index);
    const cols = colunasDe(ctx, base, interno).filter(c => !/^__w\d+$/.test(c));
    for (k = 0; k < cols.length; k++) if (cols.indexOf(cols[k]) !== k) throw erro('AMBIGUOUS_REFERENCE', `A coluna ${cols[k]} aparece duas vezes; dê apelidos diferentes antes de usar QUALIFY.`);
    return `SELECT ${cols.map(q).join(', ')} FROM (${interno}) AS __qualify WHERE ${cond} ${cauda.replace(/\b[A-Za-z_]\w*\.([A-Za-z_]\w*)/g, '$1')}`;
  }
  function exceto(st, ctx, base) {
    const m0 = /\bSELECT\s+(DISTINCT\s+)?(?:([A-Za-z_]\w*)\.)?\*\s+EXCEPT\s*\(/i.exec(st); if (!m0) return st;
    let d = 0, abre = -1;
    for (let k = m0.index - 1; k >= 0; k--) { if (st[k] === ')') d++; else if (st[k] === '(') { if (d === 0) { abre = k; break; } d--; } }
    if (abre >= 0) { const fim = fechar(st, abre + 1); return exceto(st.slice(0, abre + 1) + excetoTopo(st.slice(abre + 1, fim), ctx, base) + st.slice(fim), ctx, base); }
    return exceto(excetoTopo(st, ctx, base), ctx, base);
  }
  function excetoTopo(st, ctx, base) {
    const m = /\bSELECT\s+(DISTINCT\s+)?(?:([A-Za-z_]\w*)\.)?\*\s+EXCEPT\s*\(/i.exec(st); if (!m) return st;
    const ini = m.index + m[0].length, f = fechar(st, ini);
    const tirar = dividirTopo(st.slice(ini, f), ',').map(x => x.trim().replace(/^\[|\]$/g, '').replace(/^\w+\./, '').toLowerCase());
    const aposEx = st.slice(f + 1), frm = acharTopo(aposEx, /\bFROM\b/);
    const semEx = `SELECT ${m[2] ? m[2] + '.' : ''}* ` + (frm ? aposEx.slice(frm.index) : aposEx);
    const cols = colunasDe(ctx, base, semEx.replace(/\bORDER\s+BY\b[\s\S]*$/i, ''));
    const fica = cols.filter(c => !tirar.includes(c.toLowerCase()));
    return st.slice(0, m.index) + `SELECT ${m[1] || ''}${fica.map(c => (m[2] ? m[2] + '.' : '') + q(c)).join(', ')}` + st.slice(f + 1);
  }

  /* ------------------------------------------------------------------ arquivos e volumes */
  function arquivosDe(db, caminho) {
    const p = caminho.replace(/\/+$/, '');
    const r = linhas(db, "SELECT caminho, tabela FROM __arquivos WHERE caminho = ? OR caminho LIKE ? ORDER BY caminho", [p, p + '/%']);
    if (!r.length) throw erro('PATH_NOT_FOUND', `O caminho ${caminho} não existe. Use LIST '/Volumes/banco/bronze/arquivos' para ver os arquivos.`);
    return r;
  }
  function readFiles(st, db, lits) {
    if (!/\bread_files\s*\(/i.test(st)) return st;
    const meta = /\b_metadata\s*\.\s*\w+/i.test(st); let cols = null;
    st = trocarFuncao(st, 'read_files', a => {
      const caminho = valorLit(a[0], lits); if (caminho == null) throw erro('INVALID_PARAMETER', 'read_files precisa do caminho entre aspas.');
      const arqs = arquivosDe(db, caminho);
      cols = colunas(db, arqs[0][1]).map(c => c[0]);
      const sel = arqs.map(([c, t]) => {
        const mod = um(db, 'SELECT modificado FROM __arquivos WHERE caminho=?', [c]);
        return meta ? `SELECT ${cols.map(q).join(', ')}, '${c.split('/').pop()}' AS __mf, 'dbfs:${c}' AS __mp, '${mod}' AS __mt FROM ${t}` : `SELECT * FROM ${t}`;
      }).join(' UNION ALL ');
      return `(${sel}) AS __arq`;
    });
    if (meta && cols) {
      st = st.replace(/\bSELECT\s+(DISTINCT\s+)?\*/i, (m, d) => `SELECT ${d || ''}${cols.map(c => '__arq.' + q(c)).join(', ')}`)
        .replace(/\b_metadata\s*\.\s*file_name\b/gi, '__arq.__mf').replace(/\b_metadata\s*\.\s*file_path\b/gi, '__arq.__mp')
        .replace(/\b_metadata\s*\.\s*file_modification_time\b/gi, '__arq.__mt');
    }
    return st;
  }

  /* ------------------------------------------------------------------ CHECK constraints */
  function verificarChecks(db, t, lits) {
    for (const [nome, cond] of linhas(db, 'SELECT nome, condicao FROM __checks WHERE tabela=?', [t])) {
      const ruim = linhas(db, `SELECT * FROM "${t}" WHERE NOT (${cond}) OR (${cond}) IS NULL LIMIT 1`);
      if (ruim.length) {
        const cols = colunas(db, t).map(c => c[0]);
        const vals = cols.map((c, i) => `${c} = ${ruim[0][i] === null ? 'NULL' : ruim[0][i]}`).join(', ');
        return `[DELTA_VIOLATE_CONSTRAINT_WITH_VALUES] A constraint CHECK ${nome} (${cond}) foi violada pela linha com os valores: ${vals}.`;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ instruções especiais */
  function especiais(st, ctx, dbx, db, lits, base) {
    const S = st.trim(), U = S.toUpperCase();
    let m;
    const L = n => logico(nomeReal(db, n));
    const exige = n => { const r = nomeReal(db, n); if (!existe(db, r)) throw erro('TABLE_OR_VIEW_NOT_FOUND', `A tabela ou view ${logico(r)} não foi encontrada. Confira catálogo, esquema e nome (ex.: banco.prata.clientes).`); return r; };

    if ((m = /^USE\s+(?:CATALOG\s+)?([A-Za-z_]\w*)$/i.exec(S)) && /CATALOG/i.test(S)) { if (m[1].toLowerCase() !== CAT) throw erro('NO_SUCH_CATALOG_EXCEPTION', `O catálogo ${m[1]} não existe aqui. Use ${CAT}.`); dbx.catalogo = CAT; msg(ctx, `Catálogo atual: ${CAT}`); return true; }
    if ((m = /^USE\s+(?:SCHEMA\s+|DATABASE\s+)?(?:banco\s*\.\s*)?([A-Za-z_]\w*)$/i.exec(S))) {
      const e = m[1].toLowerCase(); if (!ESQ.includes(e)) throw erro('SCHEMA_NOT_FOUND', `O esquema ${CAT}.${m[1]} não existe. Esquemas: ${ESQ.join(', ')}.`);
      dbx.esquema = e; msg(ctx, `Esquema atual: ${CAT}.${e}`); return true;
    }
    if (/^SHOW\s+CATALOGS\b/i.test(S)) { resultado(ctx, ['catalog'], [[CAT], ['samples'], ['system']]); return true; }
    if (/^SHOW\s+(SCHEMAS|DATABASES)\b/i.test(S)) { resultado(ctx, ['databaseName'], [['bronze'], ['default'], ['information_schema'], ['ouro'], ['prata']]); return true; }
    if ((m = /^SHOW\s+(TABLES|VIEWS)(?:\s+(?:IN|FROM)\s+(?:banco\s*\.\s*)?([A-Za-z_]\w*))?(?:\s+LIKE\s+(\u0001\d+\u0002))?$/i.exec(S))) {
      const e = (m[2] || dbx.esquema || '').toLowerCase(); if (!e) throw erro('SCHEMA_NOT_FOUND', 'Diga o esquema: SHOW TABLES IN banco.bronze (ou rode USE SCHEMA antes).');
      if (!ESQ.includes(e)) throw erro('SCHEMA_NOT_FOUND', `O esquema ${CAT}.${e} não existe.`);
      const padrao = m[3] ? new RegExp('^' + valorLit(m[3], lits).replace(/\*/g, '.*').replace(/\|/g, '|') + '$', 'i') : null;
      const tipoV = /VIEWS/i.test(m[1]);
      const r = linhas(db, `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name LIKE '${e}\\_%' ESCAPE '\\' ORDER BY name`)
        .filter(([n, t]) => !tipoV || t === 'view').map(([n]) => [e, n.slice(e.length + 1), 0]).filter(r2 => !padrao || padrao.test(r2[1]));
      resultado(ctx, ['database', 'tableName', 'isTemporary'], r); return true;
    }
    if ((m = /^SHOW\s+VOLUMES(?:\s+(?:IN|FROM)\s+(?:banco\s*\.\s*)?(\w+))?$/i.exec(S))) { resultado(ctx, ['database', 'volume_name'], [['bronze', 'arquivos']]); return true; }
    if ((m = /^SHOW\s+COLUMNS\s+(?:IN|FROM)\s+([A-Za-z_]\w*)$/i.exec(S))) { const t = exige(m[1]); resultado(ctx, ['col_name'], colunas(db, t).map(c => [c[0]])); return true; }
    if ((m = /^LIST\s+(\u0001\d+\u0002)$/i.exec(S))) {
      const p = valorLit(m[1], lits).replace(/\/+$/, '');
      const r = linhas(db, "SELECT caminho, tamanho, modificado FROM __arquivos WHERE caminho LIKE ? ORDER BY caminho", [p + '/%']);
      if (!r.length) throw erro('PATH_NOT_FOUND', `O caminho ${p} não existe ou está vazio.`);
      const dir = p.split('/').length;
      const vistos = new Map();
      r.forEach(([c, tam, mod]) => { const partes = c.split('/'); const nome = partes[dir] + (partes.length > dir + 1 ? '/' : ''); const cam = partes.slice(0, dir + 1).join('/') + (partes.length > dir + 1 ? '/' : '');
        if (!vistos.has(cam)) vistos.set(cam, [cam, nome, partes.length > dir + 1 ? 0 : tam, mod]); });
      resultado(ctx, ['path', 'name', 'size', 'modification_time'], [...vistos.values()]); return true;
    }
    if ((m = /^DESCRIBE\s+HISTORY\s+([A-Za-z_]\w*)(?:\s+LIMIT\s+(\d+))?$/i.exec(S))) {
      const t = exige(m[1]); if (ehView(db, t)) throw erro('DELTA_TABLE_ONLY_OPERATION', `${L(t)} é uma view: só tabelas Delta têm histórico.`);
      const r = linhas(db, `SELECT versao, ts, usuario, operacao, parametros, metricas FROM __historico WHERE tabela=? ORDER BY versao DESC${m[2] ? ' LIMIT ' + m[2] : ''}`, [t]);
      resultado(ctx, ['version', 'timestamp', 'userName', 'operation', 'operationParameters', 'operationMetrics'], r); return true;
    }
    if ((m = /^DESCRIBE\s+DETAIL\s+([A-Za-z_]\w*)$/i.exec(S))) {
      const t = exige(m[1]); const me = linhas(db, 'SELECT tipo, comentario, local, cluster, criado, arquivos FROM __meta WHERE tabela=?', [t])[0] || [];
      const ult = um(db, 'SELECT ts FROM __historico WHERE tabela=? ORDER BY versao DESC LIMIT 1', [t]);
      const n = contar(db, t);
      resultado(ctx, ['format', 'name', 'type', 'description', 'location', 'createdAt', 'lastModified', 'clusteringColumns', 'numFiles', 'sizeInBytes'],
        [['delta', L(t), me[0] || 'MANAGED', me[1] || null, me[2] || `s3://banco-lakehouse/__unitystorage/${t.split('_')[0]}/${t}`, me[4] || null, ult, me[3] ? json(me[3].split(',')) : '[]', me[5] || 1, n * 96 + 1024]]); return true;
    }
    if ((m = /^DESCRIBE\s+(?:SCHEMA|DATABASE)\s+(?:EXTENDED\s+)?(?:banco\s*\.\s*)?(\w+)$/i.exec(S))) {
      resultado(ctx, ['database_description_item', 'database_description_value'], [['Catalog Name', CAT], ['Namespace Name', m[1].toLowerCase()], ['Comment', { bronze: 'Dados crus, como chegaram', prata: 'Dados limpos e deduplicados', ouro: 'Tabelas prontas para indicadores e painéis' }[m[1].toLowerCase()] || ''], ['Owner', 'engenharia@banco.dev']]); return true;
    }
    if ((m = /^DESC(?:RIBE)?\s+(?:TABLE\s+)?(EXTENDED\s+|FORMATTED\s+)?([A-Za-z_]\w*)$/i.exec(S))) {
      const t = exige(m[2]);
      const cm = new Map(linhas(db, 'SELECT lower(coluna), comentario FROM __comentarios WHERE tabela=?', [t]));
      const tp = tipoDbx;
      const r = colunas(db, t).map(([c, ty]) => [c, tp(ty), cm.get(c.toLowerCase()) || null]);
      if (m[1]) {
        const me = linhas(db, 'SELECT tipo, comentario, local, cluster, dono FROM __meta WHERE tabela=?', [t])[0] || [];
        const lc = logico(t).split('.');
        r.push(['', '', ''], ['# Detailed Table Information', '', ''], ['Catalog', lc[0], ''], ['Database', lc[1] || '', ''], ['Table', lc[2] || t, ''],
          ['Type', ehView(db, t) ? 'VIEW' : (me[0] || 'MANAGED'), ''], ['Comment', me[1] || '', ''], ['Location', me[2] || `s3://banco-lakehouse/__unitystorage/${t}`, ''],
          ['Provider', ehView(db, t) ? '' : 'delta', ''], ['Owner', me[4] || 'engenharia@banco.dev', ''], ['Clustering Columns', me[3] || '', '']);
        const ch = linhas(db, 'SELECT nome, condicao FROM __checks WHERE tabela=?', [t]);
        ch.forEach(([n, c]) => r.push([`Constraint ${n}`, `CHECK (${c})`, '']));
      }
      resultado(ctx, ['col_name', 'data_type', 'comment'], r); return true;
    }
    if ((m = /^RESTORE\s+(?:TABLE\s+)?([A-Za-z_]\w*)\s+TO\s+(?:VERSION\s+AS\s+OF\s+(\d+)|TIMESTAMP\s+AS\s+OF\s+(\u0001\d+\u0002))$/i.exec(S))) {
      const t = exige(m[1]); const v = m[2] != null ? +m[2] : versaoNoInstante(db, t, valorLit(m[3], lits));
      const src = tabelaDaVersao(db, t, v); const antes = contar(db, t);
      const cols = colunas(db, src).map(c => `"${c[0]}"`).join(', ');
      db.exec(`DELETE FROM "${t}"; INSERT INTO "${t}" (${cols}) SELECT ${cols} FROM "${src}"`);
      novaVersao(dbx, db, t, 'RESTORE', { version: v }, { tableSizeAfterRestore: contar(db, t), numRemovedFiles: 1, numRestoredFiles: 1 });
      resultado(ctx, ['table_size_after_restore', 'num_of_files_after_restore', 'num_removed_files', 'num_restored_files', 'removed_files_size', 'restored_files_size'], [[contar(db, t) * 96, 1, 1, 1, antes * 96, contar(db, t) * 96]]);
      return true;
    }
    if ((m = /^OPTIMIZE\s+([A-Za-z_]\w*)(?:\s+WHERE\s+[\s\S]+?)?(?:\s+ZORDER\s+BY\s*\(?([^)]*)\)?)?$/i.exec(S))) {
      const t = exige(m[1]); const arqs = um(db, 'SELECT arquivos FROM __meta WHERE tabela=?', [t]) || 1;
      const cl = um(db, 'SELECT cluster FROM __meta WHERE tabela=?', [t]);
      if (m[2] && cl) throw erro('DELTA_CLUSTERING_WITH_ZORDER_BY', `${L(t)} usa liquid clustering (${cl}); não combine com ZORDER BY. Rode só OPTIMIZE ${L(t)}.`);
      const novos = Math.max(1, Math.ceil(contar(db, t) / 400));
      db.run('UPDATE __meta SET arquivos=? WHERE tabela=?', [novos, t]);
      novaVersao(dbx, db, t, 'OPTIMIZE', m[2] ? { zOrderBy: json(m[2].split(',').map(x => x.trim())) } : (cl ? { clusterBy: json(cl.split(',')) } : {}), { numRemovedFiles: arqs, numAddedFiles: novos });
      resultado(ctx, ['path', 'metrics'], [[`s3://banco-lakehouse/__unitystorage/${t}`, json({ numFilesAdded: novos, numFilesRemoved: arqs, filesAdded: { totalFiles: novos }, zOrderStats: m[2] ? { zOrderBy: m[2].trim() } : null, clusteringStats: cl ? { clusterBy: cl } : null })]]);
      return true;
    }
    if ((m = /^VACUUM\s+([A-Za-z_]\w*)(?:\s+RETAIN\s+(\d+(?:\.\d+)?)\s+HOURS)?(\s+DRY\s+RUN)?$/i.exec(S))) {
      const t = exige(m[1]); const h = m[2] != null ? +m[2] : RETENCAO_H;
      if (h < RETENCAO_H) throw erro('DELTA_VACUUM_RETENTION_TOO_SHORT', `Retenção de ${h} horas é menor que o mínimo seguro de ${RETENCAO_H} horas (7 dias). O VACUUM recusa para não quebrar leituras e a viagem no tempo.`);
      const limite = new Date(Date.parse(MS.AGORA.replace(' ', 'T') + 'Z') - h * 3600e3).toISOString().replace('Z', '+0000');
      const atual = versaoAtual(db, t);
      const velhas = linhas(db, 'SELECT versao FROM __historico WHERE tabela=? AND ts < ? AND versao < ? ORDER BY versao', [t, limite, atual]).map(r => r[0]).filter(v => !um(db, 'SELECT 1 FROM __vacuum WHERE tabela=? AND versao=?', [t, v]));
      if (m[3]) { resultado(ctx, ['path'], velhas.map(v => [`s3://banco-lakehouse/__unitystorage/${t}/part-0000${v}-versao-${v}.snappy.parquet`])); return true; }
      velhas.forEach(v => { db.run('INSERT INTO __vacuum VALUES (?,?)', [t, v]); db.exec(`DROP TABLE IF EXISTS "__v_${t}_${v}"`); });
      db.run('INSERT INTO __historico VALUES (?,?,?,?,?,?,?)', [t, atual, um(db, 'SELECT ts FROM __historico WHERE tabela=? AND versao=?', [t, atual]), USUARIO, 'VACUUM END', json({ retentionHours: h }), json({ numDeletedFiles: velhas.length })]);
      db.run('DELETE FROM __historico WHERE tabela=? AND versao=? AND operacao=?', [t, atual, 'VACUUM END']);
      resultado(ctx, ['path'], [[`s3://banco-lakehouse/__unitystorage/${t}`]]); msg(ctx, `VACUUM apagou os arquivos de ${velhas.length} versão(ões) antigas de ${L(t)} (retenção de ${h} horas).`);
      return true;
    }
    if ((m = /^ANALYZE\s+TABLE\s+([A-Za-z_]\w*)\s+COMPUTE\s+(?:DELTA\s+)?STATISTICS/i.exec(S))) { const t = exige(m[1]); msg(ctx, `Estatísticas de ${L(t)} atualizadas (${contar(db, t)} linhas).`); resultado(ctx, ['result'], [['OK']]); return true; }
    if ((m = /^(GRANT|REVOKE)\s+([\w\s,]+?)\s+ON\s+(TABLE|VIEW|SCHEMA|CATALOG|VOLUME|FUNCTION)?\s*([\w.]+)\s+(TO|FROM)\s+(\[[^\]]+\]|\w[\w@.-]*|\u0001\d+\u0002)$/i.exec(S))) {
      const privs = m[2].split(',').map(x => x.trim().toUpperCase().replace(/\s+/g, ' '));
      const validos = ['SELECT', 'MODIFY', 'USE CATALOG', 'USE SCHEMA', 'ALL PRIVILEGES', 'CREATE TABLE', 'READ VOLUME', 'WRITE VOLUME', 'EXECUTE', 'BROWSE', 'APPLY TAG', 'MANAGE', 'CREATE SCHEMA', 'READ FILES', 'WRITE FILES'];
      privs.forEach(p => { if (!validos.includes(p)) throw erro('INVALID_PRIVILEGE', `${p} não é um privilégio do Unity Catalog. Exemplos: ${validos.slice(0, 6).join(', ')}.`); });
      const tipoObj = (m[3] || 'TABLE').toUpperCase(); let obj = m[4];
      if (tipoObj === 'TABLE' || tipoObj === 'VIEW') obj = L(exige(obj)); else if (tipoObj === 'SCHEMA') obj = `${CAT}.${obj.replace(/^banco\./i, '').toLowerCase()}`;
      const pr = m[6].replace(/^\[|\]$/g, '').replace(LIT, (x) => valorLit(x, lits));
      privs.forEach(p => {
        db.run('DELETE FROM __grants WHERE objeto=? AND principal=? AND privilegio=?', [obj, pr, p]);
        if (/GRANT/i.test(m[1])) db.run('INSERT INTO __grants VALUES (?,?,?,?)', [obj, tipoObj, pr, p]);
      });
      msg(ctx, `${/GRANT/i.test(m[1]) ? 'Permissão concedida' : 'Permissão revogada'}: ${privs.join(', ')} em ${obj} ${/GRANT/i.test(m[1]) ? 'para' : 'de'} ${pr}.`); return true;
    }
    if ((m = /^SHOW\s+GRANTS(?:\s+(\[[^\]]+\]|\w[\w@.-]*))?\s+ON\s+(TABLE|VIEW|SCHEMA|CATALOG)?\s*([\w.]+)$/i.exec(S))) {
      const tipoObj = (m[2] || 'TABLE').toUpperCase(); let obj = m[3];
      if (tipoObj === 'TABLE' || tipoObj === 'VIEW') obj = L(exige(obj)); else if (tipoObj === 'SCHEMA') obj = `${CAT}.${obj.replace(/^banco\./i, '').toLowerCase()}`;
      const pr = m[1] ? m[1].replace(/^\[|\]$/g, '') : null;
      const r = linhas(db, 'SELECT principal, privilegio, tipo, objeto FROM __grants WHERE objeto=?' + (pr ? ' AND principal=?' : '') + ' ORDER BY principal, privilegio', pr ? [obj, pr] : [obj]);
      resultado(ctx, ['Principal', 'ActionType', 'ObjectType', 'ObjectKey'], r); return true;
    }
    if ((m = /^COMMENT\s+ON\s+(TABLE|COLUMN)\s+([A-Za-z_]\w*)(?:\.(\w+))?\s+IS\s+(\u0001\d+\u0002|NULL)$/i.exec(S))) {
      const t = exige(m[2]); const c = valorLit(m[4], lits);
      if (/TABLE/i.test(m[1])) db.run('UPDATE __meta SET comentario=? WHERE tabela=?', [c, t]);
      else { db.run('DELETE FROM __comentarios WHERE tabela=? AND lower(coluna)=lower(?)', [t, m[3]]); db.run('INSERT INTO __comentarios VALUES (?,?,?)', [t, m[3], c]); }
      msg(ctx, `Comentário salvo em ${L(t)}${m[3] ? '.' + m[3] : ''}.`); return true;
    }
    if ((m = /^ALTER\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+([A-Za-z_]\w*)\s+(?:SET\s+)?OWNER\s+TO\s+\[?([^\]]+?)\]?$/i.exec(S))) {
      const t = exige(m[1]); const p = m[2].trim();
      db.run('UPDATE __meta SET dono=? WHERE tabela=?', [p, t]);
      if (!um(db, 'SELECT 1 FROM __meta WHERE tabela=?', [t])) db.run('INSERT INTO __meta (tabela, tipo, dono) VALUES (?,?,?)', [t, ehView(db, t) ? 'VIEW' : 'MANAGED', p]);
      msg(ctx, `Dono de ${logico(t)} agora é ${p}.`); return true;
    }
    if ((m = /^ALTER\s+TABLE\s+([A-Za-z_]\w*)\s+([\s\S]+)$/i.exec(S))) {
      const t = exige(m[1]); const r = m[2].trim(); let x;
      if ((x = /^(?:ALTER|CHANGE)\s+(?:COLUMN\s+)?(\w+)\s+COMMENT\s+(\u0001\d+\u0002)$/i.exec(r))) { db.run('DELETE FROM __comentarios WHERE tabela=? AND lower(coluna)=lower(?)', [t, x[1]]); db.run('INSERT INTO __comentarios VALUES (?,?,?)', [t, x[1], valorLit(x[2], lits)]); msg(ctx, `Comentário salvo em ${L(t)}.${x[1]}.`); return true; }
      if ((x = /^SET\s+TBLPROPERTIES\s*\(([\s\S]*)\)$/i.exec(r))) { const props = desm(x[1], lits); const cm = /'comment'\s*=\s*'([^']*)'/i.exec(props); if (cm) db.run('UPDATE __meta SET comentario=? WHERE tabela=?', [cm[1], t]); novaVersao(dbx, db, t, 'SET TBLPROPERTIES', { properties: props }, {}); msg(ctx, `Propriedades de ${L(t)} atualizadas.`); return true; }
      if ((x = /^(?:ALTER\s+(?:COLUMN\s+)?(\w+)\s+)?SET\s+TAGS\s*\(([\s\S]*)\)$/i.exec(r))) {
        dividirTopo(x[2], ',').forEach(p => { const kv = p.split('='); const k = valorLit(kv[0].trim(), lits) || kv[0].trim(); const v = kv[1] ? valorLit(kv[1].trim(), lits) : ''; db.run('INSERT INTO __tags VALUES (?,?,?,?)', [L(t), x[1] || null, k, v]); });
        msg(ctx, `Tags aplicadas em ${L(t)}${x[1] ? '.' + x[1] : ''}.`); return true;
      }
      if ((x = /^ADD\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(([\s\S]+)\)$/i.exec(r))) {
        const cond = funcoesExpr(x[2]);
        const ruim = um(db, `SELECT COUNT(*) FROM "${t}" WHERE NOT (${desm(cond, lits)})`);
        if (ruim) throw erro('DELTA_NEW_CHECK_CONSTRAINT_VIOLATION', `${ruim} linha(s) de ${L(t)} já violam a regra ${x[1]}. Corrija os dados antes de criar a constraint.`);
        db.run('INSERT INTO __checks VALUES (?,?,?)', [t, x[1], desm(cond, lits)]); novaVersao(dbx, db, t, 'ADD CONSTRAINT', { name: x[1], expr: desm(x[2], lits) }, {}); msg(ctx, `Constraint ${x[1]} criada em ${L(t)}.`); return true;
      }
      if ((x = /^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)$/i.exec(r))) { db.run('DELETE FROM __checks WHERE tabela=? AND lower(nome)=lower(?)', [t, x[1]]); novaVersao(dbx, db, t, 'DROP CONSTRAINT', { name: x[1] }, {}); msg(ctx, `Constraint ${x[1]} removida.`); return true; }
      if ((x = /^ALTER\s+(?:COLUMN\s+)?(\w+)\s+SET\s+NOT\s+NULL$/i.exec(r))) {
        const ruim = um(db, `SELECT COUNT(*) FROM "${t}" WHERE "${x[1]}" IS NULL`);
        if (ruim) throw erro('DELTA_NOT_NULL_CONSTRAINT_VIOLATED', `${ruim} linha(s) de ${L(t)} têm ${x[1]} nulo.`);
        db.run('INSERT INTO __checks VALUES (?,?,?)', [t, `${x[1]}_not_null`, `"${x[1]}" IS NOT NULL`]); novaVersao(dbx, db, t, 'CHANGE COLUMN', { column: x[1], nullable: false }, {}); msg(ctx, `${x[1]} agora é NOT NULL.`); return true;
      }
      if ((x = /^CLUSTER\s+BY\s+(?:\(([^)]*)\)|(AUTO|NONE))$/i.exec(r))) { const v = x[2] ? (/NONE/i.test(x[2]) ? null : 'AUTO') : x[1].split(',').map(s => s.trim()).join(','); db.run('UPDATE __meta SET cluster=? WHERE tabela=?', [v, t]); novaVersao(dbx, db, t, 'CLUSTER BY', { clusteringColumns: v }, {}); msg(ctx, v ? `Liquid clustering de ${L(t)}: ${v}. Rode OPTIMIZE para reorganizar os dados.` : `Liquid clustering desligado em ${L(t)}.`); return true; }
      if ((x = /^RENAME\s+TO\s+(\w+)$/i.exec(r))) { const novo = x[1]; db.exec(`ALTER TABLE "${t}" RENAME TO "${novo}"`); db.run('UPDATE __meta SET tabela=? WHERE tabela=?', [novo, t]); db.run('UPDATE __historico SET tabela=? WHERE tabela=?', [novo, t]); linhas(db, 'SELECT versao FROM __historico WHERE tabela=?', [novo]).forEach(([v]) => { if (existe(db, `__v_${t}_${v}`)) db.exec(`ALTER TABLE "__v_${t}_${v}" RENAME TO "__v_${novo}_${v}"`); }); msg(ctx, `${L(t)} agora se chama ${L(novo)}.`); return true; }
      if ((x = /^ADD\s+COLUMNS?\s*\(?([\s\S]*?)\)?$/i.exec(r))) {
        const { defs, coment } = tiposDDL(x[1]);
        dividirTopo(defs, ',').forEach(d => base(`ALTER TABLE ${t} ADD ${d.trim()}`));
        coment.forEach(([c, l]) => db.run('INSERT INTO __comentarios VALUES (?,?,?)', [t, c, valorLit(l, lits)]));
        novaVersao(dbx, db, t, 'ADD COLUMNS', { columns: desm(defs, lits) }, {}); msg(ctx, `Coluna(s) adicionada(s) em ${L(t)}.`); return true;
      }
      return false;
    }
    if ((m = /^UNDROP\s+TABLE\s+([A-Za-z_]\w*)$/i.exec(S))) {
      const g = linhas(db, 'SELECT guardada FROM __lixeira WHERE lower(tabela)=lower(?) ORDER BY quando DESC LIMIT 1', [m[1]])[0];
      if (!g) throw erro('TABLE_OR_VIEW_NOT_FOUND', `Nenhuma tabela ${logico(m[1])} apagada nos últimos 7 dias.`);
      if (existe(db, m[1])) throw erro('TABLE_ALREADY_EXISTS', `Já existe uma tabela ${logico(m[1])}.`);
      db.exec(`ALTER TABLE "${g[0]}" RENAME TO "${m[1]}"`); db.run('DELETE FROM __lixeira WHERE guardada=?', [g[0]]);
      msg(ctx, `${logico(m[1])} recuperada com o UNDROP.`); return true;
    }
    if ((m = /^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?([A-Za-z_]\w*)$/i.exec(S))) {
      const t = nomeReal(db, m[2]);
      if (!existe(db, t)) { if (m[1]) return true; throw erro('TABLE_OR_VIEW_NOT_FOUND', `A tabela ${logico(t)} não foi encontrada.`); }
      if (ehView(db, t)) return false;
      const tipoM = um(db, 'SELECT tipo FROM __meta WHERE tabela=?', [t]);
      if (tipoM === 'MATERIALIZED_VIEW') throw erro('WRONG_COMMAND_FOR_OBJECT_TYPE', `${logico(t)} é uma materialized view: use DROP MATERIALIZED VIEW.`);
      const g = `__lixo_${t}_${Date.now() % 100000}`;
      db.exec(`ALTER TABLE "${t}" RENAME TO "${g}"`); db.run('INSERT INTO __lixeira VALUES (?,?,?)', [t, g, MS.AGORA]);
      msg(ctx, `Tabela ${logico(t)} apagada. ${tipoM === 'EXTERNAL' ? 'Era EXTERNAL: os arquivos continuam no armazenamento.' : 'Gerenciada: dá para recuperar com UNDROP TABLE por 7 dias.'}`); return true;
    }
    if ((m = /^DROP\s+MATERIALIZED\s+VIEW\s+(IF\s+EXISTS\s+)?([A-Za-z_]\w*)$/i.exec(S))) { const t = nomeReal(db, m[2]); if (existe(db, t)) { db.exec(`DROP TABLE "${t}"`); db.run('DELETE FROM __meta WHERE tabela=?', [t]); } msg(ctx, `Materialized view ${logico(t)} apagada.`); return true; }
    if ((m = /^REFRESH\s+(?:MATERIALIZED\s+VIEW|STREAMING\s+TABLE)\s+([A-Za-z_]\w*)(?:\s+FULL)?$/i.exec(S))) {
      const t = exige(m[1]); const cons = um(db, 'SELECT consulta FROM __meta WHERE tabela=?', [t]);
      if (!cons) throw erro('NOT_A_MATERIALIZED_VIEW', `${L(t)} não é uma materialized view.`);
      db.exec(`DROP TABLE "${t}"`); base(`SELECT * INTO ${t} FROM (${groupByAll(cons)}) AS __mv`);
      db.run('INSERT INTO __historico VALUES (?,?,?,?,?,?,?)', [t, (versaoAtual(db, t) ?? -1) + 1, agora(), USUARIO, 'REFRESH', '{}', json({ numOutputRows: contar(db, t) })]);
      msg(ctx, `Materialized view ${L(t)} atualizada (${contar(db, t)} linhas).`); return true;
    }
    if ((m = /^COPY\s+INTO\s+([A-Za-z_]\w*)\s+FROM\s+(\u0001\d+\u0002)\s+FILEFORMAT\s*=\s*(\w+)([\s\S]*)$/i.exec(S))) {
      const t = exige(m[1]); const caminho = valorLit(m[2], lits);
      const force = /'force'\s*=\s*'true'/i.test(desm(m[4], lits));
      const arqs = arquivosDe(db, caminho); let ins = 0, lidos = 0;
      const colsT = colunas(db, t).map(c => c[0].toLowerCase());
      for (const [cam, tab] of arqs) {
        if (!force && um(db, 'SELECT 1 FROM __copy WHERE tabela=? AND arquivo=?', [t, cam])) continue;
        const cs = colunas(db, tab).map(c => c[0]).filter(c => colsT.includes(c.toLowerCase()));
        const n = contar(db, tab); db.exec(`INSERT INTO "${t}" (${cs.map(c => `"${c}"`).join(', ')}) SELECT ${cs.map(c => `"${c}"`).join(', ')} FROM "${tab}"`);
        db.run('INSERT INTO __copy VALUES (?,?)', [t, cam]); ins += n; lidos++;
      }
      if (lidos) novaVersao(dbx, db, t, 'COPY INTO', { files: lidos }, { numOutputRows: ins });
      resultado(ctx, ['num_affected_rows', 'num_inserted_rows', 'num_skipped_corrupt_files'], [[ins, ins, 0]]);
      if (!lidos) msg(ctx, 'Nenhum arquivo novo: o COPY INTO já carregou esses arquivos antes (é idempotente).');
      return true;
    }
    if (/^(CREATE|REFRESH)\s+(OR\s+REFRESH\s+)?STREAMING\s+TABLE\b/i.test(S)) throw erro('UNSUPPORTED_IN_SIMULATOR', 'Streaming tables leem dados continuamente (Auto Loader/Lakeflow) e não rodam no simulador. Aqui use CREATE TABLE ... AS SELECT ou uma materialized view.');
    if (/^(SET|RESET)\b/i.test(S) && !/^SET\s+@/i.test(S)) { msg(ctx, 'Configuração aplicada (simulada).'); return true; }
    return false;
  }

  /* ------------------------------------------------------------------ CREATE */
  function criar(st, ctx, dbx, db, lits, base) {
    let m = /^CREATE\s+(OR\s+REPLACE\s+)?(TEMPORARY\s+|TEMP\s+)?(MATERIALIZED\s+VIEW|TABLE|VIEW)\s+(IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)\b([\s\S]*)$/i.exec(st.trim());
    if (!m) return null;
    const substituir = !!m[1], tipoObj = m[3].toUpperCase().replace(/\s+/g, ' '), seNao = !!m[4], t = m[5]; let resto = m[6];
    const ja = existe(db, t);
    if (ja && seNao) { msg(ctx, `${logico(t)} já existe.`); return { feito: true }; }
    if (ja && !substituir && tipoObj !== 'VIEW') throw erro('TABLE_OR_VIEW_ALREADY_EXISTS', `${logico(t)} já existe. Use CREATE OR REPLACE ou IF NOT EXISTS.`);
    if (tipoObj === 'VIEW') {
      const c = /\bAS\b([\s\S]*)$/i.exec(resto); if (!c) return null;
      if (ja && !substituir) throw erro('TABLE_OR_VIEW_ALREADY_EXISTS', `A view ${logico(t)} já existe. Use CREATE OR REPLACE VIEW.`);
      const comCm = /\bCOMMENT\s+(\u0001\d+\u0002)/i.exec(resto.slice(0, c.index));
      db.run('DELETE FROM __meta WHERE tabela=?', [t]); db.run('INSERT INTO __meta (tabela, tipo, comentario, criado, dono) VALUES (?,?,?,?,?)', [t, 'VIEW', comCm ? valorLit(comCm[1], lits) : null, agora(), USUARIO]);
      return { sql: `${ja ? 'DROP VIEW ' + t + '; ' : ''}CREATE VIEW ${t} AS ${c[1].trim()}`, criado: t, view: true };
    }
    // opções do Delta antes do AS ou depois dos parênteses
    let defs = null;
    if (/^\s*\(/.test(resto)) { const a = resto.indexOf('('); const f = fechar(resto, a + 1); defs = resto.slice(a + 1, f); resto = resto.slice(f + 1); }
    const asM = acharTopo(resto, /\bAS\b/);
    const opcoes = asM ? resto.slice(0, asM.index) : resto;
    const consulta = asM ? resto.slice(asM.index + 2).trim() : null;
    const local = (/\bLOCATION\s+(\u0001\d+\u0002)/i.exec(opcoes) || [])[1];
    const cluster = /\bCLUSTER\s+BY\s+(?:\(([^)]*)\)|(AUTO))/i.exec(opcoes);
    const comCm = /\bCOMMENT\s+(\u0001\d+\u0002)/i.exec(opcoes);
    if (/\bUSING\s+(?!DELTA\b)(\w+)/i.test(opcoes) && !local) throw erro('UNSUPPORTED_DATA_SOURCE', 'Tabelas gerenciadas do Unity Catalog usam Delta Lake. Tire o USING ou use USING DELTA.');
    if (tipoObj === 'MATERIALIZED VIEW' && !consulta) throw erro('PARSE_SYNTAX_ERROR', 'Materialized view precisa de AS SELECT ...');
    let sql = '';
    if (ja) { if (ehView(db, t)) sql += `DROP VIEW ${t}; `; else db.exec(`DROP TABLE "${nomeReal(db, t)}"`); }
    const coments = [];
    if (defs != null) { const r = tiposDDL(defs); coments.push(...r.coment); sql += `CREATE TABLE ${t} (${r.defs})`; }
    if (consulta) {
      if (defs != null) sql += `; INSERT INTO ${t} ${consulta}`;
      else sql += `SELECT * INTO ${t} FROM (${consulta}) AS __ctas`;
    }
    if (!sql) throw erro('PARSE_SYNTAX_ERROR', 'Informe as colunas entre parênteses ou AS SELECT ...');
    return {
      sql, criado: t, depois: () => {
        const nome = nomeReal(db, t);
        db.run('DELETE FROM __meta WHERE tabela=?', [nome]);
        db.run('INSERT INTO __meta (tabela, tipo, comentario, local, cluster, consulta, criado, arquivos, dono) VALUES (?,?,?,?,?,?,?,?,?)',
          [nome, tipoObj === 'MATERIALIZED VIEW' ? 'MATERIALIZED_VIEW' : local ? 'EXTERNAL' : 'MANAGED', comCm ? valorLit(comCm[1], lits) : null, local ? valorLit(local, lits) : null,
            cluster ? (cluster[2] ? 'AUTO' : cluster[1].split(',').map(s => s.trim()).join(',')) : null, tipoObj === 'MATERIALIZED VIEW' ? desm(consulta, lits) : null, agora(), 1, USUARIO]);
        db.run('DELETE FROM __comentarios WHERE tabela=?', [nome]);
        coments.forEach(([c, l]) => db.run('INSERT INTO __comentarios VALUES (?,?,?)', [nome, c.replace(/^\[|\]$/g, ''), valorLit(l, lits)]));
        if (tipoObj !== 'MATERIALIZED VIEW') {
          if (ja) novaVersao(dbx, db, nome, consulta ? 'CREATE OR REPLACE TABLE AS SELECT' : 'CREATE OR REPLACE TABLE', {}, { numOutputRows: contar(db, nome) });
          else { db.run('DELETE FROM __historico WHERE tabela=?', [nome]); novaVersao(dbx, db, nome, consulta ? 'CREATE TABLE AS SELECT' : 'CREATE TABLE', cluster ? { clusterBy: cluster[0] } : {}, { numOutputRows: contar(db, nome) }); }
        } else db.run('INSERT INTO __historico VALUES (?,?,?,?,?,?,?)', [nome, 0, agora(), USUARIO, 'CREATE MATERIALIZED VIEW', '{}', json({ numOutputRows: contar(db, nome) })]);
        msg(ctx, `${tipoObj === 'MATERIALIZED VIEW' ? 'Materialized view' : 'Tabela'} ${logico(nome)} criada${consulta ? ` com ${contar(db, nome)} linha(s)` : ''}.`);
      }
    };
  }

  /* ------------------------------------------------------------------ DML */
  function alvoDML(st) {
    let m;
    if ((m = /^\s*INSERT\s+(?:INTO|OVERWRITE)\s+(?:TABLE\s+)?([A-Za-z_]\w*)/i.exec(st))) return ['INSERT', m[1]];
    if ((m = /^\s*UPDATE\s+([A-Za-z_]\w*)/i.exec(st))) return ['UPDATE', m[1]];
    if ((m = /^\s*DELETE\s+FROM\s+([A-Za-z_]\w*)/i.exec(st))) return ['DELETE', m[1]];
    if ((m = /^\s*MERGE\s+INTO\s+([A-Za-z_]\w*)/i.exec(st))) return ['MERGE', m[1]];
    if ((m = /^\s*TRUNCATE\s+TABLE\s+([A-Za-z_]\w*)/i.exec(st))) return ['TRUNCATE', m[1]];
    if ((m = /^\s*WITH\b[\s\S]*?\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+([A-Za-z_]\w*)/i.exec(st))) return [m[1].split(/\s/)[0].toUpperCase(), m[2]];
    return null;
  }
  function merge(st, db) {
    const m = /^\s*MERGE\s+INTO\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?\s+USING\s+([\s\S]+?)\s+ON\s+/i.exec(st);
    if (!m) return st;
    const t = nomeReal(db, m[1]);
    const alias = m[2] && !/^USING$/i.test(m[2]) ? m[2] : t;
    const usoM = /USING\s+(?:\([\s\S]*\)|[A-Za-z_]\w*)\s+(?:AS\s+)?([A-Za-z_]\w*)\s+ON\b/i.exec(st);
    const src = usoM ? usoM[1] : null;
    const cols = colunas(db, t).map(c => c[0]);
    if (/UPDATE\s+SET\s+\*/i.test(st) || /INSERT\s+\*/i.test(st)) {
      if (!src) throw erro('PARSE_SYNTAX_ERROR', 'Dê um apelido à origem do MERGE (USING ... AS s) para usar SET * / INSERT *.');
      st = st.replace(/UPDATE\s+SET\s+\*/gi, 'UPDATE SET ' + cols.map(c => `${alias}.${q(c)} = ${src}.${q(c)}`).join(', '))
        .replace(/INSERT\s+\*/gi, `INSERT (${cols.map(q).join(', ')}) VALUES (${cols.map(c => `${src}.${q(c)}`).join(', ')})`);
    }
    return st;
  }

  /* ------------------------------------------------------------------ erros */
  function erroDbx(e) {
    let t = String(e.message || e);
    if (/^\[[A-Z_]+\]/.test(t)) return e;
    const m1 = /Nome de objeto inválido[^:']*[:']\s*'?([\w.]+)|no such table: (\S+)/i.exec(t);
    if (m1) t = `[TABLE_OR_VIEW_NOT_FOUND] A tabela ou view ${logico(m1[1] || m1[2])} não foi encontrada. Confira catálogo, esquema e nome (ex.: banco.prata.clientes).`;
    const m2 = /Nome de coluna inválido[^:']*[:']\s*'?([\w.]+)|no such column: (\S+)/i.exec(t);
    if (m2) t = `[UNRESOLVED_COLUMN] A coluna ${m2[1] || m2[2]} não existe nas tabelas da consulta. Confira o nome com DESCRIBE TABLE.`;
    if (/Sintaxe incorreta|syntax error/i.test(t) && !m1 && !m2) t = '[PARSE_SYNTAX_ERROR] ' + t;
    t = t.replace(/\b(bronze|prata|ouro)_([A-Za-z_]\w*)\b/g, (x, a, b) => `${CAT}.${a}.${b}`);
    const x = new Error(t); x.numero = e.numero; return x;
  }

  /* nomes das colunas como o aluno escreveu (as reescritas internas não aparecem) */
  function nomesOriginais(st, lits) {
    const m = /^\s*SELECT\s+(DISTINCT\s+)?/i.exec(st); if (!m) return null;
    const resto = st.slice(m[0].length), fim = acharTopo(resto, /\b(FROM|UNION|EXCEPT|INTERSECT|ORDER\s+BY|LIMIT|WHERE|GROUP\s+BY)\b/);
    const itens = dividirTopo(fim ? resto.slice(0, fim.index) : resto, ',').map(x => x.trim());
    if (itens.some(x => /(^|\.)\*($|\s)/.test(x))) return null;
    return itens.map(x => {
      if (semApelido(x) !== x || /^[A-Za-z_][\w.]*$/.test(x)) return null;
      const n = desm(x, lits).replace(/\s+/g, ' ');
      return /^'(.*)'$/.test(n) ? n.slice(1, -1) : n;
    });
  }

  function tipoDbx(c) { const x = (c || '').toUpperCase(); if (/CHAR|TEXT|MAX/.test(x)) return 'string'; if (/^BIT/.test(x)) return 'boolean'; if (/BIGINT/.test(x)) return 'bigint'; if (/INT/.test(x)) return 'int'; if (/DEC|NUM/.test(x)) return x.toLowerCase().replace('numeric', 'decimal'); if (/FLOAT|REAL|DOUBLE/.test(x)) return 'double'; if (/DATETIME|TIMESTAMP/.test(x)) return 'timestamp'; if (/DATE/.test(x)) return 'date'; return x.toLowerCase() || 'string'; }

  /* ------------------------------------------------------------------ execução */
  function instrucoes(code) { // divide no ; de topo
    const out = []; let d = 0, ini = 0;
    for (let k = 0; k < code.length; k++) { const c = code[k]; if (c === '(') d++; else if (c === ')') d--; else if (c === ';' && d === 0) { out.push(code.slice(ini, k)); ini = k + 1; } }
    out.push(code.slice(ini));
    return out.map(s => s.trim()).filter(Boolean);
  }
  function rodar(ctx, sql, base) {
    const db = ctx.db;
    const dbx = ctx.dbx || (ctx.dbx = { esquema: null });
    const { code, lits } = mascarar(String(sql));
    const bL = (x) => base(desm(x, lits));
    for (let st of instrucoes(code)) {
      try {
        if (/\bSELECT\s+(DISTINCT\s+)?TOP\b/i.test(st)) throw erro('PARSE_SYNTAX_ERROR', 'O Databricks SQL não tem TOP (isso é do SQL Server). Use LIMIT n no fim da consulta: SELECT … ORDER BY … LIMIT 10.');
        const orig = nomesOriginais(st, lits), n0 = ctx.res.length;
        st = nomes(st, dbx, db);
        st = st.replace(/\bcurrent_(schema|database)\s*\(\s*\)/gi, `'${dbx.esquema || 'default'}'`);
        st = st.replace(/\bTRUNCATE\s+TABLE\b/i, 'DELETE FROM');
        if (especiais(st, ctx, dbx, db, lits, base)) continue;
        st = readFiles(st, db, lits);
        st = viagem(st, db, lits);
        st = jsonPath(st);
        st = casts(st);
        st = funcoesExpr(st);
        const cr = criar(st, ctx, dbx, db, lits, base);
        if (cr && cr.feito) continue;
        if (cr) {
          let s2 = cr.sql;
          s2 = explode(qualify(exceto(groupByAll(s2), ctx, bL), ctx, bL));
          base(desm(s2, lits));
          if (cr.depois) cr.depois(); else if (cr.view) msg(ctx, `View ${logico(cr.criado)} criada.`);
          continue;
        }
        let sobrescrever = null;
        st = st.replace(/^\s*INSERT\s+OVERWRITE\s+(?:TABLE\s+)?([A-Za-z_]\w*)/i, (mm, t) => { sobrescrever = t; return `INSERT INTO ${t}`; });
        const alvo = alvoDML(st);
        if (alvo) {
          const t = nomeReal(db, alvo[1]);
          if (!existe(db, t)) throw erro('TABLE_OR_VIEW_NOT_FOUND', `A tabela ${logico(t)} não foi encontrada.`);
          if (ehView(db, t)) throw erro('EXPECT_TABLE_NOT_VIEW', `${logico(t)} é uma view: não dá para alterar dados por ela.`);
          if (um(db, 'SELECT tipo FROM __meta WHERE tabela=?', [t]) === 'MATERIALIZED_VIEW') throw erro('EXPECT_TABLE_NOT_VIEW', `${logico(t)} é uma materialized view: os dados vêm da consulta. Use REFRESH MATERIALIZED VIEW.`);
          if (alvo[0] === 'MERGE') st = merge(st, db);
          st = explode(qualify(exceto(groupByAll(st), ctx, bL), ctx, bL));
          const antes = ctx.rowcount || 0;
          const temCheck = !!um(db, 'SELECT 1 FROM __checks WHERE tabela=?', [t]);
          db.exec('SAVEPOINT __dbx');
          try { if (sobrescrever) db.exec(`DELETE FROM "${t}"`); base(desm(st, lits)); }
          catch (e) { db.exec('ROLLBACK TO __dbx; RELEASE __dbx'); throw e; }
          const v = temCheck ? verificarChecks(db, t, lits) : null;
          if (v) { db.exec('ROLLBACK TO __dbx; RELEASE __dbx'); ctx.rowcount = antes; throw new ErroDbx(v); }
          db.exec('RELEASE __dbx');
          const n = (ctx.rowcount || 0) - antes;
          const op = sobrescrever ? 'WRITE' : { INSERT: 'WRITE', UPDATE: 'UPDATE', DELETE: 'DELETE', MERGE: 'MERGE', TRUNCATE: 'TRUNCATE' }[alvo[0]] || alvo[0];
          const met = { INSERT: { numOutputRows: n }, UPDATE: { numUpdatedRows: n }, DELETE: { numDeletedRows: n }, MERGE: { numTargetRowsAffected: n }, TRUNCATE: { numRemovedFiles: 1 } }[alvo[0]] || {};
          if (n > 0 || alvo[0] === 'MERGE' || alvo[0] === 'DELETE' || sobrescrever) novaVersao(dbx, db, t, op, alvo[0] === 'INSERT' ? { mode: sobrescrever ? 'Overwrite' : 'Append' } : {}, met);
          ctx.msgs = ctx.msgs.filter(x => !/linha\(s\) afetada|linhas afetadas|row\(s\) affected/i.test(x));
          resultado(ctx, ['num_affected_rows'], [[n]]);
          continue;
        }
        st = explode(qualify(exceto(groupByAll(st), ctx, bL), ctx, bL));
        base(desm(st, lits));
        const r = ctx.res.length > n0 ? ctx.res[ctx.res.length - 1] : null;
        if (orig && r && r.columns.length === orig.length) r.columns = r.columns.map((c, i) => orig[i] || c);
        if (r && ctx.res.length > n0) for (const row of r.values) for (let i = 0; i < row.length; i++) if (typeof row[i] === 'number' && !Number.isInteger(row[i])) row[i] = Math.round(row[i] * 1e8) / 1e8;
      } catch (e) {
        if (e && (e.ctrl || e.constructor && /Retorno|Rollback/.test(e.constructor.name))) throw e;
        throw erroDbx(e);
      }
    }
  }

  MS.registrarDialeto('databricks', { iniciar, rodar });
  MS.DATABRICKS = { mascarar, casts, jsonPath, funcoesExpr, logico, tipo: tipoDbx };
})(typeof window !== 'undefined' ? window : globalThis);
