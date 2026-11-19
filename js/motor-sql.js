/* =====================================================================
   SQLito — motor do laboratório
   Roda SQL no navegador (sql.js / SQLite) aceitando a sintaxe do SQL Server:
   TOP, OFFSET/FETCH, GETDATE, DATEADD/DATEDIFF/DATEPART/DATENAME, EOMONTH,
   LEN, LEFT/RIGHT, CHARINDEX, FORMAT, ISNULL, CAST/CONVERT, IDENTITY,
   BEGIN TRAN/SAVE/ROLLBACK, TRUNCATE, INFORMATION_SCHEMA, sys.*, sp_columns...
   O relógio das trilhas é fixo: GETDATE() = 2026-11-20 09:30:00.
   ===================================================================== */
(function (raiz) {
  'use strict';
  const AGORA = '2026-11-20 09:30:00';


  /* Catálogo do SQL Server simulado com views temporárias (sempre refletem o estado atual) */
  const TIPO = `lower(CASE WHEN instr(p.type,'(')>0 THEN trim(substr(p.type,1,instr(p.type,'(')-1)) ELSE p.type END)`;
  const META = cat => `
CREATE TEMP VIEW __is_tables AS SELECT '${cat}' AS TABLE_CATALOG,'dbo' AS TABLE_SCHEMA,name AS TABLE_NAME,CASE type WHEN 'table' THEN 'BASE TABLE' ELSE 'VIEW' END AS TABLE_TYPE FROM main.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%';
CREATE TEMP VIEW __is_columns AS SELECT '${cat}' AS TABLE_CATALOG,'dbo' AS TABLE_SCHEMA,m.name AS TABLE_NAME,p.name AS COLUMN_NAME,p.cid+1 AS ORDINAL_POSITION,p.dflt_value AS COLUMN_DEFAULT,CASE WHEN p."notnull"=1 OR p.pk>0 THEN 'NO' ELSE 'YES' END AS IS_NULLABLE,CASE ${TIPO} WHEN 'integer' THEN 'int' ELSE ${TIPO} END AS DATA_TYPE,CASE WHEN instr(p.type,'(')>0 AND lower(p.type) LIKE '%char%' THEN CAST(substr(p.type,instr(p.type,'(')+1,instr(p.type,')')-instr(p.type,'(')-1) AS INTEGER) END AS CHARACTER_MAXIMUM_LENGTH FROM main.sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%';
CREATE TEMP VIEW __is_views AS SELECT 'dbo' AS TABLE_SCHEMA,name AS TABLE_NAME,sql AS VIEW_DEFINITION FROM main.sqlite_master WHERE type='view';
CREATE TEMP VIEW __is_table_constraints AS
 SELECT 'dbo' AS TABLE_SCHEMA,'PK_'||m.name AS CONSTRAINT_NAME,m.name AS TABLE_NAME,'PRIMARY KEY' AS CONSTRAINT_TYPE FROM main.sqlite_master m WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE pk>0)
 UNION ALL SELECT 'dbo','FK_'||m.name||'_'||f."from",m.name,'FOREIGN KEY' FROM main.sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type='table'
 UNION ALL SELECT 'dbo','UQ_'||m.name||'_'||ii.name,m.name,'UNIQUE' FROM main.sqlite_master m JOIN pragma_index_list(m.name) i JOIN pragma_index_info(i.name) ii WHERE m.type='table' AND i."unique"=1 AND i.origin='u';
CREATE TEMP VIEW __is_key_column_usage AS
 SELECT 'dbo' AS TABLE_SCHEMA,'PK_'||m.name AS CONSTRAINT_NAME,m.name AS TABLE_NAME,p.name AS COLUMN_NAME,p.pk AS ORDINAL_POSITION FROM main.sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND p.pk>0
 UNION ALL SELECT 'dbo','FK_'||m.name||'_'||f."from",m.name,f."from",f.seq+1 FROM main.sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type='table';
CREATE TEMP VIEW __sys_tables AS SELECT name,1000+rowid AS object_id,1 AS schema_id,'U' AS type,'USER_TABLE' AS type_desc FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
CREATE TEMP VIEW __sys_views AS SELECT name,1000+rowid AS object_id,1 AS schema_id,'V' AS type,'VIEW' AS type_desc FROM main.sqlite_master WHERE type='view';
CREATE TEMP VIEW __sys_objects AS SELECT * FROM __sys_tables UNION ALL SELECT * FROM __sys_views;
CREATE TEMP VIEW __sys_schemas AS SELECT 'dbo' AS name,1 AS schema_id;
CREATE TEMP VIEW __sys_columns AS SELECT 1000+m.rowid AS object_id,p.name AS name,p.cid+1 AS column_id,CASE WHEN p."notnull"=1 OR p.pk>0 THEN 0 ELSE 1 END AS is_nullable FROM main.sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%';
CREATE TEMP VIEW __sys_indexes AS
 SELECT 1000+m.rowid AS object_id,'PK_'||m.name AS name,1 AS is_primary_key,1 AS is_unique,'CLUSTERED' AS type_desc FROM main.sqlite_master m WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE pk>0)
 UNION ALL SELECT 1000+m.rowid,i.name,0,i."unique",'NONCLUSTERED' FROM main.sqlite_master m JOIN pragma_index_list(m.name) i WHERE m.type='table' AND i.origin<>'pk' AND i.name NOT LIKE 'sqlite_autoindex%'
 UNION ALL SELECT 1000+m.rowid,'UQ_'||m.name||'_'||ii.name,0,1,'NONCLUSTERED' FROM main.sqlite_master m JOIN pragma_index_list(m.name) i JOIN pragma_index_info(i.name) ii WHERE m.type='table' AND i.origin='u';
`;

  /* ---------------- datas ---------------- */
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const P2 = n => String(n).padStart(2, '0');
  function lerData(v) {
    if (v == null) return null;
    const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))), soData: !m[4] };
  }
  function txtData(d, soData) {
    const s = `${d.getUTCFullYear()}-${P2(d.getUTCMonth() + 1)}-${P2(d.getUTCDate())}`;
    return soData ? s : `${s} ${P2(d.getUTCHours())}:${P2(d.getUTCMinutes())}:${P2(d.getUTCSeconds())}`;
  }
  function parte(p) {
    p = String(p).toLowerCase();
    const mapa = { yy: 'year', yyyy: 'year', qq: 'quarter', q: 'quarter', mm: 'month', m: 'month', dy: 'dayofyear', y: 'dayofyear',
      dd: 'day', d: 'day', wk: 'week', ww: 'week', dw: 'weekday', w: 'weekday', hh: 'hour', mi: 'minute', n: 'minute', ss: 'second', s: 'second' };
    return mapa[p] || p;
  }
  const inicioDia = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  function diaDoAno(d) { return Math.round((inicioDia(d) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; }
  function semana(d) { const j = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.floor((diaDoAno(d) - 1 + j.getUTCDay()) / 7) + 1; }
  function datepart(p, v) {
    const x = lerData(v); if (!x) return null; const d = x.d;
    switch (parte(p)) {
      case 'year': return d.getUTCFullYear();
      case 'quarter': return Math.floor(d.getUTCMonth() / 3) + 1;
      case 'month': return d.getUTCMonth() + 1;
      case 'dayofyear': return diaDoAno(d);
      case 'day': return d.getUTCDate();
      case 'week': return semana(d);
      case 'weekday': return d.getUTCDay() + 1;
      case 'hour': return d.getUTCHours();
      case 'minute': return d.getUTCMinutes();
      case 'second': return d.getUTCSeconds();
      default: throw new Error(`Parte de data não reconhecida: ${p}`);
    }
  }
  function dateadd(p, n, v) {
    const x = lerData(v); if (!x || n == null) return null; const d = new Date(x.d); n = Math.trunc(n);
    const somaMes = k => { const dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k);
      const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(dia, ult)); };
    switch (parte(p)) {
      case 'year': somaMes(12 * n); break;
      case 'quarter': somaMes(3 * n); break;
      case 'month': somaMes(n); break;
      case 'day': case 'dayofyear': case 'weekday': d.setUTCDate(d.getUTCDate() + n); break;
      case 'week': d.setUTCDate(d.getUTCDate() + 7 * n); break;
      case 'hour': d.setTime(d.getTime() + n * 36e5); return txtData(d, false);
      case 'minute': d.setTime(d.getTime() + n * 6e4); return txtData(d, false);
      case 'second': d.setTime(d.getTime() + n * 1e3); return txtData(d, false);
      default: throw new Error(`Parte de data não reconhecida: ${p}`);
    }
    return txtData(d, x.soData);
  }
  function datediff(p, a, b) {
    const x = lerData(a), y = lerData(b); if (!x || !y) return null; const d1 = x.d, d2 = y.d;
    switch (parte(p)) {
      case 'year': return d2.getUTCFullYear() - d1.getUTCFullYear();
      case 'quarter': return (d2.getUTCFullYear() * 4 + Math.floor(d2.getUTCMonth() / 3)) - (d1.getUTCFullYear() * 4 + Math.floor(d1.getUTCMonth() / 3));
      case 'month': return (d2.getUTCFullYear() * 12 + d2.getUTCMonth()) - (d1.getUTCFullYear() * 12 + d1.getUTCMonth());
      case 'day': case 'dayofyear': return Math.round((inicioDia(d2) - inicioDia(d1)) / 864e5);
      case 'week': return Math.round(((inicioDia(d2) - d2.getUTCDay() * 864e5) - (inicioDia(d1) - d1.getUTCDay() * 864e5)) / (7 * 864e5));
      case 'hour': return Math.floor(d2.getTime() / 36e5) - Math.floor(d1.getTime() / 36e5);
      case 'minute': return Math.floor(d2.getTime() / 6e4) - Math.floor(d1.getTime() / 6e4);
      case 'second': return Math.floor(d2.getTime() / 1e3) - Math.floor(d1.getTime() / 1e3);
      default: throw new Error(`Parte de data não reconhecida: ${p}`);
    }
  }
  function datename(p, v) {
    const x = lerData(v); if (!x) return null;
    const pp = parte(p);
    if (pp === 'month') return MESES[x.d.getUTCMonth()];
    if (pp === 'weekday') return DIAS[x.d.getUTCDay()];
    return String(datepart(p, v));
  }
  function datetrunc(p, v) {
    const x = lerData(v); if (!x) return null; const d = x.d, a = d.getUTCFullYear(), m = d.getUTCMonth();
    switch (parte(p)) {
      case 'year': return txtData(new Date(Date.UTC(a, 0, 1)), x.soData);
      case 'quarter': return txtData(new Date(Date.UTC(a, m - (m % 3), 1)), x.soData);
      case 'month': return txtData(new Date(Date.UTC(a, m, 1)), x.soData);
      case 'week': return txtData(new Date(Date.UTC(a, m, d.getUTCDate() - d.getUTCDay())), x.soData);
      case 'day': case 'dayofyear': return txtData(new Date(inicioDia(d)), x.soData);
      case 'hour': return txtData(new Date(Date.UTC(a, m, d.getUTCDate(), d.getUTCHours())), false);
      case 'minute': return txtData(new Date(Date.UTC(a, m, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())), false);
      default: throw new Error(`Parte de data não reconhecida: ${p}`);
    }
  }
  /* TRY_CAST / TRY_CONVERT / CONVERT com estilo: texto inválido vira NULL */
  const RE_NUM = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
  function tentarNumero(v, casas, inteiro) {
    if (v == null) return null;
    if (typeof v === 'number') return inteiro ? Math.trunc(v) : (casas >= 0 ? Math.round(v * 10 ** casas) / 10 ** casas : v);
    const s = String(v).trim();
    if (inteiro && s === '') return 0;
    if (inteiro ? !/^[+-]?\d+$/.test(s) : !RE_NUM.test(s)) return null;
    const n = Number(s);
    return inteiro ? Math.trunc(n) : (casas >= 0 ? Math.round(n * 10 ** casas) / 10 ** casas : n);
  }
  function tentarData(v, estilo, soData) {
    if (v == null) return null;
    const s = String(v).trim(); let a, m, d, h = 0, mi = 0, se = 0, k;
    if ((k = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) [a, m, d, h, mi, se] = [+k[1], +k[2], +k[3], +(k[4] || 0), +(k[5] || 0), +(k[6] || 0)];
    else if ((k = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [a, m, d] = [+k[1], +k[2], +k[3]];
    else if ((k = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
      const e = String(estilo == null ? 101 : estilo);
      if (/^(103|3|104|4|105|5)$/.test(e)) [d, m] = [+k[1], +k[2]]; else [m, d] = [+k[1], +k[2]];
      a = +k[3]; h = +(k[4] || 0); mi = +(k[5] || 0); se = +(k[6] || 0);
    } else return null;
    const dt = new Date(Date.UTC(a, m - 1, d, h, mi, se));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return txtData(dt, soData);
  }
  function eomonth(v, k) {
    const x = lerData(v); if (!x) return null;
    const d = new Date(Date.UTC(x.d.getUTCFullYear(), x.d.getUTCMonth() + 1 + (k ? Math.trunc(k) : 0), 0));
    return txtData(d, true);
  }
  function format(v, f, cultura) {
    if (v == null || f == null) return null;
    const loc = cultura || 'pt-BR';
    if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) {
      const n = Number(v), m = String(f).match(/^([NCP])(\d*)$/i);
      if (m) {
        const casas = m[2] === '' ? 2 : +m[2], t = m[1].toUpperCase();
        if (t === 'C') return new Intl.NumberFormat(loc, { style: 'currency', currency: loc === 'en-US' ? 'USD' : 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n).replace(/ /g, ' ');
        if (t === 'P') return new Intl.NumberFormat(loc, { style: 'percent', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n).replace(/ /g, ' ');
        return new Intl.NumberFormat(loc, { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
      }
      return String(n);
    }
    const x = lerData(v); if (!x) return String(v); const d = x.d;
    return String(f).replace(/yyyy|yy|MMMM|MMM|MM|dddd|ddd|dd|HH|hh|mm|ss/g, t => ({
      yyyy: d.getUTCFullYear(), yy: P2(d.getUTCFullYear() % 100), MMMM: MESES[d.getUTCMonth()], MMM: MESES[d.getUTCMonth()].slice(0, 3), MM: P2(d.getUTCMonth() + 1),
      dddd: DIAS[d.getUTCDay()], ddd: DIAS[d.getUTCDay()].slice(0, 3), dd: P2(d.getUTCDate()), HH: P2(d.getUTCHours()), hh: P2(((d.getUTCHours() + 11) % 12) + 1),
      mm: P2(d.getUTCMinutes()), ss: P2(d.getUTCSeconds()) })[t]);
  }

  /* ---------------- funções registradas no SQLite ---------------- */
  const nul = f => (...a) => (a.some(x => x == null) ? null : f(...a));
  const FUNCOES = {
    len: [[1], nul(s => String(s).replace(/\s+$/, '').length)],
    datalength: [[1], nul(s => new TextEncoder().encode(String(s)).length)],
    left: [[2], nul((s, n) => String(s).slice(0, Math.max(0, n)))],
    right: [[2], nul((s, n) => (n <= 0 ? '' : String(s).slice(-n)))],
    charindex: [[2, 3], nul((sub, s, ini) => { const i = String(s).toLowerCase().indexOf(String(sub).toLowerCase(), Math.max(0, (ini || 1) - 1)); return i + 1; })],
    replicate: [[2], nul((s, n) => String(s).repeat(Math.max(0, n)))],
    reverse: [[1], nul(s => Array.from(String(s)).reverse().join(''))],
    stuff: [[4], nul((s, i, n, t) => { s = String(s); return s.slice(0, i - 1) + t + s.slice(i - 1 + n); })],
    space: [[1], nul(n => ' '.repeat(Math.max(0, n)))],
    ceiling: [[1], nul(n => Math.ceil(n))],
    upper: [[1], nul(s => String(s).toUpperCase())],
    lower: [[1], nul(s => String(s).toLowerCase())],
    getdate: [[0], () => AGORA],
    sysdatetime: [[0], () => AGORA],
    year: [[1], nul(v => datepart('year', v))],
    month: [[1], nul(v => datepart('month', v))],
    day: [[1], nul(v => datepart('day', v))],
    datepart: [[2], datepart],
    datename: [[2], datename],
    dateadd: [[3], dateadd],
    datediff: [[3], datediff],
    eomonth: [[1, 2], eomonth],
    datetrunc: [[2], datetrunc],
    isnumeric: [[1], v => (v == null ? 0 : (typeof v === 'number' || RE_NUM.test(String(v)) ? 1 : 0))],
    __try_num: [[3], (v, casas, inteiro) => tentarNumero(v, casas, !!inteiro)],
    __data: [[3], (v, estilo, so) => tentarData(v, estilo, !!so)],
    datefromparts: [[3], nul((y, m, d) => txtData(new Date(Date.UTC(y, m - 1, d)), true))],
    format: [[2, 3], format],
    choose: [[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], (i, ...v) => (i == null || i < 1 || i > v.length ? null : v[Math.trunc(i) - 1])],
    db_name: [[0], () => (BANCOS[atual] || {}).catalogo || 'SQLito'],
    schema_name: [[0], () => 'dbo'],
    suser_name: [[0], () => 'aluno'],
    suser_sname: [[0], () => 'aluno'],
    original_login: [[0], () => 'aluno'],
    user_name: [[0], () => 'dbo'],
    host_name: [[0], () => 'NOTEBOOK-ALUNO'],
    app_name: [[0], () => 'SQLito'],
    quotename: [[1, 2], nul((s, q) => { const a = q || '[', f = a === '[' ? ']' : a === '(' ? ')' : a; return a + String(s).split(f).join(f + f) + f; })],
    translate: [[3], nul((s, de, para) => { s = String(s); de = String(de); para = String(para); if (de.length !== para.length) throw new Error('O segundo e o terceiro argumentos de TRANSLATE precisam ter o mesmo tamanho.'); return Array.from(s).map(c => { const i = de.indexOf(c); return i < 0 ? c : para[i]; }).join(''); })],
    patindex: [[2], nul((p, s) => patindex(String(p), String(s)))],
    regexp_like: [[2, 3], nul((s, p, f) => (rx(p, f).test(String(s)) ? 1 : 0))],
    regexp_count: [[2, 3, 4], nul((s, p, ini, f) => contarRegex(String(s), p, ini || 1, f))],
    regexp_replace: [[2, 3, 4, 5, 6], (s, p, r, ini, oc, f) => (s == null || p == null ? null : trocarRegex(String(s), p, r == null ? '' : String(r), ini || 1, oc || 0, f))],
    regexp_substr: [[2, 3, 4, 5, 6], (s, p, ini, oc, f, g) => (s == null || p == null ? null : trechoRegex(String(s), p, ini || 1, oc || 1, f, g || 0))],
    regexp_instr: [[2, 3, 4, 5, 6, 7], (s, p, ini, oc, op, f, g) => (s == null || p == null ? null : posRegex(String(s), p, ini || 1, oc || 1, op || 0, f, g || 0))],
    __split: [[2, 3], (s, sep) => (s == null ? '[]' : JSON.stringify(String(s).split(String(sep)).map((v, i) => ({ v, o: i + 1 }))))],
    __rsplit: [[2, 3], (s, p, f) => (s == null ? '[]' : JSON.stringify(String(s).split(rx(p, f, true)).map((v, i) => ({ v, o: i + 1 }))))],
    __rmatches: [[2, 3], (s, p, f) => { if (s == null) return '[]'; const out = []; for (const m of todasRegex(String(s), p, f)) out.push({ id: out.length + 1, ini: m.index + 1, fim: m.index + m[0].length, val: m[0], subs: JSON.stringify(m.slice(1)) }); return JSON.stringify(out); }],
    __xmlvalor: [[2, 3], (x, p) => { if (x == null) return null; const nome = String(p).replace(/[()\[\]\d@'"]/g, '').split('/').filter(Boolean).pop(); const m = String(x).match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`)); return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null; }],
  };
  /* ---------------- LIKE do SQL Server ([a-z], [^0-9]) e expressões regulares ---------------- */
  const CACHE_LIKE = new Map();
  function likeRe(p, ancorarFim) {
    const k = p + (ancorarFim === false ? '\u0000' : '');
    if (CACHE_LIKE.has(k)) return CACHE_LIKE.get(k);
    let r = '^';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '%') r += '[\\s\\S]*';
      else if (c === '_') r += '[\\s\\S]';
      else if (c === '[') {
        const f = p.indexOf(']', i + 2 <= p.length ? i + 1 : i);
        if (f < 0) { r += '\\['; continue; }
        let cls = p.slice(i + 1, f); const neg = cls[0] === '^'; if (neg) cls = cls.slice(1);
        r += '[' + (neg ? '^' : '') + cls.replace(/[\\\]]/g, '\\$&') + ']'; i = f;
      } else r += c.replace(/[.*+?^${}()|\\\]\/]/g, '\\$&');
    }
    const re = new RegExp(r + (ancorarFim === false ? '' : '$'), 'i');
    CACHE_LIKE.set(k, re); return re;
  }
  function likeSql(p, s) { if (p == null || s == null) return null; return likeRe(String(p)).test(String(s)) ? 1 : 0; }
  function patindex(p, s) {
    if (p[0] !== '%') return likeRe(p).test(s) ? 1 : 0;
    const resto = p.slice(1);
    for (let i = 0; i < s.length; i++) if (likeRe(resto).test(s.slice(i))) return i + 1;
    return 0;
  }
  const POSIX = { alpha: 'A-Za-zÀ-ÖØ-öø-ÿ', digit: '0-9', alnum: '0-9A-Za-zÀ-ÖØ-öø-ÿ', upper: 'A-ZÀ-ÖØ-Þ', lower: 'a-zß-öø-ÿ', space: '\\s', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', word: '\\w' };
  function rx(p, flags, global) {
    let f = global ? 'g' : '';
    for (const ch of String(flags || 'c')) { if (ch === 'i' && !f.includes('i')) f += 'i'; else if (ch === 'c') f = f.replace('i', ''); else if (ch === 'm' && !f.includes('m')) f += 'm'; else if (ch === 's' && !f.includes('s')) f += 's'; }
    const fonte = String(p).replace(/\[:(\w+):\]/g, (m, c) => POSIX[c] || m);
    try { return new RegExp(fonte, f); } catch (e) { throw new Error('Expressão regular inválida: ' + p); }
  }
  function todasRegex(s, p, f) { const re = rx(p, f, true), out = []; let m; while ((m = re.exec(s))) { out.push(m); if (m[0] === '') re.lastIndex++; } return out; }
  function contarRegex(s, p, ini, f) { return todasRegex(s.slice(ini - 1), p, f).length; }
  function trocarRegex(s, p, r, ini, oc, f) {
    const pre = s.slice(0, ini - 1), cauda = s.slice(ini - 1); let n = 0;
    const rep = r.replace(/\\(\d)/g, '$$$1');
    return pre + cauda.replace(rx(p, f, true), (...m) => {
      n++; if (oc && n !== oc) return m[0];
      const grupos = m.slice(0, typeof m[m.length - 1] === 'object' ? -3 : -2);
      return rep.replace(/\$(\d)/g, (x, d) => (grupos[+d] == null ? '' : grupos[+d]));
    });
  }
  function trechoRegex(s, p, ini, oc, f, g) { const ms = todasRegex(s.slice(ini - 1), p, f); const m = ms[oc - 1]; return m ? (m[g] == null ? null : m[g]) : null; }
  function posRegex(s, p, ini, oc, op, f, g) {
    const ms = todasRegex(s.slice(ini - 1), p, f); const m = ms[oc - 1]; if (!m) return 0;
    let pos = m.index, tam = m[0].length;
    if (g) { const sub = m[g] || ''; const k = m[0].indexOf(sub); pos += k < 0 ? 0 : k; tam = sub.length; }
    return ini + pos + (op ? tam : 0);
  }
  const ERRO_JS = { e: null }; // sql.js perde a mensagem do erro lançado dentro de funções JS
  const protegerFn = f => function (...a) { try { return f.apply(null, a); } catch (e) { ERRO_JS.e = e; throw e; } };
  function registrar(db) {
    const like = function (p, s) { return likeSql(p, s); };
    db.create_function('like', like);
    // sql.js guarda uma função JS por nome: registramos cada uma como variádica (nArg = -1)
    for (const [nome, [ars, f]] of Object.entries(FUNCOES)) {
      const g = protegerFn((...a) => {
        if (!ars.includes(a.length)) throw new Error(`A função ${nome.toUpperCase()} requer ${ars.join(' ou ')} argumento(s).`);
        return f(...a);
      });
      Object.defineProperty(g, 'length', { value: -1 });
      db.create_function(nome, g);
    }
  }

  /* ---------------- tradução T-SQL → SQLite ---------------- */
  const PALAVRAS = 'SELECT|UPDATE|INSERT|DELETE|SET|IF|COMMIT|ROLLBACK|SAVE|WITH|CREATE|DROP|ALTER|TRUNCATE|EXEC|BEGIN|END|DECLARE|PRINT|MERGE';
  function fechar(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { if (d === 0) return k; d--; } } return s.length; }
  function profundidade(s, i) { let d = 0; for (let k = 0; k < i; k++) { if (s[k] === '(') d++; else if (s[k] === ')') d--; } return d; }
  function dividir(s, sep) { const out = []; let d = 0, ini = 0; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(') d++; else if (c === ')') d--; else if (d === 0 && s.startsWith(sep, k) && (sep !== ',' || true)) { out.push(s.slice(ini, k)); ini = k + sep.length; k += sep.length - 1; } } out.push(s.slice(ini)); return out; }
  function converterTipo(expr, tipo, estilo, tentar) {
    const t = tipo.trim().toUpperCase(), base = t.replace(/\s*\(.*$/, '');
    const est = estilo == null ? 'NULL' : String(estilo).trim();
    if (base === 'DATE') return tentar || estilo != null ? `__data(${expr}, ${est}, 1)` : `date(${expr})`;
    if (/^(DATETIME|DATETIME2|SMALLDATETIME)$/.test(base)) return tentar || estilo != null ? `__data(${expr}, ${est}, 0)` : `datetime(${expr})`;
    if (base === 'TIME') return `time(${expr})`;
    if (/CHAR|TEXT/.test(base)) {
      if (estilo != null) {
        const e = String(estilo).trim();
        if (e === '103') return `strftime('%d/%m/%Y', ${expr})`;
        if (e === '23') return `date(${expr})`;
        if (e === '108') return `strftime('%H:%M:%S', ${expr})`;
        if (e === '120') return `strftime('%Y-%m-%d %H:%M:%S', ${expr})`;
        if (e === '101') return `strftime('%m/%d/%Y', ${expr})`;
      }
      return `CAST(${expr} AS TEXT)`;
    }
    if (/^(INT|BIGINT|SMALLINT|TINYINT|BIT)$/.test(base)) return tentar ? `CAST(__try_num(${expr}, -1, 1) AS INTEGER)` : `CAST(${expr} AS INTEGER)`;
    if (/^(DECIMAL|NUMERIC)$/.test(base)) { const m = t.match(/,\s*(\d+)\s*\)/); return tentar ? `__try_num(${expr}, ${m ? m[1] : 0}, 0)` : `ROUND(CAST(${expr} AS REAL), ${m ? m[1] : 0})`; }
    if (/^(FLOAT|REAL|MONEY|SMALLMONEY)$/.test(base)) return tentar ? `__try_num(${expr}, -1, 0)` : `CAST(${expr} AS REAL)`;
    return `CAST(${expr} AS ${tipo})`;
  }
  function trocarCast(s) {
    let re = /\b(TRY_CAST|CAST)\s*\(/i, m;
    while ((m = re.exec(s))) {
      const ab = m.index + m[0].length, fe = fechar(s, ab), dentro = trocarCast(s.slice(ab, fe));
      const partes = dividir(dentro.replace(/\s+AS\s+/gi, ' AS '), ' AS ');
      let novo;
      if (partes.length >= 2) { const tipo = partes.pop(); novo = converterTipo(partes.join(' AS '), tipo, null, /^TRY_/i.test(m[1])); }
      else novo = `CAST(${dentro})`;
      novo = novo.replace(/^CAST\(/, 'CAST\u0003(');
      s = s.slice(0, m.index) + novo + s.slice(fe + 1);
    }
    re = /\b(TRY_CONVERT|CONVERT)\s*\(/i;
    while ((m = re.exec(s))) {
      const ab = m.index + m[0].length, fe = fechar(s, ab), args = dividir(trocarCast(s.slice(ab, fe)), ',');
      const novo = args.length >= 2 ? converterTipo(args[1], args[0], args[2], /^TRY_/i.test(m[1])) : `CAST(${args[0]})`;
      s = s.slice(0, m.index) + novo.replace(/^CAST\(/, 'CAST\u0003(') + s.slice(fe + 1);
    }
    return s.replace(/\u0003/g, '');
  }
  function trocarTop(st) {
    const re = /\bSELECT\s+(DISTINCT\s+)?TOP\s*\(?\s*(\d+)\s*\)?(\s+PERCENT)?/i; let m;
    while ((m = re.exec(st))) {
      const i = m.index;
      st = st.slice(0, i) + 'SELECT ' + (m[1] || '') + st.slice(i + m[0].length);
      if (profundidade(st, i) === 0) st = st.replace(/\s*$/, '') + ' LIMIT ' + m[2];
      else { const f = fechar(st, i); st = st.slice(0, f) + ' LIMIT ' + m[2] + st.slice(f); }
    }
    return st;
  }
  function procedures(sql) {
    return sql
      .replace(/^\s*(?:EXEC(?:UTE)?\s+)?sp_columns\s+N?'?([\w.]+)'?\s*;?\s*$/gim, (m, t) => `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM __is_columns WHERE TABLE_NAME = '${t.replace(/^dbo\./i, '')}' ORDER BY ORDINAL_POSITION;`)
      .replace(/^\s*(?:EXEC(?:UTE)?\s+)?sp_help\s+N?'?([\w.]+)'?\s*;?\s*$/gim, (m, t) => `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM __is_columns WHERE TABLE_NAME = '${t.replace(/^dbo\./i, '')}' ORDER BY ORDINAL_POSITION;`)
      .replace(/^\s*(?:EXEC(?:UTE)?\s+)?sp_helptext\s+N?'?([\w.]+)'?\s*;?\s*$/gim, (m, t) => `SELECT VIEW_DEFINITION AS Text FROM __is_views WHERE TABLE_NAME = '${t.replace(/^dbo\./i, '')}';`)
      .replace(/^\s*(?:EXEC(?:UTE)?\s+)?sp_tables\s*;?\s*$/gim, `SELECT TABLE_CATALOG AS TABLE_QUALIFIER, TABLE_SCHEMA AS TABLE_OWNER, TABLE_NAME, TABLE_TYPE FROM __is_tables ORDER BY TABLE_NAME;`);
  }
  function preparar(sql) {
    sql = procedures(String(sql));
    const lits = []; let code = '';
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") { let j = i + 1, s = "'"; while (j < sql.length) { if (sql[j] === "'") { if (sql[j + 1] === "'") { s += "''"; j += 2; continue; } break; } s += sql[j++]; } s += "'"; lits.push(s); code += `\u0001${lits.length - 1}\u0002`; i = j; }
      else if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; code += '\n'; }
      else if (c === '/' && sql[i + 1] === '*') { const f = sql.indexOf('*/', i + 2); i = f < 0 ? sql.length : f + 1; code += ' '; }
      else code += c;
    }
    const lit = s => { lits.push(s); return `\u0001${lits.length - 1}\u0002`; };
    code = code
      .replace(/\bN(?=\u0001)/g, '')
      .replace(/^\s*GO\s*;?\s*$/gim, ';')
      .replace(/^\s*SET\s+(NOCOUNT|XACT_ABORT|ANSI_NULLS|QUOTED_IDENTIFIER)\s+(ON|OFF)\s*;?/gim, ';')
      .replace(/\bdbo\./gi, '')
      .replace(/\bWITH\s*\(\s*NOLOCK\s*\)/gi, '')
      .replace(/\bISNULL\s*\(/gi, 'IFNULL(')
      .replace(/\bCURRENT_TIMESTAMP\b/gi, 'getdate()')
      .replace(/@@DATEFIRST\b/gi, '7')
      .replace(/@@VERSION\b/gi, () => lit("'Microsoft SQL Server 2022 (RTM) - simulado no navegador (SQLito)'"))
      .replace(/@@ROWCOUNT\b/gi, 'changes()')
      .replace(/\b(DATEADD|DATEDIFF|DATEPART|DATENAME|DATETRUNC)\s*\(\s*([A-Za-z]+)\s*,/gi, (m, f, p) => `${f}(${lit(`'${p}'`)},`)
      .replace(/\bOPTION\s*\(\s*(?:(?:MAXRECURSION\s+\d+|RECOMPILE|MAXDOP\s+\d+|OPTIMIZE\s+FOR\s+UNKNOWN)\s*,?\s*)+\)/gi, '')
      .replace(/\bCREATE\s+(UNIQUE\s+)?(?:NON)?CLUSTERED\s+INDEX\b/gi, 'CREATE $1INDEX')
      .replace(/(\bCREATE\s+(?:UNIQUE\s+)?INDEX\b[^;]*?\))\s*INCLUDE\s*\([^)]*\)/gi, '$1')
      .replace(/\bSTRING_AGG\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, 'STRING_AGG($1 ORDER BY $2)')
      .replace(/\bINFORMATION_SCHEMA\s*\.\s*(TABLES|COLUMNS|VIEWS|TABLE_CONSTRAINTS|KEY_COLUMN_USAGE)\b/gi, (m, t) => `__is_${t.toLowerCase()}`)
      .replace(/\bsys\s*\.\s*(tables|columns|indexes|views|objects|schemas)\b/gi, (m, t) => `__sys_${t.toLowerCase()}`)
      .replace(/\bTRUNCATE\s+TABLE\b/gi, 'DELETE FROM')
      .replace(/\bCREATE\s+OR\s+ALTER\s+VIEW\s+([\w.\[\]]+)/gi, 'DROP VIEW IF EXISTS $1; CREATE VIEW $1')
      .replace(/\bFOREIGN\s+KEY\s+REFERENCES\b/gi, 'REFERENCES')
      .replace(/\b(N?VARCHAR|VARBINARY)\s*\(\s*MAX\s*\)/gi, '$1')
      .replace(/\bDEFAULT\s+([A-Za-z_]\w*\s*\([^()]*\))/gi, 'DEFAULT ($1)')
      .replace(/\b(?:BIG|SMALL|TINY)?INT\b(?=\s+(?:NOT\s+NULL\s+)?(?:IDENTITY|PRIMARY\s+KEY))/gi, 'INTEGER')
      .replace(/\bIDENTITY\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?/gi, '')
      .replace(new RegExp(`\\bBEGIN\\s+TRAN(?:SACTION)?\\b(?:[ \\t]+(?!(?:${PALAVRAS})\\b)\\w+)?`, 'gi'), 'BEGIN TRANSACTION')
      .replace(/\bSAVE\s+TRAN(?:SACTION)?\s+(\w+)/gi, 'SAVEPOINT $1')
      .replace(new RegExp(`\\bROLLBACK\\s+TRAN(?:SACTION)?[ \\t]+(?!(?:${PALAVRAS})\\b)(\\w+)`, 'gi'), 'ROLLBACK TO $1')
      .replace(/\bROLLBACK\s+TRAN(?:SACTION)?\b/gi, 'ROLLBACK')
      .replace(new RegExp(`\\bCOMMIT\\s+TRAN(?:SACTION)?\\b(?:[ \\t]+(?!(?:${PALAVRAS})\\b)\\w+)?`, 'gi'), 'COMMIT')
      .replace(/\bOFFSET\s+(\d+)\s+ROWS?\s+FETCH\s+(?:NEXT|FIRST)\s+(\d+)\s+ROWS?\s+ONLY\b/gi, 'LIMIT $2 OFFSET $1')
      .replace(/\bOFFSET\s+(\d+)\s+ROWS?\b/gi, 'LIMIT -1 OFFSET $1');
    code = trocarCast(code);
    code = code.split(';').map(trocarTop).join(';');
    code = inteirar(code);
    return code.replace(/\u0001(\d+)\u0002/g, (m, i) => lits[+i]);
  }
  /* Funções JS sempre devolvem REAL no SQLite (8 vira 8.0 em CAST/concatenação). As que no SQL Server
     devolvem INT ganham CAST(... AS  INTEGER); os dois espaços marcam o embrulho, retirado do nome da coluna. */
  const FN_INT = /\b(len|datalength|charindex|year|month|day|datepart|datediff|patindex|regexp_like|regexp_count|regexp_instr|isnumeric)\s*\(/gi;
  function inteirar(code) {
    let out = '', i = 0, m;
    FN_INT.lastIndex = 0;
    while ((m = FN_INT.exec(code))) {
      const ini = m.index, ant = code[ini - 1] || ' ';
      if (/[\w.@#\[]/.test(ant)) continue;
      let j = ini + m[0].length, d = 1;
      for (; j < code.length && d > 0; j++) { const c = code[j]; if (c === '(') d++; else if (c === ')') d--; else if (c === '[') { const f = code.indexOf(']', j); if (f > j) j = f; } }
      if (d) break;
      const interno = inteirar(code.slice(ini + m[0].length, j - 1));
      out += code.slice(i, ini) + `CAST(${m[1]}(${interno}) AS  INTEGER)`;
      i = j; FN_INT.lastIndex = j;
    }
    return out + code.slice(i);
  }
  const RE_EMBRULHO = /CAST\(((?:(?!CAST\()[\s\S])*?) AS {2}INTEGER\)/g;
  function nomeLimpo(n) { let a; do { a = n; n = n.replace(RE_EMBRULHO, '$1'); } while (n !== a); return n; }

  const ERROS = [
    [/no such column: (.+)/, 'Nome de coluna inválido: $1'], [/no such table: (.+)/, 'Nome de objeto inválido (tabela inexistente): $1'],
    [/near "(.+?)": syntax error/, 'Sintaxe incorreta perto de "$1"'], [/incomplete input/, 'Comando incompleto: falta terminar a instrução'],
    [/no such function: (.+)/, 'Função não reconhecida: $1'], [/ambiguous column name: (.+)/, 'Nome de coluna ambíguo: $1 (use o apelido da tabela)'],
    [/misuse of aggregate/, 'Uso incorreto de função de agregação (use HAVING ou GROUP BY)'], [/cannot rollback - no transaction is active/, 'Não há transação aberta para o ROLLBACK'],
    [/cannot commit - no transaction is active/, 'Não há transação aberta para o COMMIT'], [/UNIQUE constraint failed: (.+)/, 'Violação de chave única/primária em $1'],
    [/NOT NULL constraint failed: (.+)/, 'Não é possível inserir NULL na coluna $1'], [/CHECK constraint failed: (.+)/, 'A instrução entrou em conflito com a restrição CHECK "$1"'], [/CHECK constraint failed/, 'O valor viola uma restrição CHECK'],
    [/FOREIGN KEY constraint failed/, 'Conflito com uma restrição FOREIGN KEY'], [/table (.+) already exists/, 'Já existe um objeto chamado $1 no banco'],
    [/index (.+) already exists/, 'Já existe um índice chamado $1'], [/no such savepoint: (.+)/, 'Ponto de salvamento inexistente: $1'],
    [/sub-select returns (\d+) columns/, 'A subconsulta retorna $1 colunas, mas só uma é esperada'],
    [/SELECTs to the left and right of (UNION|INTERSECT|EXCEPT)(?: ALL)? do not have the same number of result columns/, 'As consultas do $1 precisam ter o mesmo número de colunas'],
  ];
  function traduzirErro(msg) { for (const [re, pt] of ERROS) if (re.test(msg)) return msg.replace(re, pt); return msg; }

  /* Bancos de exercício: cada trilha registra o seu (js/trilhas/<id>.js) */
  const BANCOS = {};
  let atual = null;
  function registrarBanco(id, b) { BANCOS[id] = b; if (!atual) atual = id; }
  function usar(id) { if (!BANCOS[id]) throw new Error('Banco da trilha não carregado: ' + id); atual = id; }
  function novoBanco(SQL, id) {
    const b = BANCOS[id || atual];
    if (!b) throw new Error('Nenhum banco de exercícios carregado.');
    const db = new SQL.Database();
    registrar(db);
    db.exec(b.SEED);
    db.exec(META(b.catalogo));
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  }
  /* =====================================================================
     Interpretador T-SQL do laboratório
     Lê o lote como o SQL Server: instruções com ou sem ponto e vírgula, GO,
     variáveis, IF/WHILE, TRY/CATCH, THROW/RAISERROR, transações aninhadas,
     procedures, functions, triggers DML/DDL, sequências, MERGE, OUTPUT,
     PIVOT/UNPIVOT e ALTER TABLE com constraints. Cada instrução é traduzida
     por preparar() e executada no SQLite.
     ===================================================================== */
  class ErroSQL extends Error {
    constructor(msg, numero, sev, estado) { super(msg); this.numero = numero || 50000; this.sev = sev == null ? 16 : sev; this.estado = estado || 1; }
  }
  class Retorno { constructor(v) { this.v = v; } }
  class RollbackGatilho { }
  const BREAK = { ctrl: 'break' }, CONTINUE = { ctrl: 'continue' };
  const ehControle = e => e === BREAK || e === CONTINUE || e instanceof Retorno || e instanceof RollbackGatilho;
  const NUM_ERRO = [[/UNIQUE constraint failed|Violação de chave/i, 2627], [/NOT NULL constraint failed|inserir NULL/i, 515], [/CHECK constraint failed|restrição CHECK/i, 547],
    [/FOREIGN KEY constraint failed|FOREIGN KEY/i, 547], [/no such table|objeto inválido/i, 208], [/no such column|coluna inválido/i, 207],
    [/syntax error|incomplete input|Sintaxe/i, 102], [/no such function|Função não reconhecida/i, 195], [/divisão por zero/i, 8134]];
  function comoErro(e) {
    if (e instanceof ErroSQL) return e;
    if (ERRO_JS.e && /^(Error|Erro)?\s*$|^Error:?\s*$/i.test((e && e.message) || '')) { const x = ERRO_JS.e; ERRO_JS.e = null; return x instanceof ErroSQL ? x : comoErro(x); }
    const orig = (e && e.message) || String(e), msg = traduzirErro(orig);
    let n = 50000; for (const [re, k] of NUM_ERRO) if (re.test(orig) || re.test(msg)) { n = k; break; }
    return new ErroSQL(msg, n);
  }

  /* ---------- texto: literais e comentários ficam mascarados ---------- */
  function mascarar(sql) {
    const L = []; let c = '';
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === "'") {
        let j = i + 1, s = "'";
        while (j < sql.length) { if (sql[j] === "'") { if (sql[j + 1] === "'") { s += "''"; j += 2; continue; } break; } s += sql[j++]; }
        if (j >= sql.length) throw new ErroSQL('Aspas sem fechamento: falta fechar um texto entre aspas simples.', 105);
        s += "'"; L.push(s); c += `\u0001${L.length - 1}\u0002`; i = j;
      } else if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; c += '\n'; }
      else if (ch === '/' && sql[i + 1] === '*') { const f = sql.indexOf('*/', i + 2); i = f < 0 ? sql.length : f + 1; c += ' '; }
      else c += ch;
    }
    return { c, L };
  }
  const desmascarar = (c, L) => c.replace(/\u0001(\d+)\u0002/g, (m, i) => L[+i]);
  const litTexto = (L, s) => { L.push("'" + String(s).replace(/'/g, "''") + "'"); return `\u0001${L.length - 1}\u0002`; };
  const valorLit = (L, m) => { const s = L[+m.slice(1, -1)]; return s.slice(1, -1).replace(/''/g, "'"); };

  /* ---------- tokens ---------- */
  function tokenizar(c) {
    const T = []; let i = 0, d = 0, novaLinha = true;
    const palavra = /[A-Za-z_#À-ſ]/, cont = /[\w#$À-ſ]/;
    const pontos = k => { while (c[k] === '.' && (palavra.test(c[k + 1] || '') || c[k + 1] === '[' || c[k + 1] === '*' || c[k + 1] === '.')) { k++; if (c[k] === '[') { const f = c.indexOf(']', k); k = f < 0 ? c.length : f + 1; } else if (c[k] === '*') k++; else if (c[k] === '.') continue; else while (k < c.length && cont.test(c[k])) k++; } return k; };
    while (i < c.length) {
      const ch = c[i];
      if (ch === '\n') { novaLinha = true; i++; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      const ini = i;
      if (ch === '\u0001' || ch === '\u0003') { i = c.indexOf(ch === '\u0001' ? '\u0002' : '\u0004', i) + 1; }
      else if (ch === '[') { const f = c.indexOf(']', i); i = pontos(f < 0 ? c.length : f + 1); }
      else if (ch === '@') { let j = i + 1; if (c[j] === '@') j++; while (j < c.length && cont.test(c[j])) j++; i = j; }
      else if (ch === '$' && /^\$action/i.test(c.slice(i, i + 7))) i += 7;
      else if (palavra.test(ch)) { let j = i + 1; while (j < c.length && cont.test(c[j])) j++; i = pontos(j); }
      else if (/\d/.test(ch) || (ch === '.' && /\d/.test(c[i + 1] || ''))) { const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\./.exec(c.slice(i)); i += m ? m[0].length : 1; }
      else { const d2 = c.slice(i, i + 2); i += /^(<>|!=|>=|<=|\+=|-=|\*=|\/=|%=|&=|\|=|\|\||::)$/.test(d2) ? 2 : 1; }
      const v = c.slice(ini, i);
      T.push({ v, u: v.toUpperCase(), i: ini, f: i, d, l: novaLinha });
      if (v === '(') d++; else if (v === ')') d--;
      novaLinha = false;
    }
    for (let k = 0; k < T.length; k++) { const t = T[k], nx = T[k + 1]; t.go = t.u === 'GO' && t.l && (!nx || nx.l || nx.v === ';' || (/^\d+$/.test(nx.v) && (!T[k + 2] || T[k + 2].l))); }
    return T;
  }

  /* ---------- parser de lotes ---------- */
  const INICIO = new Set('SELECT INSERT UPDATE DELETE MERGE DECLARE SET IF WHILE BEGIN COMMIT ROLLBACK SAVE EXEC EXECUTE PRINT THROW RAISERROR RETURN CREATE ALTER DROP TRUNCATE WITH BREAK CONTINUE USE GRANT DENY REVOKE ENABLE DISABLE GO OPEN CLOSE DEALLOCATE WAITFOR'.split(' '));
  const NAO_CTE = /^(NOWAIT|LOG|SETERROR|TIES|ROLLUP|CUBE|CHECK|NOCHECK|SCHEMABINDING|RECOMPILE|ENCRYPTION|EXECUTE|NATIVE_COMPILATION|VALUES)$/;
  function parser(T, c) {
    const texto = (a, f) => (f > a ? c.slice(T[a].i, T[f - 1].f) : '');
    const erro = (k, msg) => new ErroSQL(msg || `Sintaxe incorreta perto de "${T[k] ? T[k].v : 'fim do lote'}".`, 102);
    function fimInstr(p) {
      const base = T[p].d; let tipo = T[p].u, nCase = 0, fonte = false, setV = false, cteMain = false;
      if (tipo === 'CREATE' || tipo === 'ALTER') tipo = T.slice(p + 1, p + 5).some(t => t.u === 'VIEW') ? 'VIEW' : 'DDL';
      for (let k = p + 1; k < T.length; k++) {
        const t = T[k]; if (t.d > base) continue; if (t.d < base) return k;
        const u = t.u;
        if (u === ';') return k;
        if (u === 'CASE') { nCase++; continue; }
        if (u === 'END') { if (nCase) { nCase--; continue; } return k; }
        if (nCase) continue;
        if (u === 'ELSE' || t.go) return k;
        if (tipo === 'VIEW' && u === 'AS') { const nx = T[k + 1] && T[k + 1].u; if (nx === 'SELECT') { tipo = 'SELECT'; k++; } else if (nx === 'WITH') { tipo = 'WITH'; k++; } continue; }
        if (!INICIO.has(u)) { if (u === 'VALUES') fonte = true; continue; }
        if (tipo === 'MERGE') continue;
        if (u === 'ALTER' && T[k - 1].u === 'OR') continue;
        if (/^(GRANT|DENY|REVOKE)$/.test(tipo) && /^(SELECT|INSERT|UPDATE|DELETE|EXECUTE|EXEC|ALTER|CREATE)$/.test(u)) continue;
        const ant = T[k - 1].u, nx = T[k + 1], nx2 = T[k + 2];
        if (u === 'WITH' && !(nx && /^[\w\[À-ſ]/.test(nx.v) && !NAO_CTE.test(nx.u) && nx2 && (nx2.u === 'AS' || nx2.v === '('))) continue;
        if (u === 'SELECT' && /^(UNION|ALL|EXCEPT|INTERSECT)$/.test(ant)) continue;
        if (u === 'IF' && nx && nx.u === 'EXISTS' && /^(TABLE|VIEW|PROC|PROCEDURE|FUNCTION|TRIGGER|SEQUENCE|INDEX|CONSTRAINT|COLUMN|SCHEMA|TYPE|SYNONYM|USER|ROLE|DATABASE)$/.test(ant)) continue;
        if (u === 'UPDATE' && nx && nx.v === '(') continue;
        if ((u === 'DELETE' || u === 'UPDATE') && ant === 'ON') continue;
        if (tipo === 'INSERT' && !fonte && /^(SELECT|EXEC|EXECUTE)$/.test(u)) { fonte = true; continue; }
        if (tipo === 'UPDATE' && u === 'SET' && !setV) { setV = true; continue; }
        if (tipo === 'WITH' && !cteMain && /^(SELECT|INSERT|UPDATE|DELETE|MERGE)$/.test(u)) { cteMain = true; tipo = u; continue; }
        if (tipo === 'DDL' && (/^(SET|WITH|ENABLE|DISABLE)$/.test(u) || (u === 'ALTER' && nx && nx.u === 'COLUMN') || (u === 'DROP' && nx && /^(COLUMN|CONSTRAINT|INDEX|PERIOD)$/.test(nx.u)) || (u === 'CHECK'))) continue;
        if (tipo === 'DECLARE' && u === 'SELECT' && ant === 'FOR') continue;
        return k;
      }
      return T.length;
    }
    function fimCond(p) {
      if (p >= T.length) throw erro(p, 'Condição incompleta.');
      const base = T[p].d;
      for (let k = p; k < T.length; k++) {
        const t = T[k]; if (t.d > base) continue;
        if (t.go || t.v === ';') return k;
        if (INICIO.has(t.u) && !(t.u === 'UPDATE' && T[k + 1] && T[k + 1].v === '(') && !(t.u === 'SELECT' && /^(UNION|ALL)$/.test(T[k - 1].u))) return k;
      }
      return T.length;
    }
    const pularPV = p => { while (T[p] && T[p].v === ';') p++; return p; };
    function exige(p, a, b) { if (!T[p] || T[p].u !== a || !T[p + 1] || T[p + 1].u !== b) throw erro(p, `Era esperado ${a} ${b}.`); }
    function bloco(p, ateEnd) {
      const nos = [];
      for (;;) {
        p = pularPV(p);
        if (p >= T.length) { if (ateEnd) throw erro(p, 'Falta o END que fecha o BEGIN.'); return { nos, p }; }
        if (T[p].u === 'END') { if (ateEnd) return { nos, p }; throw erro(p, 'END sem BEGIN correspondente.'); }
        if (T[p].u === 'ELSE') throw erro(p, 'ELSE sem IF correspondente.');
        const r = instr(p); nos.push(r.no); p = r.p;
      }
    }
    function instr(p) {
      const t = T[p], u = t.u, nx = T[p + 1] ? T[p + 1].u : '';
      if (t.go) { let q = p + 1; if (T[q] && /^\d+$/.test(T[q].v) && !T[q].l) q++; return { no: { t: 'go' }, p: q }; }
      if (u === 'BEGIN') {
        if (nx === 'TRY') {
          const a = bloco(p + 2, true); exige(a.p, 'END', 'TRY'); const q = pularPV(a.p + 2);
          exige(q, 'BEGIN', 'CATCH'); const b = bloco(q + 2, true); exige(b.p, 'END', 'CATCH');
          return { no: { t: 'try', corpo: a.nos, captura: b.nos }, p: b.p + 2 };
        }
        if (/^(TRAN|TRANSACTION|DISTRIBUTED)$/.test(nx)) { const f = fimInstr(p); return { no: { t: 'tran', txt: texto(p, f) }, p: f }; }
        const a = bloco(p + 1, true);
        return { no: { t: 'bloco', corpo: a.nos }, p: a.p + 1 };
      }
      if (u === 'IF' || u === 'WHILE') {
        const fc = fimCond(p + 1); if (fc === p + 1) throw erro(p + 1, `Falta a condição do ${u}.`);
        const q0 = pularPV(fc); if (q0 >= T.length) throw erro(q0, `Falta o comando do ${u}.`);
        const a = instr(q0); let q = a.p, senao = null;
        if (u === 'IF') { const q2 = pularPV(q); if (T[q2] && T[q2].u === 'ELSE') { const b = instr(pularPV(q2 + 1)); senao = b.no; q = b.p; } }
        return { no: { t: u === 'IF' ? 'if' : 'while', cond: texto(p + 1, fc), entao: a.no, senao }, p: q };
      }
      if (u === 'BREAK' || u === 'CONTINUE') return { no: { t: u.toLowerCase() }, p: p + 1 };
      if (u === 'RETURN') {
        const n1 = T[p + 1];
        if (!n1 || n1.v === ';' || n1.u === 'END' || n1.u === 'ELSE' || n1.go || INICIO.has(n1.u)) return { no: { t: 'return', expr: null }, p: p + 1 };
        const f = fimInstr(p); return { no: { t: 'return', expr: texto(p + 1, f) }, p: f };
      }
      if (u === 'CREATE' || u === 'ALTER') {
        let k = p + 1; if (T[k] && T[k].u === 'OR' && T[k + 1] && T[k + 1].u === 'ALTER') k += 2;
        if (T[k] && /^(PROC|PROCEDURE|FUNCTION|TRIGGER)$/.test(T[k].u)) return definicao(p, k);
      }
      if (/^(OPEN|FETCH|CLOSE|DEALLOCATE)$/.test(u)) throw new ErroSQL('Cursores não são suportados no laboratório. Prefira uma solução baseada em conjuntos (UPDATE/INSERT com SELECT) ou um WHILE com variáveis.', 50000);
      const tipos = { DECLARE: 'declare', PRINT: 'print', THROW: 'throw', RAISERROR: 'raiserror', EXEC: 'exec', EXECUTE: 'exec', COMMIT: 'tran', ROLLBACK: 'tran', SAVE: 'tran' };
      let tipo = tipos[u] || 'sql';
      if (u === 'SET' && T[p + 1] && /^@[^@]/.test(T[p + 1].v)) tipo = 'set';
      if (u === 'WAITFOR') tipo = 'nada';
      const f = Math.max(fimInstr(p), p + 1);
      return { no: { t: tipo, txt: texto(p, f) }, p: f };
    }
    function definicao(p, k) {
      const base = T[p].d; let j = k + 1;
      while (j < T.length && !(T[j].d === base && T[j].u === 'AS' && !(T[j - 1] && T[j - 1].v[0] === '@'))) j++;
      if (j >= T.length) throw erro(j, `Falta o AS na definição de ${T[k].u}.`);
      const b = j + 1; let fim;
      const cab = texto(k + 1, j);
      const inline = T[k].u === 'FUNCTION' && /\bRETURNS\s+TABLE\b/i.test(cab);
      if (inline) { fim = b; while (fim < T.length && !(T[fim].d === base && (T[fim].v === ';' || T[fim].go))) fim++; }
      else if (T[b] && T[b].u === 'BEGIN' && !/^(TRAN|TRANSACTION|TRY|DISTRIBUTED)$/.test(T[b + 1] ? T[b + 1].u : '')) fim = instr(b).p;
      else { fim = b; while (fim < T.length && !T[fim].go) fim++; }
      const tipo = T[k].u === 'PROC' ? 'PROCEDURE' : T[k].u;
      return { no: { t: 'def', tipo, alterar: T[p].u === 'ALTER', ouAlterar: k > p + 1, cab, corpo: texto(b, fim), txt: texto(p, fim) }, p: fim };
    }
    return { bloco, fimInstr };
  }
  function compilar(sql) {
    const { c, L } = mascarar(String(sql));
    const T = tokenizar(c);
    return { nos: parser(T, c).bloco(0, false).nos, L };
  }

  /* ---------- utilidades ---------- */
  const semEsquema = n => String(n).trim().replace(/^\[?dbo\]?\./i, '').replace(/^main\./i, '').replace(/^temp\./i, '').replace(/^\[|\]$/g, '').replace(/^"|"$/g, '');
  const chave = n => semEsquema(n).toLowerCase();
  function dividirTopo(s, sep) { // divide no separador fora de parênteses (s mascarado)
    const out = []; let d = 0, ini = 0;
    for (let k = 0; k < s.length; k++) { const ch = s[k]; if (ch === '(') d++; else if (ch === ')') d--; else if (d === 0 && ch === sep) { out.push(s.slice(ini, k)); ini = k + 1; } }
    out.push(s.slice(ini)); return out.map(x => x.trim()).filter(x => x !== '');
  }
  function literalDe(v, tipo) {
    if (v == null) return 'NULL';
    if (typeof v === 'number') return (tipo && /DEC|NUM|FLOAT|REAL|MONEY/i.test(tipo) && Number.isInteger(v)) ? v + '.0' : String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  function coercao(expr, tipo) {
    const t = String(tipo || '').trim().toUpperCase(), base = t.replace(/\s*\(.*$/, '');
    if (!t || base === 'SQL_VARIANT') return expr;
    if (base === 'BIT') return `(CASE WHEN (${expr}) IS NULL THEN NULL WHEN (${expr}) IN ('true','TRUE') THEN 1 WHEN (${expr}) IN ('false','FALSE') THEN 0 WHEN (${expr}) <> 0 THEN 1 ELSE 0 END)`;
    if (/CHAR|TEXT|XML|UNIQUEIDENTIFIER|SYSNAME/.test(base)) {
      const m = t.match(/\(\s*(\d+)\s*\)/); const n = m ? +m[1] : (/MAX/.test(t) || /TEXT|XML|UNIQUEIDENTIFIER|SYSNAME/.test(base) ? 0 : 1);
      return n ? `substr(CAST((${expr}) AS TEXT), 1, ${n})` : `CAST((${expr}) AS TEXT)`;
    }
    if (base === 'MONEY' || base === 'SMALLMONEY') return `ROUND(CAST((${expr}) AS REAL), 4)`;
    return converterTipo(`(${expr})`, tipo);
  }

  /* ---------- contexto de execução ---------- */
  function novoContexto(SQL, db) {
    const ctx = { SQL, db, objs: new Map(), seqs: new Map(), esc: { vars: new Map() }, tran: 0, saves: new Set(), condenada: false, xactAbort: false,
      erro: null, msgs: [], res: [], rowcount: 0, ultimoErro: 0, pilha: [], gat: null, evento: null, disparando: new Set(), emGatilho: 0,
      n: 0, passos: 0, proxId: 5001, desligadas: {}, uq: new Map(), ultimoRet: null };
    const f = (nome, fn) => { const g = protegerFn((...a) => fn(...a)); Object.defineProperty(g, 'length', { value: -1 }); db.create_function(nome, g); };
    f('error_message', () => (ctx.erro ? ctx.erro.message : null));
    f('error_number', () => (ctx.erro ? ctx.erro.numero : null));
    f('error_severity', () => (ctx.erro ? ctx.erro.sev : null));
    f('error_state', () => (ctx.erro ? ctx.erro.estado : null));
    f('error_line', () => (ctx.erro ? 1 : null));
    f('error_procedure', () => (ctx.erro ? ctx.erro.proc || null : null));
    f('xact_state', () => (ctx.tran > 0 ? (ctx.condenada ? -1 : 1) : 0));
    f('__nextval', n => proximoValor(ctx, n));
    f('__div0', () => { throw new Error('Erro de divisão por zero encontrado.'); });
    f('object_id', (n, tp) => objetoId(ctx, n, tp));
    f('object_name', id => objetoNome(ctx, id));
    f('object_definition', id => { const o = [...ctx.objs.values()].find(x => x.id === id); return o ? o.fonte : null; });
    f('eventdata', () => (ctx.evento ? xmlEvento(ctx.evento) : null));
    return ctx;
  }
  const PROFUNDIDADE = 32;
  function empilhar(ctx, nome) { ctx.pilha.push(nome); if (ctx.pilha.length > PROFUNDIDADE) throw new ErroSQL('Nível máximo de aninhamento de procedures, functions ou triggers excedido (limite 32).', 217); }

  /* ---------- execução de nós ---------- */
  function rodar(ctx, sql) { const { nos, L } = compilar(sql); execNos(ctx, nos, L); }
  function execNos(ctx, nos, L) { for (const n of nos) execNo(ctx, n, L); }
  function execNo(ctx, n, L) {
    if (++ctx.passos > 300000) throw new ErroSQL('Execução interrompida: o lote passou do limite de passos do laboratório (laço infinito?).', 50000);
    switch (n.t) {
      case 'go': case 'nada': return;
      case 'sql': execSQL(ctx, n.txt, L, true); return;
      case 'bloco': execNos(ctx, n.corpo, L); return;
      case 'if': if (avaliar(ctx, n.cond, L, true)) execNo(ctx, n.entao, L); else if (n.senao) execNo(ctx, n.senao, L); return;
      case 'while': {
        let g = 0;
        while (avaliar(ctx, n.cond, L, true)) {
          if (++g > 20000) throw new ErroSQL('WHILE interrompido: mais de 20 000 voltas (laço infinito?).', 50000);
          try { execNo(ctx, n.entao, L); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
        }
        return;
      }
      case 'break': throw BREAK;
      case 'continue': throw CONTINUE;
      case 'try': {
        try { execNos(ctx, n.corpo, L); }
        catch (e) {
          if (ehControle(e)) throw e;
          const ant = ctx.erro; ctx.erro = comoErro(e); ctx.ultimoErro = ctx.erro.numero;
          if (ctx.tran > 0 && (ctx.xactAbort || e.doGatilho)) ctx.condenada = true;
          try { execNos(ctx, n.captura, L); } finally { ctx.erro = ant; }
        }
        return;
      }
      case 'return': throw new Retorno(n.expr ? avaliar(ctx, n.expr, L) : null);
      case 'tran': execTran(ctx, n.txt, L); return;
      case 'declare': execDeclare(ctx, n.txt, L); return;
      case 'set': execSet(ctx, n.txt, L); return;
      case 'print': { const v = avaliar(ctx, n.txt.replace(/^\s*PRINT\b/i, ''), L); ctx.msgs.push(v == null ? '' : String(v)); return; }
      case 'throw': execThrow(ctx, n.txt, L); return;
      case 'raiserror': execRaiserror(ctx, n.txt, L); return;
      case 'exec': execExec(ctx, n.txt, L); return;
      case 'def': execDef(ctx, n, L); return;
    }
  }
  function primeiro(r) { const u = r && r[r.length - 1]; return u && u.values && u.values.length ? u.values[0][0] : null; }
  function avaliar(ctx, expr, L, booleano) {
    const e = String(expr).trim(); if (!e) return null;
    const r = execSQL(ctx, booleano ? `SELECT CASE WHEN ${e} THEN 1 ELSE 0 END` : `SELECT ${e}`, L, false);
    return booleano ? primeiro(r) === 1 : primeiro(r);
  }

  /* ---------- variáveis ---------- */
  function lerVar(ctx, nome) { const v = ctx.esc.vars.get(nome.toLowerCase()); if (!v) throw new ErroSQL(`É necessário declarar a variável escalar "${nome}".`, 137); return v; }
  function execDeclare(ctx, txt, L) {
    for (const item of dividirTopo(txt.replace(/^\s*DECLARE\b/i, ''), ',')) {
      const m = /^(@[\w#$]+)\s+(?:AS\s+)?([\s\S]+)$/i.exec(item);
      if (!m) throw new ErroSQL(`Sintaxe incorreta na declaração: ${desmascarar(item, L)}`, 102);
      const nome = m[1], k = nome.toLowerCase(), resto = m[2].trim();
      if (ctx.esc.vars.has(k)) throw new ErroSQL(`O nome da variável "${nome}" já foi declarado.`, 134);
      if (/^TABLE\s*\(/i.test(resto)) {
        const tab = `__tv_${nome.slice(1)}_${++ctx.n}`;
        execSQL(ctx, `CREATE TEMP TABLE ${tab} ${resto.replace(/^TABLE\s*/i, '')}`, L, false);
        ctx.esc.vars.set(k, { nome, tipo: 'TABLE', tabela: tab }); continue;
      }
      if (/^CURSOR\b/i.test(resto)) throw new ErroSQL('Cursores não são suportados no laboratório. Prefira uma solução baseada em conjuntos.', 50000);
      const partes = dividirTopo(resto, '=');
      const tipo = desmascarar(partes[0], L).trim();
      const v = { nome, tipo, v: null };
      ctx.esc.vars.set(k, v);
      if (partes.length > 1) v.v = avaliar(ctx, coercao(resto.slice(resto.indexOf('=') + 1), tipo), L);
    }
  }
  function atribuir(ctx, nome, valor) { const v = lerVar(ctx, nome); if (v.tabela) throw new ErroSQL(`Não é possível atribuir um valor à variável de tabela ${nome}.`, 137); v.v = valor; }
  function execSet(ctx, txt, L) {
    const m = /^\s*SET\s+(@[\w#$]+)\s*([+\-*\/%&|^])?=\s*([\s\S]+)$/i.exec(txt);
    if (!m) throw new ErroSQL(`Sintaxe incorreta no SET: ${desmascarar(txt, L)}`, 102);
    const v = lerVar(ctx, m[1]);
    let expr = m[3];
    if (m[2]) expr = `${m[1]} ${m[2]} (${expr})`;
    v.v = avaliar(ctx, coercao(expr, v.tipo), L);
  }
  function selectComAtribuicao(ctx, s, L) {
    // SELECT @a = expr, @b = expr FROM ...  →  atribui a partir da última linha
    const m = /^\s*SELECT\s+(DISTINCT\s+|TOP\s*\(?\s*\d+\s*\)?\s+)?/i.exec(s); if (!m) return false;
    const corpo = s.slice(m[0].length);
    if (!/^@[\w#$]+\s*([+\-*\/%&|^])?=(?!=)/.test(corpo)) return false;
    const T = tokenizar(corpo); let fim = corpo.length;
    for (const t of T) if (t.d === 0 && /^(FROM|WHERE|GROUP|ORDER|HAVING|UNION|OPTION)$/.test(t.u)) { fim = t.i; break; }
    const itens = dividirTopo(corpo.slice(0, fim), ',');
    const alvos = [], exprs = [];
    for (const it of itens) {
      const a = /^(@[\w#$]+)\s*([+\-*\/%&|^])?=\s*([\s\S]+)$/.exec(it);
      if (!a) throw new ErroSQL('Uma instrução SELECT que atribui valores a variáveis não pode ser combinada com operações de leitura de dados.', 141);
      const v = lerVar(ctx, a[1]); alvos.push(v);
      exprs.push(coercao(a[2] ? `${a[1]} ${a[2]} (${a[3]})` : a[3], v.tipo));
    }
    const r = execSQL(ctx, `SELECT ${m[1] || ''}${exprs.join(', ')} ${corpo.slice(fim)}`, L, false);
    const u = r && r[r.length - 1];
    if (u && u.values.length) { const ult = u.values[u.values.length - 1]; alvos.forEach((v, i) => { v.v = ult[i]; }); ctx.rowcount = u.values.length; }
    else ctx.rowcount = 0;
    return true;
  }

  /* ---------- erros ---------- */
  function argsTopo(s) { const a = s.indexOf('('), f = fechar(s, a + 1); return dividirTopo(s.slice(a + 1, f), ','); }
  function execThrow(ctx, txt, L) {
    const resto = txt.replace(/^\s*THROW\b/i, '').trim();
    if (!resto) { if (!ctx.erro) throw new ErroSQL('Para relançar um erro, o THROW sem parâmetros precisa estar dentro de um bloco CATCH.', 10704); throw ctx.erro; }
    const a = dividirTopo(resto, ',');
    if (a.length !== 3) throw new ErroSQL('THROW precisa de três parâmetros: número, mensagem e estado.', 102);
    const num = avaliar(ctx, a[0], L), msg = avaliar(ctx, a[1], L), est = avaliar(ctx, a[2], L);
    if (!(num >= 50000)) throw new ErroSQL('O número de erro do THROW precisa ser 50000 ou maior.', 35100);
    throw new ErroSQL(String(msg), num, 16, est);
  }
  function formatarMsg(msg, args) {
    let i = 0;
    return String(msg).replace(/%%|%[-+ 0#]*\d*(?:\.\d+)?(?:h|l)?([sdiuxXo])/g, (m, t) => { if (m === '%%') return '%'; const v = args[i++]; if (v == null) return '(null)'; if (t === 'x') return Number(v).toString(16); if (t === 'X') return Number(v).toString(16).toUpperCase(); return /[diu]/.test(t) ? String(Math.trunc(v)) : String(v); });
  }
  function execRaiserror(ctx, txt, L) {
    const sem = txt.replace(/\bWITH\s+(NOWAIT|LOG|SETERROR)(\s*,\s*(NOWAIT|LOG|SETERROR))*\s*$/i, '');
    const a = argsTopo(sem.replace(/^\s*RAISERROR\s*/i, 'X'));
    if (a.length < 3) throw new ErroSQL('RAISERROR precisa de mensagem, severidade e estado.', 102);
    const vals = a.map(x => avaliar(ctx, x, L));
    const msg = formatarMsg(vals[0], vals.slice(3)), sev = vals[1];
    if (sev <= 10) { ctx.msgs.push(msg); return; }
    throw new ErroSQL(msg, typeof vals[0] === 'number' ? vals[0] : 50000, sev, vals[2]);
  }

  /* ---------- transações ---------- */
  function execTran(ctx, txt, L) {
    const s = txt.trim().replace(/\s+/g, ' '), U = s.toUpperCase(), db = ctx.db;
    if (/^BEGIN (DISTRIBUTED )?TRAN/.test(U)) {
      if (ctx.emGatilho) { ctx.tran++; return; }
      if (ctx.tran === 0) db.exec('BEGIN'); ctx.tran++; return;
    }
    if (/^SAVE TRAN/.test(U)) {
      const nome = (s.split(' ')[2] || '').trim();
      if (!ctx.tran && !ctx.emGatilho) throw new ErroSQL('Não é possível usar SAVE TRANSACTION sem uma transação ativa.', 628);
      db.exec(`SAVEPOINT "${nome}"`); ctx.saves.add(nome.toLowerCase()); return;
    }
    if (/^COMMIT/.test(U)) {
      if (ctx.emGatilho) { if (ctx.tran > 0) ctx.tran--; return; }
      if (ctx.tran === 0) throw new ErroSQL('A solicitação COMMIT TRANSACTION não tem uma BEGIN TRANSACTION correspondente.', 3902);
      if (ctx.condenada) throw new ErroSQL('A transação atual não pode ser confirmada (está condenada). Faça ROLLBACK.', 3930);
      ctx.tran--; if (ctx.tran === 0) { db.exec('COMMIT'); ctx.saves.clear(); } return;
    }
    if (/^ROLLBACK/.test(U)) {
      const p = s.split(' '); const nome = /^TRAN/i.test(p[1] || '') ? p[2] : (p[1] && !/^TRAN/i.test(p[1]) ? p[1] : null);
      if (nome && ctx.saves.has(nome.toLowerCase())) { db.exec(`ROLLBACK TO "${nome}"`); return; }
      if (ctx.emGatilho) throw new RollbackGatilho();
      if (ctx.tran === 0) throw new ErroSQL('A solicitação ROLLBACK TRANSACTION não tem uma BEGIN TRANSACTION correspondente.', 3903);
      db.exec('ROLLBACK'); ctx.tran = 0; ctx.saves.clear(); ctx.condenada = false; return;
    }
    throw new ErroSQL(`Comando de transação não reconhecido: ${s}`, 102);
  }
  function protegido(ctx, fn) {
    const sp = '__sp' + (++ctx.n), db = ctx.db;
    db.exec(`SAVEPOINT ${sp}`);
    try { const r = fn(); db.exec(`RELEASE ${sp}`); return r; }
    catch (e) {
      const gatilho = e instanceof RollbackGatilho || e.doGatilho;
      if (ctx.tran > 0 && gatilho && !ctx.emGatilho) { try { db.exec('ROLLBACK'); } catch (_) { /* já desfeita */ } ctx.tran = 0; ctx.saves.clear(); ctx.condenada = false; }
      else { try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch (_) { /* savepoint já liberado */ } }
      if (e instanceof RollbackGatilho && !ctx.emGatilho) throw new ErroSQL('A transação terminou no gatilho. O lote foi anulado.', 3609);
      throw e;
    }
  }

  /* ---------- sequências ---------- */
  const LIMITES = { TINYINT: [0, 255], SMALLINT: [-32768, 32767], INT: [-2147483648, 2147483647], BIGINT: [-9223372036854775808, 9223372036854775807] };
  function opcoesSequencia(s, L, seq) {
    const num = r => { const m = new RegExp(r + '\\s+(-?\\d+(?:\\.\\d+)?)', 'i').exec(s); return m ? Number(m[1]) : null; };
    const v = {};
    const t = /\bAS\s+(\w+)/i.exec(s); if (t) v.tipo = t[1].toUpperCase();
    if ((v.ini = num('START\\s+WITH')) == null) delete v.ini;
    if ((v.inc = num('INCREMENT\\s+BY')) == null) delete v.inc;
    if ((v.min = num('(?<!NO\\s)MINVALUE')) == null) delete v.min;
    if ((v.max = num('(?<!NO\\s)MAXVALUE')) == null) delete v.max;
    if (/\bNO\s+CYCLE\b/i.test(s)) v.ciclo = false; else if (/\bCYCLE\b/i.test(s)) v.ciclo = true;
    const r = /\bRESTART(?:\s+WITH\s+(-?\d+))?/i.exec(s); if (r) v.reinicia = r[1] != null ? Number(r[1]) : true;
    return v;
  }
  function criarSequencia(ctx, s, L) {
    const m = /^\s*CREATE\s+SEQUENCE\s+([\w.\[\]]+)/i.exec(s); const nome = semEsquema(m[1]), k = nome.toLowerCase();
    if (ctx.seqs.has(k) || existeObjeto(ctx, k)) throw new ErroSQL(`Já existe um objeto chamado '${nome}' no banco de dados.`, 2714);
    const o = opcoesSequencia(s, L); const tipo = o.tipo || 'BIGINT'; const lim = LIMITES[tipo] || LIMITES.BIGINT;
    const inc = o.inc == null ? 1 : o.inc; if (inc === 0) throw new ErroSQL('O incremento de uma sequência não pode ser zero.', 11700);
    const min = o.min == null ? lim[0] : o.min, max = o.max == null ? lim[1] : o.max;
    const ini = o.ini == null ? (inc > 0 ? min : max) : o.ini;
    if (ini < min || ini > max) throw new ErroSQL('O valor inicial da sequência precisa estar entre MINVALUE e MAXVALUE.', 11703);
    ctx.seqs.set(k, { nome, id: ctx.proxId++, tipo, ini, inc, min, max, ciclo: !!o.ciclo, atual: null, fonte: s });
  }
  function alterarSequencia(ctx, s, L) {
    const m = /^\s*ALTER\s+SEQUENCE\s+([\w.\[\]]+)/i.exec(s); const q = ctx.seqs.get(chave(m[1]));
    if (!q) throw new ErroSQL(`Não é possível encontrar o objeto de sequência '${semEsquema(m[1])}'.`, 15151);
    const o = opcoesSequencia(s, L);
    if (o.inc != null) q.inc = o.inc; if (o.min != null) q.min = o.min; if (o.max != null) q.max = o.max; if (o.ciclo != null) q.ciclo = o.ciclo;
    if (o.reinicia != null) { if (o.reinicia !== true) q.ini = o.reinicia; q.atual = null; }
  }
  function proximoValor(ctx, nome) {
    const q = ctx.seqs.get(chave(nome)); if (!q) throw new Error(`Nome de objeto inválido: sequência ${nome}`);
    let v = q.atual == null ? q.ini : q.atual + q.inc;
    if (v > q.max || v < q.min) {
      if (!q.ciclo) throw new Error(`O objeto de sequência '${q.nome}' chegou ao valor mínimo ou máximo. Reinicie a sequência para gerar novos valores.`);
      v = q.inc > 0 ? q.min : q.max;
    }
    q.atual = v; return v;
  }

  /* ---------- catálogo de objetos ---------- */
  function existeObjeto(ctx, k) {
    if (ctx.objs.has(k) || ctx.seqs.has(k)) return true;
    const r = ctx.db.exec(`SELECT 1 FROM sqlite_master WHERE lower(name) = '${k.replace(/'/g, "''")}' AND type IN ('table','view')`);
    return !!(r.length && r[0].values.length);
  }
  const TIPOS_OBJ = { PROCEDURE: 'P', FN: 'FN', IF: 'IF', TF: 'TF', TRIGGER: 'TR' };
  function objetoId(ctx, nome, tipo) {
    if (nome == null) return null;
    let n = String(nome).replace(/^tempdb\.\.?/i, '').replace(/^#+/, '__tmp_'); const k = chave(n), tp = tipo ? String(tipo).trim().toUpperCase() : null;
    const o = ctx.objs.get(k); if (o && (!tp || tp === o.tipo || (tp === 'P' && o.tipo === 'P'))) return o.id;
    const q = ctx.seqs.get(k); if (q && (!tp || tp === 'SO')) return q.id;
    for (const r of restricoes(ctx)) if (r.nome.toLowerCase() === k && (!tp || tp === r.sigla)) return r.id;
    for (const esq of ['main', 'temp']) {
      const r = ctx.db.exec(`SELECT 1000 + rowid, type FROM ${esq}.sqlite_master WHERE lower(name) = '${k.replace(/'/g, "''")}' AND type IN ('table','view')`);
      if (r.length && r[0].values.length) { const [id, t] = r[0].values[0]; if (!tp || (tp === 'U' && t === 'table') || (tp === 'V' && t === 'view')) return id; }
    }
    return null;
  }
  function objetoNome(ctx, id) {
    if (id == null) return null;
    for (const o of ctx.objs.values()) if (o.id === id) return o.nome;
    for (const q of ctx.seqs.values()) if (q.id === id) return q.nome;
    for (const r of restricoes(ctx)) if (r.id === id) return r.nome;
    const r = ctx.db.exec(`SELECT name FROM sqlite_master WHERE 1000 + rowid = ${Number(id) || 0}`);
    return r.length && r[0].values.length ? r[0].values[0][0] : null;
  }
  function xmlEvento(ev) {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<EVENT_INSTANCE><EventType>${ev.tipo}</EventType><PostTime>${AGORA.replace(' ', 'T')}</PostTime><SPID>55</SPID><ServerName>MENTA-SQL</ServerName><LoginName>aluno</LoginName><UserName>dbo</UserName><DatabaseName>${esc(ev.banco)}</DatabaseName><SchemaName>dbo</SchemaName><ObjectName>${esc(ev.objeto)}</ObjectName><ObjectType>${ev.tipoObj}</ObjectType><TSQLCommand><CommandText>${esc(ev.comando)}</CommandText></TSQLCommand></EVENT_INSTANCE>`;
  }

  /* Restrições (constraints) lidas do esquema do SQLite + as criadas por ALTER TABLE */
  function itensTabela(sql) {
    const { c, L } = mascarar(sql); const a = c.indexOf('('), f = fechar(c, a + 1);
    return { pre: c.slice(0, a + 1), itens: dividir(c.slice(a + 1, f), ',').map(x => x.trim()), pos: c.slice(f), L };
  }
  const ehRestricaoTabela = it => /^(CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(it);
  const PALAVRAS_COL = /^(CONSTRAINT|DEFAULT|CHECK|REFERENCES|PRIMARY|UNIQUE|NOT|NULL|COLLATE|GENERATED|AS)$/i;
  function clausulasColuna(it) { // divide a definição da coluna em [nome+tipo, cláusula, cláusula...]
    const T = tokenizar(it), cortes = [];
    for (let k = 1; k < T.length; k++) {
      const t = T[k], u = t.u, a1 = T[k - 1].u, a2 = T[k - 2] ? T[k - 2].u : '';
      if (t.d > 0) continue;
      let corta = /^(CONSTRAINT|DEFAULT|CHECK|REFERENCES|PRIMARY|UNIQUE|COLLATE)$/.test(u) || (u === 'NOT' && T[k + 1] && T[k + 1].u === 'NULL') || (u === 'NULL' && !/^(NOT|DEFAULT|SET)$/.test(a1));
      if (corta && u !== 'CONSTRAINT' && a2 === 'CONSTRAINT') corta = false;
      if (corta) cortes.push(t.i);
    }
    const partes = []; let ini = 0; for (const p of cortes) { partes.push(it.slice(ini, p).trim()); ini = p; } partes.push(it.slice(ini).trim());
    return partes.filter(Boolean);
  }
  function restricoes(ctx) {
    const db = ctx.db, out = [], dbx = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
    for (const [tab, oid, sql] of dbx("SELECT name, 1000 + rowid, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'")) {
      const cols = dbx(`SELECT cid + 1, name, pk FROM pragma_table_info('${tab}')`);
      const colId = n => { const c = cols.find(x => x[1].toLowerCase() === String(n).toLowerCase()); return c ? c[0] : 0; };
      const { itens, L } = itensTabela(sql); let nCk = 0;
      const nomeCons = s => { const m = /^CONSTRAINT\s+(\S+)/i.exec(s); return m ? m[1].replace(/^\[|\]$/g, '') : null; };
      const pkCols = cols.filter(c => c[2] > 0).map(c => c[1]);
      if (pkCols.length) { const it = itens.find(x => /PRIMARY\s+KEY/i.test(x)); const nm = it && /CONSTRAINT\s+(\S+)\s+PRIMARY/i.exec(it); out.push({ nome: nm ? nm[1] : 'PK_' + tab, tabela: tab, oid, tipo: 'PRIMARY KEY', sigla: 'PK', coluna: pkCols[0], colId: colId(pkCols[0]) }); }
      for (const it of itens) {
        if (ehRestricaoTabela(it)) {
          const nome = nomeCons(it), corpo = it.replace(/^CONSTRAINT\s+\S+\s+/i, '');
          if (/^CHECK/i.test(corpo)) { nCk++; out.push({ nome: nome || `CK_${tab}_${nCk}`, tabela: tab, oid, tipo: 'CHECK', sigla: 'C', colId: 0, def: desmascarar(corpo.replace(/^CHECK\s*/i, ''), L) }); }
          else if (/^FOREIGN/i.test(corpo)) { const m = /^FOREIGN\s+KEY\s*\(\s*([^)]+)\)\s*REFERENCES\s+([\w\[\]"]+)\s*(?:\(\s*([^)]+)\))?([\s\S]*)$/i.exec(corpo); if (m) out.push(fk(nome || `FK_${tab}_${m[1].trim()}`, tab, oid, m[1].trim(), m[2], m[3], m[4], colId)); }
          else if (/^UNIQUE/i.test(corpo)) { const m = /\(\s*([^)]+)\)/.exec(corpo); out.push({ nome: nome || `UQ_${tab}_${m ? m[1].split(',')[0].trim() : ''}`, tabela: tab, oid, tipo: 'UNIQUE', sigla: 'UQ', colId: 0 }); }
          continue;
        }
        const partes = clausulasColuna(it), col = partes[0].split(/\s+/)[0].replace(/^\[|\]$|^"|"$/g, '');
        for (const p of partes.slice(1)) {
          const nome = nomeCons(p), corpo = p.replace(/^CONSTRAINT\s+\S+\s+/i, '');
          if (/^DEFAULT/i.test(corpo)) out.push({ nome: nome || `DF_${tab}_${col}`, tabela: tab, oid, tipo: 'DEFAULT', sigla: 'D', coluna: col, colId: colId(col), def: '(' + desmascarar(corpo.replace(/^DEFAULT\s*/i, ''), L).replace(/^\((.*)\)$/s, '$1') + ')' });
          else if (/^CHECK/i.test(corpo)) out.push({ nome: nome || `CK_${tab}_${col}`, tabela: tab, oid, tipo: 'CHECK', sigla: 'C', coluna: col, colId: colId(col), def: desmascarar(corpo.replace(/^CHECK\s*/i, ''), L) });
          else if (/^REFERENCES/i.test(corpo)) { const m = /^REFERENCES\s+([\w\[\]"]+)\s*(?:\(\s*([^)]+)\))?([\s\S]*)$/i.exec(corpo); if (m) out.push(fk(nome || `FK_${tab}_${col}`, tab, oid, col, m[1], m[2], m[3], colId)); }
          else if (/^UNIQUE/i.test(corpo)) out.push({ nome: nome || `UQ_${tab}_${col}`, tabela: tab, oid, tipo: 'UNIQUE', sigla: 'UQ', coluna: col, colId: colId(col) });
        }
      }
      for (const [nome, cols2] of ctx.uq) if (cols2.tabela.toLowerCase() === tab.toLowerCase()) out.push({ nome, tabela: tab, oid, tipo: cols2.pk ? 'PRIMARY KEY' : 'UNIQUE', sigla: cols2.pk ? 'PK' : 'UQ', colId: 0 });
      for (const d of ctx.desligadas[tab.toLowerCase()] || []) out.push(Object.assign({}, d.reg, { tabela: tab, oid, desligada: 1 }));
    }
    out.forEach(r => { r.id = 3000 + hashNome(r.nome); });
    return out;
  }
  function hashNome(s) { let h = 0; for (const ch of String(s).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 1000000; return h; }
  function fk(nome, tab, oid, col, ref, refCol, resto, colId) {
    const acao = re => { const m = re.exec(resto || ''); return m ? m[1].toUpperCase().replace(/\s+/g, '_') : 'NO_ACTION'; };
    return { nome, tabela: tab, oid, tipo: 'FOREIGN KEY', sigla: 'F', coluna: col, colId: colId(col), ref: ref.replace(/^\[|\]$|^"|"$/g, ''), refCol: refCol ? refCol.trim() : null, onDelete: acao(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT)/i), onUpdate: acao(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT)/i) };
  }
  function valoresSQL(cols, linhas) {
    const q = v => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
    if (!linhas.length) return `SELECT ${cols.map(c => 'NULL AS ' + c).join(', ')} WHERE 0`;
    return linhas.map((l, i) => 'SELECT ' + l.map((v, j) => q(v) + (i === 0 ? ' AS ' + cols[j] : '')).join(', ')).join(' UNION ALL ');
  }
  function catalogo(ctx, nome) {
    const objs = [...ctx.objs.values()], R = () => restricoes(ctx);
    const tdesc = { P: 'SQL_STORED_PROCEDURE', FN: 'SQL_SCALAR_FUNCTION', IF: 'SQL_INLINE_TABLE_VALUED_FUNCTION', TF: 'SQL_TABLE_VALUED_FUNCTION', TR: 'SQL_TRIGGER' };
    const pid = o => (o.alvo ? objetoId(ctx, o.alvo) : 0);
    switch (nome) {
      case 'procedures': return valoresSQL(['name', 'object_id', 'type', 'type_desc', 'create_date'], objs.filter(o => o.tipo === 'P').map(o => [o.nome, o.id, 'P', tdesc.P, AGORA]));
      case 'triggers': return valoresSQL(['name', 'object_id', 'parent_class_desc', 'parent_id', 'type', 'type_desc', 'is_disabled', 'is_instead_of_trigger', 'create_date'], objs.filter(o => o.tipo === 'TR').map(o => [o.nome, o.id, o.ddl ? 'DATABASE' : 'OBJECT_OR_COLUMN', o.ddl ? 0 : pid(o), 'TR', tdesc.TR, o.off ? 1 : 0, o.instead ? 1 : 0, AGORA]));
      case 'trigger_events': { const l = []; objs.filter(o => o.tipo === 'TR').forEach(o => o.eventos.forEach(e => l.push([o.id, e, o.ddl ? 0 : 1]))); return valoresSQL(['object_id', 'type_desc', 'is_trigger_event'], l); }
      case 'sequences': return valoresSQL(['name', 'object_id', 'type', 'type_desc', 'start_value', 'increment', 'minimum_value', 'maximum_value', 'is_cycling', 'current_value', 'last_used_value'], [...ctx.seqs.values()].map(q => [q.nome, q.id, 'SO', 'SEQUENCE_OBJECT', q.ini, q.inc, q.min, q.max, q.ciclo ? 1 : 0, q.atual == null ? q.ini : q.atual, q.atual]));
      case 'sql_modules': return valoresSQL(['object_id', 'definition'], objs.map(o => [o.id, o.fonte]));
      case 'parameters': { const l = []; objs.forEach(o => (o.params || []).forEach((p, i) => l.push([o.id, p.nome, i + 1, p.tipo, p.saida ? 1 : 0, p.def != null ? 1 : 0]))); return valoresSQL(['object_id', 'name', 'parameter_id', 'type_name', 'is_output', 'has_default_value'], l); }
      case 'check_constraints': return valoresSQL(['name', 'object_id', 'parent_object_id', 'parent_column_id', 'type', 'type_desc', 'definition', 'is_disabled', 'is_not_trusted'], R().filter(r => r.tipo === 'CHECK').map(r => [r.nome, r.id, r.oid, r.colId || 0, 'C', 'CHECK_CONSTRAINT', r.def, r.desligada ? 1 : 0, r.desligada || r.naoConfiavel ? 1 : 0]));
      case 'default_constraints': return valoresSQL(['name', 'object_id', 'parent_object_id', 'parent_column_id', 'type', 'type_desc', 'definition'], R().filter(r => r.tipo === 'DEFAULT').map(r => [r.nome, r.id, r.oid, r.colId, 'D', 'DEFAULT_CONSTRAINT', r.def]));
      case 'foreign_keys': return valoresSQL(['name', 'object_id', 'parent_object_id', 'referenced_object_id', 'type', 'type_desc', 'delete_referential_action_desc', 'update_referential_action_desc', 'is_disabled'], R().filter(r => r.tipo === 'FOREIGN KEY').map(r => [r.nome, r.id, r.oid, objetoId(ctx, r.ref), 'F', 'FOREIGN_KEY_CONSTRAINT', r.onDelete === 'RESTRICT' ? 'NO_ACTION' : r.onDelete, r.onUpdate === 'RESTRICT' ? 'NO_ACTION' : r.onUpdate, r.desligada ? 1 : 0]));
      case 'key_constraints': return valoresSQL(['name', 'object_id', 'parent_object_id', 'type', 'type_desc'], R().filter(r => r.sigla === 'PK' || r.sigla === 'UQ').map(r => [r.nome, r.id, r.oid, r.sigla, r.sigla === 'PK' ? 'PRIMARY_KEY_CONSTRAINT' : 'UNIQUE_CONSTRAINT']));
      case 'objects': {
        const l = objs.map(o => [o.nome, o.id, 1, o.tipo === 'P' ? 'P' : o.tipo, tdesc[o.tipo] || o.tipo, pid(o)]);
        ctx.seqs.forEach(q => l.push([q.nome, q.id, 1, 'SO', 'SEQUENCE_OBJECT', 0]));
        R().forEach(r => l.push([r.nome, r.id, 1, r.sigla, { C: 'CHECK_CONSTRAINT', D: 'DEFAULT_CONSTRAINT', F: 'FOREIGN_KEY_CONSTRAINT', PK: 'PRIMARY_KEY_CONSTRAINT', UQ: 'UNIQUE_CONSTRAINT' }[r.sigla], r.oid]));
        return `SELECT name, object_id, schema_id, type, type_desc, 0 AS parent_object_id FROM __sys_objects UNION ALL ${valoresSQL(['name', 'object_id', 'schema_id', 'type', 'type_desc', 'parent_object_id'], l)}`;
      }
      case 'routines': return valoresSQL(['ROUTINE_CATALOG', 'ROUTINE_SCHEMA', 'ROUTINE_NAME', 'ROUTINE_TYPE', 'DATA_TYPE', 'ROUTINE_DEFINITION'], objs.filter(o => /^(P|FN|IF|TF)$/.test(o.tipo)).map(o => [(BANCOS[atual] || {}).catalogo, 'dbo', o.nome, o.tipo === 'P' ? 'PROCEDURE' : 'FUNCTION', o.tipo === 'FN' ? String(o.retorno).toLowerCase() : o.tipo === 'P' ? null : 'TABLE', o.fonte]));
      case 'is_check_constraints': return valoresSQL(['CONSTRAINT_CATALOG', 'CONSTRAINT_SCHEMA', 'CONSTRAINT_NAME', 'CHECK_CLAUSE'], R().filter(r => r.tipo === 'CHECK').map(r => [(BANCOS[atual] || {}).catalogo, 'dbo', r.nome, r.def]));
      case 'is_referential_constraints': return valoresSQL(['CONSTRAINT_CATALOG', 'CONSTRAINT_SCHEMA', 'CONSTRAINT_NAME', 'UNIQUE_CONSTRAINT_NAME', 'UPDATE_RULE', 'DELETE_RULE'], R().filter(r => r.tipo === 'FOREIGN KEY').map(r => [(BANCOS[atual] || {}).catalogo, 'dbo', r.nome, 'PK_' + r.ref, r.onUpdate.replace('_', ' '), r.onDelete.replace('_', ' ')]));
    }
    return null;
  }

  /* ---------- pipeline de uma instrução ---------- */
  function execSQL(ctx, txt, L, resultado) {
    let s = String(txt).trim().replace(/;\s*$/, '');
    if (!s) return null;
    const X = [], I = raw => { X.push(raw); return `\u0003${X.length - 1}\u0004`; };
    const final = t => preparar(desmascarar(t, L).replace(/\u0003(\d+)\u0004/g, (m, i) => X[+i]));
    const db = ctx.db, U = s.replace(/\s+/g, ' ').toUpperCase();
    let m;

    // comandos de sessão
    if ((m = /^SET XACT_ABORT (ON|OFF)\b/.exec(U))) { ctx.xactAbort = m[1] === 'ON'; return null; }
    if (/^SET (NOCOUNT|ANSI_NULLS|QUOTED_IDENTIFIER|ANSI_WARNINGS|ARITHABORT|DATEFORMAT|LANGUAGE|TRANSACTION ISOLATION LEVEL|LOCK_TIMEOUT|DEADLOCK_PRIORITY|IMPLICIT_TRANSACTIONS|STATISTICS|SHOWPLAN|ROWCOUNT|IDENTITY_INSERT)\b/.test(U)) return null;
    if (/^(GRANT|DENY|REVOKE)\b|^(CREATE|ALTER|DROP)\s+(USER|ROLE|LOGIN)\b|^ALTER\s+ROLE\b/.test(U)) { ctx.msgs.push('Comando de segurança registrado (simulado no laboratório: aqui não há usuários de verdade).'); return null; }
    if (/^USE\b/.test(U) || /^(GRANT|DENY|REVOKE)\b/.test(U)) return null;

    // DDL tratado em JavaScript
    if (/^CREATE SEQUENCE\b/.test(U)) return comDDL(ctx, 'CREATE_SEQUENCE', s, L, () => criarSequencia(ctx, s, L));
    if (/^ALTER SEQUENCE\b/.test(U)) return comDDL(ctx, 'ALTER_SEQUENCE', s, L, () => alterarSequencia(ctx, s, L));
    if ((m = /^DROP (SEQUENCE|PROC|PROCEDURE|FUNCTION|TRIGGER)\b/.exec(U))) return derrubar(ctx, s, L, m[1]);
    if ((m = /^(ENABLE|DISABLE) TRIGGER\b/.exec(U))) return ligarGatilho(ctx, s, L);
    if (/^ALTER TABLE\b/.test(U)) { const r = alterarTabela(ctx, s, L, final); if (r !== false) return r; }

    // SELECT @x = ... (atribuição)
    if (/^SELECT\b/.test(U) && selectComAtribuicao(ctx, s, L)) return null;

    // MERGE e OUTPUT
    if (/^MERGE\b/.test(U)) return execMerge(ctx, s, L, resultado);
    if (/^(INSERT|UPDATE|DELETE)\b/.test(U) && tokenizar(s).some(t => t.d === 0 && t.u === 'OUTPUT')) return execOutput(ctx, s, L, resultado);
    if ((m = /^INSERT\s+(?:INTO\s+)?([\w.\[\]#@]+)\s*(\([^)]*\))?\s*EXEC(?:UTE)?\b([\s\S]*)$/i.exec(s))) return inserirExec(ctx, m, L);

    s = transformar(ctx, s, L, I);

    // SELECT ... INTO nova_tabela
    s = selectInto(s);
    // UPDATE/DELETE com JOIN no estilo SQL Server
    s = dmlComJoin(s);

    // gatilhos
    const dml = alvoDML(s);
    let r;
    const roda = () => rodarFinal(ctx, final(s), resultado, s);
    if (dml && !dml.alvo.startsWith('__')) {
      const io = gatilhosDe(ctx, dml.alvo, dml.acao, true)[0];
      if (io && !ctx.disparando.has(dml.alvo)) r = protegido(ctx, () => insteadOf(ctx, io, dml, s, final));
      else if (temGatilhosAfter(ctx)) r = protegido(ctx, () => { limparCapturas(ctx); const x = roda(); depoisDML(ctx, dml); return x; });
      else r = roda();
    } else if ((m = /^(CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?(?:UNIQUE\s+)?(?:(?:NON)?CLUSTERED\s+)?(TABLE|VIEW|INDEX|SCHEMA)\b/i.exec(s))) {
      const verbo = m[1].toUpperCase() === 'ALTER' || /^CREATE\s+OR\s+ALTER/i.test(s) ? 'ALTER' : m[1].toUpperCase();
      r = comDDL(ctx, `${verbo}_${m[2].toUpperCase()}`, s, L, roda);
      if (verbo === 'DROP' && m[2].toUpperCase() === 'TABLE') removerGatilhosDe(ctx, s);
    } else r = roda();
    return r;
  }
  function rodarFinal(ctx, sql, resultado, mascarado) {
    const db = ctx.db;
    let r;
    try { r = db.exec(sql); }
    catch (e) { throw comoErro(e); }
    const ehSelect = /^\s*(SELECT|WITH|VALUES)\b/i.test(sql) && !/^\s*WITH\b[\s\S]*\b(INSERT|UPDATE|DELETE)\b/i.test(sql);
    r.forEach(x => {
      if (x.columns.some(c => c.includes('AS  INTEGER'))) x.columns = x.columns.map(nomeLimpo);
      for (const row of x.values) for (let c = 0; c < row.length; c++) if (typeof row[c] === 'string' && row[c].includes('AS  INTEGER')) row[c] = nomeLimpo(row[c]);
    });
    if (ehSelect) {
      if (!r.length) { try { const st = db.prepare(sql); const cols = st.getColumnNames(); st.free(); r = [{ columns: cols, values: [] }]; } catch (_) { r = []; } }
      ctx.rowcount = r.length ? r[r.length - 1].values.length : 0;
      if (resultado && r.length) ctx.res.push(r[r.length - 1]);
    } else {
      ctx.rowcount = db.getRowsModified();
      if (resultado && r.length) ctx.res.push(r[r.length - 1]);
    }
    return r;
  }

  /* Transformações de texto (instrução mascarada) */
  function transformar(ctx, s, L, I) {
    // tabelas temporárias #x
    s = s.replace(/(^|[^\w@\u0001\u0002\]])#{1,2}([A-Za-z_À-ſ][\wÀ-ſ]*)/g, '$1__tmp_$2')
      .replace(/\bCREATE\s+TABLE\s+(__tmp_)/gi, 'CREATE TEMP TABLE $1');
    // índice columnstore: vira um índice comum nas colunas informadas (ou em todas)
    s = s.replace(/\bCREATE\s+(?:NON)?CLUSTERED\s+COLUMNSTORE\s+INDEX\s+([\w\[\]]+)\s+ON\s+([\w.\[\]]+)\s*(\([^)]*\))?/gi, (x, nome, tab, cols) => {
      if (!cols) { const t = semEsquema(tab).replace(/[\[\]]/g, ''); const r = ctx.db.exec(`PRAGMA table_info("${t}")`); cols = '(' + (r.length ? r[0].values.map(v => v[1]).join(', ') : 'rowid') + ')'; }
      return `CREATE INDEX ${nome} ON ${tab} ${cols}`;
    });
    // XML do EVENTDATA
    s = s.replace(/(EVENTDATA\s*\(\s*\)|@[\w#$]+)\s*\.\s*value\s*\(/gi, '__xmlvalor($1, ');
    // sequências
    s = s.replace(/\bNEXT\s+VALUE\s+FOR\s+([\w.\[\]]+)(\s+OVER\s*\([^)]*\))?/gi, (x, n) => `__nextval(${litTexto(L, semEsquema(n))})`);
    // UPDATE(coluna) dentro de gatilho
    if (ctx.gat) s = s.replace(/\bUPDATE\s*\(\s*\[?(\w+)\]?\s*\)/gi, (x, c) => (!ctx.gat.cols || ctx.gat.cols.has(c.toLowerCase()) ? '1' : '0'));
    // inserted / deleted dentro de gatilho
    if (ctx.gat) s = s.replace(/(^|[^\w.@#$])(inserted|deleted)\b/gi, (x, a, n) => a + (n.toLowerCase() === 'inserted' ? ctx.gat.ins : ctx.gat.del));
    // IDENT_CURRENT('t') e SCOPE_IDENTITY()
    s = s.replace(/\bIDENT_CURRENT\s*\(\s*(\u0001\d+\u0002)\s*\)/gi, (x, l) => `(SELECT MAX(rowid) FROM ${semEsquema(valorLit(L, l))})`)
      .replace(/\bSCOPE_IDENTITY\s*\(\s*\)/gi, 'last_insert_rowid()')
      .replace(/\b(CURRENT_USER|SESSION_USER|USER)\b(?!\s*\()/g, (x, n) => (n === 'USER' ? x : litTexto(L, 'dbo')))
      .replace(/\bSYSTEM_USER\b(?!\s*\()/gi, () => litTexto(L, 'aluno'));
    // variáveis
    s = s.replace(/@@(\w+)|@([\w#$]+)/g, (x, sis, nome) => {
      if (sis) {
        const k = sis.toUpperCase();
        if (k === 'ROWCOUNT') return String(ctx.rowcount);
        if (k === 'TRANCOUNT') return String(Math.max(ctx.tran, ctx.emGatilho ? 1 : 0));
        if (k === 'ERROR') return String(ctx.ultimoErro || 0);
        if (k === 'IDENTITY') return 'last_insert_rowid()';
        if (k === 'SERVERNAME') return litTexto(L, 'MENTA-SQL');
        if (k === 'SPID') return '55';
        if (k === 'NESTLEVEL') return String(ctx.pilha.length);
        if (k === 'FETCH_STATUS') return '-1';
        if (k === 'PROCID') return String(ctx.procId || 0);
        if (k === 'LANGUAGE') return litTexto(L, 'Português (Brasil)');
        return x;
      }
      const v = lerVar(ctx, '@' + nome);
      if (v.tabela) return v.tabela;
      return typeof v.v === 'string' ? litTexto(L, v.v) : literalDe(v.v, v.tipo);
    });
    // divisão por zero literal
    s = s.replace(/\/\s*0+(?![\d.\w])/g, '/ __div0()');
    // (VALUES ...) AS x (c1, c2)
    s = valoresComColunas(s);
    // funções de tabela
    s = funcoesTabela(ctx, s, L, I);
    // catálogo extra
    s = s.replace(/\bsys\s*\.\s*(procedures|triggers|trigger_events|sequences|sql_modules|parameters|check_constraints|default_constraints|foreign_keys|key_constraints|objects)\b/gi, (x, n) => I(`(${catalogo(ctx, n.toLowerCase())})`))
      .replace(/\bINFORMATION_SCHEMA\s*\.\s*(ROUTINES|CHECK_CONSTRAINTS|REFERENTIAL_CONSTRAINTS)\b/gi, (x, n) => I(`(${catalogo(ctx, n.toUpperCase() === 'ROUTINES' ? 'routines' : 'is_' + n.toLowerCase())})`));
    // PIVOT / UNPIVOT
    s = pivotar(ctx, s, L, I);
    // + entre textos vira ||
    s = concatenacao(s);
    return s;
  }
  function valoresComColunas(s) {
    const re = /\(\s*VALUES\b/gi; let m, out = s, desloc = 0;
    while ((m = re.exec(s))) {
      const a = m.index, f = fechar(s, a + 1);
      const depois = s.slice(f + 1); const al = /^\s*(?:AS\s+)?([\w\[\]]+)\s*\(([^)]*)\)/i.exec(depois);
      if (!al) continue;
      const cols = al[2].split(',').map(x => x.trim());
      const novo = `(SELECT ${cols.map((c, i) => `column${i + 1} AS ${c}`).join(', ')} FROM ${s.slice(a, f + 1)}) AS ${al[1]}`;
      out = out.slice(0, a + desloc) + novo + out.slice(f + 1 + al[0].length + desloc);
      desloc += novo.length - (f + 1 + al[0].length - a);
    }
    return out;
  }
  function funcoesTabela(ctx, s, L, I) {
    s = s.replace(/\bSTRING_SPLIT\s*\(/gi, '__TF_SPLIT(').replace(/\bREGEXP_SPLIT_TO_TABLE\s*\(/gi, '__TF_RSPLIT(').replace(/\bREGEXP_MATCHES\s*\(/gi, '__TF_RMATCH(');
    let m; const re = /\b__TF_(SPLIT|RSPLIT|RMATCH)\(/;
    while ((m = re.exec(s))) {
      const a = m.index + m[0].length, f = fechar(s, a), args = s.slice(a, f), k = m[1];
      const ord = k === 'SPLIT' && dividirTopo(args, ',').length > 2;
      const sub = k === 'RMATCH'
        ? `(SELECT json_extract(value,'$.id') AS match_id, json_extract(value,'$.ini') AS start_position, json_extract(value,'$.fim') AS end_position, json_extract(value,'$.val') AS match_value, json_extract(value,'$.subs') AS substring_matches FROM json_each(__rmatches(${args})))`
        : `(SELECT json_extract(value,'$.v') AS value${k === 'RSPLIT' || ord ? ", json_extract(value,'$.o') AS ordinal" : ''} FROM json_each(${k === 'SPLIT' ? '__split' : '__rsplit'}(${args})))`;
      s = s.slice(0, m.index) + sub + s.slice(f + 1);
    }
    // functions de tabela criadas pelo aluno
    for (const o of ctx.objs.values()) {
      if (o.tipo !== 'IF' && o.tipo !== 'TF') continue;
      const reF = new RegExp(`(?<![\\w.])(?:\\[?dbo\\]?\\.)?\\[?${o.nome}\\]?\\s*\\(`, 'i'); let x;
      while ((x = reF.exec(s))) {
        const a = x.index + x[0].length, f = fechar(s, a);
        const args = dividirTopo(s.slice(a, f), ',');
        const sub = o.tipo === 'IF' ? expandirInline(ctx, o, args, L) : rodarMultiTabela(ctx, o, args, L);
        s = s.slice(0, x.index) + I(sub) + s.slice(f + 1);
      }
    }
    return s;
  }
  function expandirInline(ctx, o, args, L) {
    if (args.length > o.params.length) throw new ErroSQL(`Muitos argumentos para a function ${o.nome}.`, 8144);
    const { c, L: L2 } = mascarar(o.sel);
    const mapa = new Map(o.params.map((p, i) => [p.nome.toLowerCase(), i < args.length && !/^DEFAULT$/i.test(args[i]) ? '(' + desmascarar(args[i], L) + ')' : (p.def != null ? '(' + p.def + ')' : null)]));
    for (const [n, v] of mapa) if (v == null) throw new ErroSQL(`A function ${o.nome} espera o parâmetro '${n}', que não foi informado.`, 313);
    const corpo = c.replace(/@[\w#$]+/g, x => (mapa.has(x.toLowerCase()) ? mapa.get(x.toLowerCase()) : x));
    return `(SELECT * FROM (${desmascarar(corpo, L2)}))`;
  }
  function rodarMultiTabela(ctx, o, args, L) {
    const vals = args.map(a => avaliar(ctx, a, L));
    const tab = `__tf_${o.nome}_${++ctx.n}`;
    ctx.db.exec(preparar(`CREATE TEMP TABLE ${tab} ${o.colsTabela}`));
    const vars = new Map();
    o.params.forEach((p, i) => vars.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, v: i < vals.length ? vals[i] : null }));
    vars.set(o.varTabela.toLowerCase(), { nome: o.varTabela, tipo: 'TABLE', tabela: tab });
    chamarCorpo(ctx, o, vars);
    return tab;
  }
  function concatenacao(s) {
    if (!s.includes('+')) return s;
    const T = tokenizar(s), trocar = [];
    const FT = /^(CAST|CONVERT|TRY_CAST|TRY_CONVERT|CONCAT|CONCAT_WS|LEFT|RIGHT|SUBSTRING|UPPER|LOWER|LTRIM|RTRIM|TRIM|REPLACE|FORMAT|STR|CHAR|NCHAR|REPLICATE|DATENAME|STUFF|QUOTENAME|REVERSE|STRING_AGG|SPACE|TRANSLATE|REGEXP_REPLACE|REGEXP_SUBSTR|DB_NAME|SUSER_SNAME|SUSER_NAME|USER_NAME|HOST_NAME|APP_NAME|OBJECT_NAME|ERROR_MESSAGE|ERROR_PROCEDURE|SCHEMA_NAME|__XMLVALOR)$/;
    const abre = k => { let d = 0; for (let j = k; j >= 0; j--) { if (T[j].v === ')') d++; else if (T[j].v === '(') { d--; if (d === 0) return j; } } return -1; };
    const ehTextoChamada = (ini, fim) => {
      const nome = T[ini - 1] ? T[ini - 1].u : '';
      const dentro = s.slice(T[ini].i, T[fim].f);
      if (/^(CAST|TRY_CAST)$/.test(nome)) return /\bAS\s+N?(VAR)?CHAR\b|\bAS\s+N?TEXT\b|\bAS\s+SYSNAME\b/i.test(dentro);
      if (/^(CONVERT|TRY_CONVERT)$/.test(nome)) return /^\(\s*N?(VAR)?CHAR\b/i.test(dentro);
      if (/^(ISNULL|COALESCE|IIF|NULLIF)$/.test(nome)) return /\u0001\d+\u0002/.test(dentro) && !/\u0001\d+\u0002\s*\)\s*$/.test('') ;
      return FT.test(nome);
    };
    const esquerdaTexto = k => {
      const t = T[k - 1]; if (!t) return false;
      if (t.v[0] === '\u0001') return true;
      if (t.v === ')') { const a = abre(k - 1); return a > 0 && ehTextoChamada(a, k - 1); }
      return false;
    };
    const direitaTexto = k => {
      let t = T[k + 1]; if (!t) return false;
      if (t.u === 'N' && T[k + 2] && T[k + 2].v[0] === '\u0001') return true;
      if (t.v[0] === '\u0001') return true;
      if (T[k + 2] && T[k + 2].v === '(' && (FT.test(t.u) || /^(ISNULL|COALESCE|IIF)$/.test(t.u))) { let d = 0, f = k + 2; for (; f < T.length; f++) { if (T[f].v === '(') d++; else if (T[f].v === ')' && --d === 0) break; } return ehTextoChamada(k + 2, f); }
      return false;
    };
    for (let k = 0; k < T.length; k++) if (T[k].v === '+' && (esquerdaTexto(k) || direitaTexto(k))) trocar.push(T[k].i);
    if (!trocar.length) return s;
    let out = ''; let ini = 0; for (const p of trocar) { out += s.slice(ini, p) + '||'; ini = p + 1; } return out + s.slice(ini);
  }
  function pivotar(ctx, s, L, I) {
    for (let volta = 0; volta < 10; volta++) {
      const T = tokenizar(s); const k = T.findIndex(t => t.u === 'PIVOT' || t.u === 'UNPIVOT'); if (k < 0) return s;
      const base = T[k].d; let f = k - 1;
      while (f >= 0 && !(T[f].d === base && T[f].u === 'FROM')) f--;
      if (f < 0 || T[k + 1].v !== '(') throw new ErroSQL('Sintaxe incorreta no PIVOT: use FROM origem PIVOT (agregação FOR coluna IN (...)) AS apelido.', 102);
      const fonte = s.slice(T[f + 1].i, T[k - 1].f);
      let fe = k + 1, d = 0; for (; fe < T.length; fe++) { if (T[fe].v === '(') d++; else if (T[fe].v === ')' && --d === 0) break; }
      const clausula = s.slice(T[k + 1].i + 1, T[fe].i);
      let q = fe + 1, apelido = 'pvt';
      if (T[q] && T[q].u === 'AS') q++;
      if (T[q] && /^[\w\[À-ſ]/.test(T[q].v) && !/^(WHERE|ORDER|GROUP|JOIN|INNER|LEFT|RIGHT|CROSS|UNION|ON|OPTION)$/.test(T[q].u)) { apelido = T[q].v; q++; }
      const fimTxt = q < T.length ? T[q].i : s.length;
      let cols;
      let prefixo = '';
      if (T[0].u === 'WITH') { const k0 = T.findIndex(t => t.d === 0 && t.u === 'SELECT'); if (k0 > 0) prefixo = s.slice(0, T[k0].i); }
      try { const st = ctx.db.prepare(preparar(desmascarar(`${prefixo}SELECT * FROM ${fonte} LIMIT 0`, L).replace(/\u0003(\d+)\u0004/g, ''))); cols = st.getColumnNames(); st.free(); }
      catch (e) { throw comoErro(e); }
      const lim = n => n.replace(/^\[|\]$/g, '').trim();
      const temCol = (n) => cols.some(c => c.toLowerCase() === lim(n).toLowerCase());
      let novo;
      if (T[k].u === 'PIVOT') {
        const m = /^\s*(\w+)\s*\(\s*([\s\S]+?)\s*\)\s+FOR\s+([\w\[\].]+)\s+IN\s*\(([\s\S]*)\)\s*$/i.exec(clausula);
        if (!m) throw new ErroSQL('Sintaxe incorreta no PIVOT: esperado agregação(coluna) FOR coluna IN ([valor1], [valor2]).', 102);
        const agg = m[1], val = lim(m[2].replace(/^.*\./, '')), piv = lim(m[3].replace(/^.*\./, ''));
        if (!temCol(val)) throw new ErroSQL(`Nome de coluna inválido no PIVOT: ${val}`, 207);
        if (!temCol(piv)) throw new ErroSQL(`Nome de coluna inválido no PIVOT: ${piv}`, 207);
        const vals = dividirTopo(m[4], ',').map(v => lim(v.startsWith('\u0001') ? valorLit(L, v) : v));
        const grp = cols.filter(c => c.toLowerCase() !== val.toLowerCase() && c.toLowerCase() !== piv.toLowerCase()).map(c => `[${c}]`);
        const pv = vals.map(v => `${agg}(CASE WHEN ${/^-?\d+(\.\d+)?$/.test(v) ? `([${piv}] = ${v} OR CAST([${piv}] AS TEXT) = ${litTexto(L, v)})` : `CAST([${piv}] AS TEXT) = ${litTexto(L, v)}`} THEN [${val}] END) AS [${v}]`);
        novo = `(SELECT ${grp.concat(pv).join(', ')} FROM ${fonte}${grp.length ? ' GROUP BY ' + grp.join(', ') : ''}) AS ${apelido}`;
      } else {
        const m = /^\s*([\w\[\]]+)\s+FOR\s+([\w\[\]]+)\s+IN\s*\(([\s\S]*)\)\s*$/i.exec(clausula);
        if (!m) throw new ErroSQL('Sintaxe incorreta no UNPIVOT: esperado valor FOR nome IN ([col1], [col2]).', 102);
        const val = lim(m[1]), nome = lim(m[2]), lista = dividirTopo(m[3], ',').map(lim);
        lista.forEach(c => { if (!temCol(c)) throw new ErroSQL(`Nome de coluna inválido no UNPIVOT: ${c}`, 207); });
        const outros = cols.filter(c => !lista.some(x => x.toLowerCase() === c.toLowerCase())).map(c => `[${c}]`);
        novo = '(' + lista.map(c => `SELECT ${outros.concat([`${litTexto(L, c)} AS [${nome}]`, `[${c}] AS [${val}]`]).join(', ')} FROM ${fonte} WHERE [${c}] IS NOT NULL`).join(' UNION ALL ') + `) AS ${apelido}`;
      }
      s = s.slice(0, T[f + 1].i) + novo + ' ' + s.slice(fimTxt);
    }
    return s;
  }
  function selectInto(s) {
    if (!/^\s*SELECT\b/i.test(s)) return s;
    const T = tokenizar(s); let into = -1, from = -1;
    for (let k = 0; k < T.length; k++) { const t = T[k]; if (t.d !== 0) continue; if (t.u === 'INTO' && into < 0 && from < 0) into = k; if (t.u === 'FROM' && into >= 0) { from = k; break; } if (/^(UNION|EXCEPT|INTERSECT)$/.test(t.u)) break; }
    if (into < 0) return s;
    const nome = T[into + 1].v, temp = /^__tmp_/i.test(nome);
    return `CREATE ${temp ? 'TEMP ' : ''}TABLE ${nome} AS ${s.slice(0, T[into].i)}${s.slice(T[into + 1].f)}`;
  }
  function dmlComJoin(s) {
    let m;
    if ((m = /^\s*UPDATE\s+(?:TOP\s*\(\s*\d+\s*\)\s*)?([\w\[\].]+)\s+SET\b/i.exec(s))) {
      const T = tokenizar(s); let set = -1, from = -1, where = -1, fimW = T.length;
      for (let k = 0; k < T.length; k++) { const t = T[k]; if (t.d) continue; if (t.u === 'SET' && set < 0) set = k; else if (t.u === 'FROM' && from < 0 && set >= 0) from = k; else if (t.u === 'WHERE' && from >= 0 && where < 0) where = k; else if (t.u === 'OPTION' && where >= 0) fimW = k; }
      if (from < 0) return s;
      const alvo = m[1], fimFrom = where >= 0 ? where : fimW;
      const fromTxt = s.slice(T[from + 1].i, T[fimFrom - 1].f);
      const FT = tokenizar(fromTxt); let tabela = null;
      for (let k = 0; k < FT.length; k++) {
        if (FT[k].d || FT[k].u !== alvo.toUpperCase()) continue;
        const ant = FT[k - 1], ant2 = FT[k - 2];
        if (ant && ant.u === 'AS' && ant2) tabela = ant2.v; else if (ant && /^[\w\[]/.test(ant.v) && !/^(JOIN|FROM|ON|AND|OR|APPLY)$/.test(ant.u) && ant.v !== ',') tabela = ant.v; else tabela = FT[k].v;
        break;
      }
      if (!tabela) return s; // alvo fora do FROM: já é a sintaxe aceita pelo SQLite
      const sets = dividirTopo(s.slice(T[set + 1].i, T[from - 1].f), ',').map(x => x.replace(/^\s*[\w\[\]]+\s*\.\s*/, ''));
      const wh = where >= 0 ? s.slice(T[where + 1].i, T[fimW - 1].f) : '1 = 1';
      const sub = expr => `(SELECT ${expr} FROM ${fromTxt} WHERE (${wh}) AND ${alvo}.rowid = __u.rowid LIMIT 1)`;
      const setsNovos = sets.map(it => { const i = it.indexOf('='); return `${it.slice(0, i).trim()} = ${sub(it.slice(i + 1).trim())}`; });
      return `UPDATE ${tabela} AS __u SET ${setsNovos.join(', ')} WHERE __u.rowid IN (SELECT ${alvo}.rowid FROM ${fromTxt} WHERE ${wh})`;
    }
    if ((m = /^\s*DELETE\s+(?:TOP\s*\(\s*\d+\s*\)\s*)?(?:FROM\s+)?([\w\[\].]+)\s+FROM\s+([\s\S]+)$/i.exec(s))) {
      const alvo = m[1]; const resto = m[2];
      const FT = tokenizar(resto); let tabela = null, wIdx = -1;
      for (let k = 0; k < FT.length; k++) { if (FT[k].d) continue; if (FT[k].u === 'WHERE') { wIdx = k; break; } }
      const fromTxt = wIdx >= 0 ? resto.slice(0, FT[wIdx].i) : resto, wh = wIdx >= 0 ? resto.slice(FT[wIdx + 1].i) : '1 = 1';
      for (let k = 0; k < FT.length && (wIdx < 0 || k < wIdx); k++) {
        if (FT[k].d || FT[k].u !== alvo.toUpperCase()) continue;
        const ant = FT[k - 1], ant2 = FT[k - 2];
        if (ant && ant.u === 'AS' && ant2) tabela = ant2.v; else if (ant && /^[\w\[]/.test(ant.v) && !/^(JOIN|FROM|ON|AND|OR)$/.test(ant.u)) tabela = ant.v; else tabela = FT[k].v;
        break;
      }
      if (!tabela) tabela = alvo;
      return `DELETE FROM ${tabela} WHERE rowid IN (SELECT ${alvo}.rowid FROM ${fromTxt} WHERE ${wh})`;
    }
    return s;
  }
  function alvoDML(s) {
    let m;
    if ((m = /^\s*INSERT\s+(?:INTO\s+)?([\w.\[\]"]+)/i.exec(s))) return { acao: 'INSERT', alvo: chave(m[1]) };
    if ((m = /^\s*UPDATE\s+([\w.\[\]"]+)(?:\s+AS\s+\w+)?\s+SET\s+([\s\S]*)$/i.exec(s))) {
      const T = tokenizar(m[2]); let fim = m[2].length; for (const t of T) if (t.d === 0 && /^(WHERE|FROM|OUTPUT|OPTION|RETURNING)$/.test(t.u)) { fim = t.i; break; }
      const cols = new Set(dividirTopo(m[2].slice(0, fim), ',').map(it => it.split('=')[0].trim().replace(/^.*\./, '').replace(/^\[|\]$/g, '').toLowerCase()));
      return { acao: 'UPDATE', alvo: chave(m[1]), cols };
    }
    if ((m = /^\s*DELETE\s+(?:FROM\s+)?([\w.\[\]"]+)/i.exec(s))) return { acao: 'DELETE', alvo: chave(m[1]) };
    return null;
  }

  /* ---------- gatilhos DML ---------- */
  const temGatilhosAfter = ctx => [...ctx.objs.values()].some(o => o.tipo === 'TR' && !o.ddl && !o.instead);
  function gatilhosDe(ctx, tabela, acao, instead) {
    return [...ctx.objs.values()].filter(o => o.tipo === 'TR' && !o.ddl && !o.off && !!o.instead === !!instead && o.alvo === tabela && o.eventos.includes(acao))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.id - b.id);
  }
  function colunasDe(ctx, tab) { const r = ctx.db.exec(`SELECT name FROM pragma_table_info('${tab.replace(/'/g, "''")}')`); return r.length ? r[0].values.map(v => v[0]) : []; }
  function garantirCaptura(ctx, tab) {
    const db = ctx.db, cols = colunasDe(ctx, tab); if (!cols.length) return;
    const ci = `__ci_${tab}`, cd = `__cd_${tab}`;
    const atuais = (() => { const r = db.exec(`SELECT COUNT(*) FROM temp.pragma_table_info('${ci}')`); return r.length ? r[0].values[0][0] : 0; })();
    if (atuais === cols.length) return;
    const lista = cols.map(c => `"${c}"`).join(', ');
    db.exec(`DROP TRIGGER IF EXISTS temp."__ti_${tab}"; DROP TRIGGER IF EXISTS temp."__td_${tab}"; DROP TRIGGER IF EXISTS temp."__tu_${tab}";
      DROP TABLE IF EXISTS temp."${ci}"; DROP TABLE IF EXISTS temp."${cd}";
      CREATE TEMP TABLE "${ci}" AS SELECT ${lista} FROM main."${tab}" WHERE 0;
      CREATE TEMP TABLE "${cd}" AS SELECT ${lista} FROM main."${tab}" WHERE 0;
      CREATE TEMP TRIGGER "__ti_${tab}" AFTER INSERT ON main."${tab}" BEGIN INSERT INTO "${ci}" VALUES (${cols.map(c => `NEW."${c}"`).join(', ')}); END;
      CREATE TEMP TRIGGER "__td_${tab}" AFTER DELETE ON main."${tab}" BEGIN INSERT INTO "${cd}" VALUES (${cols.map(c => `OLD."${c}"`).join(', ')}); END;
      CREATE TEMP TRIGGER "__tu_${tab}" AFTER UPDATE ON main."${tab}" BEGIN INSERT INTO "${cd}" VALUES (${cols.map(c => `OLD."${c}"`).join(', ')}); INSERT INTO "${ci}" VALUES (${cols.map(c => `NEW."${c}"`).join(', ')}); END;`);
  }
  function tabelasComAfter(ctx) { return [...new Set([...ctx.objs.values()].filter(o => o.tipo === 'TR' && !o.ddl && !o.instead).map(o => o.alvo))]; }
  function limparCapturas(ctx) { for (const t of tabelasComAfter(ctx)) { garantirCaptura(ctx, t); ctx.db.exec(`DELETE FROM temp."__ci_${t}"; DELETE FROM temp."__cd_${t}";`); } }
  function contar(ctx, t) { return ctx.db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]; }
  function depoisDML(ctx, dml) {
    const lotes = [];
    for (const t of tabelasComAfter(ctx)) {
      const ci = `temp."__ci_${t}"`, cd = `temp."__cd_${t}"`;
      const ni = contar(ctx, ci), nd = contar(ctx, cd);
      let ev = null;
      if (t === dml.alvo) ev = dml.acao; else if (ni && nd) ev = 'UPDATE'; else if (ni) ev = 'INSERT'; else if (nd) ev = 'DELETE';
      if (!ev) continue;
      if (ctx.disparando.has(t)) { ctx.db.exec(`DELETE FROM ${ci}; DELETE FROM ${cd};`); continue; }
      const k = ++ctx.n;
      ctx.db.exec(`CREATE TEMP TABLE __ins${k} AS SELECT * FROM ${ci}; CREATE TEMP TABLE __del${k} AS SELECT * FROM ${cd}; DELETE FROM ${ci}; DELETE FROM ${cd};`);
      lotes.push({ t, ev, k, cols: t === dml.alvo && ev === 'UPDATE' ? dml.cols : null });
    }
    for (const lt of lotes) {
      for (const g of gatilhosDe(ctx, lt.t, lt.ev, false)) rodarGatilho(ctx, g, { ins: `__ins${lt.k}`, del: `__del${lt.k}`, cols: lt.cols });
      ctx.db.exec(`DROP TABLE IF EXISTS __ins${lt.k}; DROP TABLE IF EXISTS __del${lt.k};`);
    }
  }
  function rodarGatilho(ctx, g, dados) {
    empilhar(ctx, g.nome);
    const escAnt = ctx.esc, gatAnt = ctx.gat, procAnt = ctx.procId, rcAnt = ctx.rowcount;
    ctx.esc = { vars: new Map() }; ctx.gat = dados.ins ? dados : null; ctx.procId = g.id;
    const marca = g.alvo || '#ddl'; ctx.disparando.add(marca); ctx.emGatilho++;
    try { execNos(ctx, g.nos, g.L); }
    catch (e) { if (!(e instanceof Retorno)) { if (!(e instanceof RollbackGatilho) && typeof e === 'object') { e.doGatilho = true; if (!e.proc) e.proc = g.nome; } throw e; } }
    finally { ctx.esc = escAnt; ctx.gat = gatAnt; ctx.procId = procAnt; ctx.disparando.delete(marca); ctx.emGatilho--; ctx.pilha.pop(); ctx.rowcount = rcAnt; }
  }
  function insteadOf(ctx, g, dml, s, final) {
    const db = ctx.db, t = dml.alvo, k = ++ctx.n, ins = `__ins${k}`, del = `__del${k}`;
    db.exec(`CREATE TEMP TABLE ${ins} AS SELECT * FROM main."${t}" WHERE 0; CREATE TEMP TABLE ${del} AS SELECT * FROM main."${t}" WHERE 0;`);
    let m;
    try {
      if (dml.acao === 'INSERT') db.exec(final(s.replace(/^(\s*INSERT\s+(?:INTO\s+)?)([\w.\[\]"]+)/i, `$1${ins}`)));
      else if (dml.acao === 'DELETE') { m = /^\s*DELETE\s+(?:FROM\s+)?([\w.\[\]"]+)([\s\S]*)$/i.exec(s); db.exec(final(`INSERT INTO ${del} SELECT * FROM main."${t}" ${m[2]}`)); }
      else {
        m = /^\s*UPDATE\s+([\w.\[\]"]+)\s+SET\s+([\s\S]*)$/i.exec(s);
        const T = tokenizar(m[2]); let w = m[2].length; for (const x of T) if (x.d === 0 && x.u === 'WHERE') { w = x.i; break; }
        db.exec(final(`INSERT INTO ${del} SELECT * FROM main."${t}" ${m[2].slice(w)}`));
        db.exec(`INSERT INTO ${ins} SELECT * FROM ${del}`);
        db.exec(final(`UPDATE ${ins} SET ${m[2].slice(0, w)}`));
      }
    } catch (e) { throw comoErro(e); }
    ctx.rowcount = Math.max(contar(ctx, ins), contar(ctx, del));
    const rc = ctx.rowcount;
    rodarGatilho(ctx, g, { ins, del, cols: dml.cols || null });
    db.exec(`DROP TABLE IF EXISTS ${ins}; DROP TABLE IF EXISTS ${del};`);
    ctx.rowcount = rc;
    return [];
  }
  function removerGatilhosDe(ctx, s) {
    const m = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w.\[\]"]+)/i.exec(s); if (!m) return;
    for (const n of dividirTopo(s.replace(/^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?/i, ''), ',').map(chave)) for (const [k, o] of ctx.objs) if (o.tipo === 'TR' && o.alvo === n) ctx.objs.delete(k);
  }

  /* ---------- gatilhos DDL ---------- */
  const GRUPOS = {
    DDL_TABLE_EVENTS: /^(CREATE|ALTER|DROP)_TABLE$/, DDL_VIEW_EVENTS: /^(CREATE|ALTER|DROP)_VIEW$/, DDL_INDEX_EVENTS: /^(CREATE|ALTER|DROP)_INDEX$/,
    DDL_PROCEDURE_EVENTS: /^(CREATE|ALTER|DROP)_PROCEDURE$/, DDL_FUNCTION_EVENTS: /^(CREATE|ALTER|DROP)_FUNCTION$/, DDL_TRIGGER_EVENTS: /^(CREATE|ALTER|DROP)_TRIGGER$/,
    DDL_SEQUENCE_EVENTS: /^(CREATE|ALTER|DROP)_SEQUENCE$/, DDL_TABLE_VIEW_EVENTS: /^(CREATE|ALTER|DROP)_(TABLE|VIEW|INDEX)$/, DDL_DATABASE_LEVEL_EVENTS: /./, DDL_EVENTS: /./,
  };
  function comDDL(ctx, evento, s, L, fn) {
    const gs = [...ctx.objs.values()].filter(o => o.tipo === 'TR' && o.ddl && !o.off && o.eventos.some(e => e === evento || (GRUPOS[e] && GRUPOS[e].test(evento))));
    if (!gs.length || ctx.disparando.has('#ddl')) { fn(); return null; }
    const tipoObj = evento.replace(/^(CREATE|ALTER|DROP)_/, '');
    const nm = /^\s*(?:CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?(?:UNIQUE\s+)?(?:(?:NON)?CLUSTERED\s+)?\w+\s+(?:IF\s+EXISTS\s+)?([\w.\[\]#]+)/i.exec(s);
    const ev = { tipo: evento, tipoObj, objeto: nm ? semEsquema(nm[1]) : '', comando: desmascarar(s, L).trim(), banco: (BANCOS[atual] || {}).catalogo || 'SQLito' };
    return protegido(ctx, () => {
      fn();
      const ant = ctx.evento; ctx.evento = ev;
      try { for (const g of gs) rodarGatilho(ctx, g, {}); } finally { ctx.evento = ant; }
      return null;
    });
  }

  /* ---------- definições: procedures, functions e triggers ---------- */
  function lerParams(txt, L) {
    let t = txt.trim();
    if (t.startsWith('(')) { const f = fechar(t, 1); t = t.slice(1, f); }
    return dividirTopo(t, ',').map(it => {
      const m = /^(@[\w#$]+)\s+(?:AS\s+)?([\s\S]+)$/i.exec(it);
      if (!m) throw new ErroSQL(`Parâmetro inválido: ${desmascarar(it, L)}`, 102);
      let resto = m[2].trim(), saida = false, so = false;
      if (/\bREADONLY\s*$/i.test(resto)) { so = true; resto = resto.replace(/\bREADONLY\s*$/i, '').trim(); }
      if (/\bOUT(PUT)?\s*$/i.test(resto)) { saida = true; resto = resto.replace(/\bOUT(PUT)?\s*$/i, '').trim(); }
      const p = dividirTopo(resto, '=');
      return { nome: m[1], tipo: desmascarar(p[0], L).trim(), def: p.length > 1 ? desmascarar(resto.slice(resto.indexOf('=') + 1), L).trim() : null, saida, so };
    });
  }
  function execDef(ctx, n, L) {
    const cabM = n.cab, fonte = desmascarar(n.txt, L).trim().replace(/^ALTER\b/i, 'CREATE').replace(/^CREATE\s+OR\s+ALTER\b/i, 'CREATE');
    const nm = /^\s*([\w.\[\]]+)/.exec(cabM); const nome = semEsquema(nm[1]), k = nome.toLowerCase();
    const resto = cabM.slice(nm[0].length);
    const existe = ctx.objs.get(k);
    if (!n.alterar && !n.ouAlterar && (existe || existeObjeto(ctx, k))) throw new ErroSQL(`Já existe um objeto chamado '${nome}' no banco de dados.`, 2714);
    if (n.alterar && !existe) throw new ErroSQL(`Nome de objeto '${nome}' inválido.`, 208);
    const o = { nome, id: existe ? existe.id : ctx.proxId++, fonte };
    const corpo = desmascarar(n.corpo, L);
    if (n.tipo === 'PROCEDURE') {
      o.tipo = 'P'; o.params = lerParams(resto.replace(/\bWITH\s+(RECOMPILE|ENCRYPTION|EXECUTE\s+AS\s+\S+)(\s*,\s*(RECOMPILE|ENCRYPTION|EXECUTE\s+AS\s+\S+))*\s*$/i, ''), L);
      Object.assign(o, compilar(corpo));
    } else if (n.tipo === 'FUNCTION') {
      const a = resto.indexOf('('); const f = fechar(resto, a + 1);
      o.params = lerParams(resto.slice(a + 1, f), L);
      const ret = resto.slice(f + 1).replace(/^\s*RETURNS\s+/i, '').replace(/\bWITH\s+[\w\s,]+$/i, '').trim();
      if (/^TABLE\b/i.test(ret)) { o.tipo = 'IF'; o.sel = corpo.trim().replace(/^RETURN\b/i, '').trim().replace(/;\s*$/, ''); if (/^\(/.test(o.sel) && fechar(o.sel, 1) === o.sel.length - 1) o.sel = o.sel.slice(1, -1); }
      else if (/^@/.test(ret)) { const mm = /^(@[\w#$]+)\s+TABLE\s*([\s\S]+)$/i.exec(ret); o.tipo = 'TF'; o.varTabela = mm[1]; o.colsTabela = desmascarar(mm[2], L); Object.assign(o, compilar(corpo)); }
      else { o.tipo = 'FN'; o.retorno = desmascarar(ret, L); Object.assign(o, compilar(corpo)); registrarFuncao(ctx, o); }
    } else {
      o.tipo = 'TR';
      const mm = /^\s*ON\s+(ALL\s+SERVER|DATABASE|[\w.\[\]"]+)\s*(?:WITH\s+[\w\s,]+?\s+)?(FOR|AFTER|INSTEAD\s+OF)\s+([\s\S]+?)\s*(?:NOT\s+FOR\s+REPLICATION)?\s*$/i.exec(resto);
      if (!mm) throw new ErroSQL('Sintaxe incorreta no CREATE TRIGGER: use ON tabela AFTER INSERT, UPDATE, DELETE AS ...', 102);
      o.ddl = /^(ALL\s+SERVER|DATABASE)$/i.test(mm[1]);
      o.instead = /^INSTEAD/i.test(mm[2]);
      o.eventos = mm[3].split(',').map(e => e.trim().toUpperCase());
      if (o.ddl) { if (o.eventos.some(e => e === 'LOGON')) o.logon = true; }
      else {
        o.alvo = chave(mm[1]);
        const r = ctx.db.exec(`SELECT type FROM sqlite_master WHERE lower(name) = '${o.alvo.replace(/'/g, "''")}' AND type IN ('table','view')`);
        if (!r.length || !r[0].values.length) throw new ErroSQL(`O objeto '${semEsquema(mm[1])}' não existe ou não é válido para esta operação.`, 8197);
        if (r[0].values[0][0] === 'view' && !o.instead) throw new ErroSQL(`'${semEsquema(mm[1])}' é uma view: views só aceitam gatilhos INSTEAD OF.`, 8197);
        if (o.eventos.some(e => !/^(INSERT|UPDATE|DELETE)$/.test(e))) throw new ErroSQL('Gatilhos DML aceitam apenas INSERT, UPDATE e DELETE.', 102);
        if (o.instead && [...ctx.objs.values()].some(x => x !== existe && x.tipo === 'TR' && x.instead && x.alvo === o.alvo && x.eventos.some(e => o.eventos.includes(e)))) throw new ErroSQL('Só pode existir um gatilho INSTEAD OF por ação em cada tabela ou view.', 2111);
      }
      if (existe) { o.off = existe.off; o.ordem = existe.ordem; }
      Object.assign(o, compilar(corpo));
    }
    const verbo = existe ? 'ALTER' : 'CREATE';
    const evento = `${verbo}_${n.tipo}`;
    ctx.objs.set(k, o);
    try { comDDL(ctx, evento, n.txt, L, () => {}); }
    catch (e) { if (existe) ctx.objs.set(k, existe); else ctx.objs.delete(k); throw e; }
    if (o.tipo === 'TR' && !o.ddl && !o.instead) garantirCaptura(ctx, o.alvo);
  }
  function registrarFuncao(ctx, o) {
    const g = protegerFn((...args) => {
      const vars = new Map();
      o.params.forEach((p, i) => vars.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, v: i < args.length ? args[i] : null }));
      if (args.length !== o.params.length) throw new Error(`A function ${o.nome} espera ${o.params.length} argumento(s).`);
      try { const v = chamarCorpo(ctx, o, vars, true); return v === undefined ? null : v; }
      catch (e) { throw comoErro(e); }
    });
    Object.defineProperty(g, 'length', { value: -1 });
    ctx.db.create_function(o.nome.toLowerCase(), g);
  }
  function chamarCorpo(ctx, o, vars, ehFuncao) {
    empilhar(ctx, o.nome);
    const escAnt = ctx.esc, procAnt = ctx.procId; ctx.esc = { vars }; ctx.procId = o.id;
    let ret;
    try { execNos(ctx, o.nos, o.L); if (ehFuncao && o.tipo === 'FN') throw new ErroSQL(`A última instrução da function ${o.nome} precisa ser um RETURN.`, 455); }
    catch (e) {
      if (e instanceof Retorno) ret = e.v;
      else { if (typeof e === 'object' && !(e instanceof RollbackGatilho) && !e.proc && !ehControle(e)) e.proc = o.nome; throw e; }
    } finally { ctx.esc = escAnt; ctx.procId = procAnt; ctx.pilha.pop(); }
    if (ehFuncao && o.tipo === 'FN' && ret != null) {
      const r = ctx.db.exec(`SELECT ${coercao(literalDe(ret), o.retorno)}`); ret = primeiro(r);
    }
    return ret;
  }
  function derrubar(ctx, s, L, tipo) {
    const m = /^\s*DROP\s+\w+\s+(IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+ON\s+(?:DATABASE|ALL\s+SERVER))?\s*$/i.exec(s);
    const t = tipo.toUpperCase() === 'PROC' ? 'PROCEDURE' : tipo.toUpperCase();
    for (const nomeBruto of dividirTopo(m[2], ',')) {
      const k = chave(nomeBruto), nome = semEsquema(nomeBruto);
      const obj = t === 'SEQUENCE' ? ctx.seqs.get(k) : ctx.objs.get(k);
      const certo = obj && (t === 'SEQUENCE' || ({ PROCEDURE: ['P'], FUNCTION: ['FN', 'IF', 'TF'], TRIGGER: ['TR'] }[t] || []).includes(obj.tipo));
      if (!certo) { if (m[1]) continue; throw new ErroSQL(`Não é possível remover ${t === 'PROCEDURE' ? 'a procedure' : t === 'FUNCTION' ? 'a function' : t === 'TRIGGER' ? 'o gatilho' : 'a sequência'} '${nome}' porque não existe ou você não tem permissão.`, 3701); }
      const mapa = t === 'SEQUENCE' ? ctx.seqs : ctx.objs;
      mapa.delete(k);
      try { comDDL(ctx, `DROP_${t}`, s, L, () => {}); } catch (e) { mapa.set(k, obj); throw e; }
    }
    return null;
  }
  function ligarGatilho(ctx, s, L) {
    const m = /^\s*(ENABLE|DISABLE)\s+TRIGGER\s+([\s\S]+?)\s+ON\s+(ALL\s+SERVER|DATABASE|[\w.\[\]"]+)\s*$/i.exec(s);
    if (!m) throw new ErroSQL('Sintaxe: ENABLE|DISABLE TRIGGER nome ON tabela|DATABASE', 102);
    const off = m[1].toUpperCase() === 'DISABLE', ddl = /^(ALL\s+SERVER|DATABASE)$/i.test(m[3]), alvo = ddl ? null : chave(m[3]);
    const nomes = /^ALL$/i.test(m[2].trim()) ? null : dividirTopo(m[2], ',').map(chave);
    let n = 0;
    for (const [k, o] of ctx.objs) if (o.tipo === 'TR' && !!o.ddl === ddl && (ddl || o.alvo === alvo) && (!nomes || nomes.includes(k))) { o.off = off; n++; }
    if (nomes && n < nomes.length) throw new ErroSQL(`Não foi possível encontrar o gatilho '${nomes[0]}'.`, 3701);
    return null;
  }

  /* ---------- EXEC ---------- */
  function execExec(ctx, txt, L) {
    let s = txt.replace(/^\s*EXEC(UTE)?\b\s*/i, '');
    if (s.startsWith('(')) { const f = fechar(s, 1); const sql = avaliar(ctx, s.slice(1, f), L); rodarDinamico(ctx, String(sql == null ? '' : sql), new Map()); return; }
    let ret = null, m;
    if ((m = /^(@[\w#$]+)\s*=\s*/.exec(s))) { ret = m[1]; s = s.slice(m[0].length); }
    m = /^([\w.\[\]#]+)\s*([\s\S]*)$/.exec(s); if (!m) throw new ErroSQL('Sintaxe incorreta no EXEC.', 102);
    const nome = semEsquema(m[1]), k = nome.toLowerCase(), argsTxt = m[2].trim();
    const args = argsTxt ? dividirTopo(argsTxt, ',').map(a => { const x = /^(@[\w#$]+)\s*=\s*([\s\S]+)$/.exec(a); let v = x ? x[2] : a, saida = false; if (/\bOUT(PUT)?\s*$/i.test(v)) { saida = true; v = v.replace(/\bOUT(PUT)?\s*$/i, '').trim(); } return { nome: x ? x[1] : null, v: v.trim(), saida }; }) : [];
    const o = ctx.objs.get(k);
    if (o && o.tipo === 'P') { const r = chamarProc(ctx, o, args, L); if (ret) atribuir(ctx, ret, r); return; }
    if (k === 'sp_executesql') {
      if (!args.length) throw new ErroSQL('sp_executesql precisa do texto da instrução.', 102);
      const sql = String(avaliar(ctx, args[0].v, L) || ''); const vars = new Map(); const saidas = [];
      if (args[1]) {
        const defs = lerParams(String(avaliar(ctx, args[1].v, L) || ''), []);
        defs.forEach((p, i) => {
          const a = args.slice(2).find(x => x.nome && x.nome.toLowerCase() === p.nome.toLowerCase()) || (args[2 + i] && !args[2 + i].nome ? args[2 + i] : null);
          vars.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, v: a ? avaliar(ctx, coercao(a.v, p.tipo), L) : null });
          if (a && a.saida && p.saida) saidas.push([a.v, p.nome]);
        });
      }
      rodarDinamico(ctx, sql, vars);
      saidas.forEach(([destino, p]) => atribuir(ctx, destino, vars.get(p.toLowerCase()).v));
      return;
    }
    if (k === 'sp_sequence_get_range') {
      const pega = n => args.find(a => a.nome && a.nome.toLowerCase() === n);
      const q = ctx.seqs.get(chave(avaliar(ctx, (pega('@sequence_name') || args[0]).v, L)));
      if (!q) throw new ErroSQL('Sequência inexistente.', 15151);
      const tam = avaliar(ctx, (pega('@range_size') || args[1]).v, L);
      const ini = proximoValor(ctx, q.nome); q.atual = ini + (tam - 1) * q.inc;
      const destino = pega('@range_first_value'); if (destino) atribuir(ctx, destino.v, ini);
      return;
    }
    if (k === 'sp_rename') {
      const de = String(avaliar(ctx, args[0].v, L)), para = String(avaliar(ctx, args[1].v, L)), tp = args[2] ? String(avaliar(ctx, args[2].v, L)).toUpperCase() : 'OBJECT';
      if (tp === 'COLUMN') { const [t, c] = semEsquema(de).split('.'); ctx.db.exec(`ALTER TABLE "${t}" RENAME COLUMN "${c}" TO "${para}"`); }
      else ctx.db.exec(`ALTER TABLE "${semEsquema(de)}" RENAME TO "${para}"`);
      ctx.msgs.push('Atenção: alterar qualquer parte do nome de um objeto pode interromper scripts e procedures.');
      return;
    }
    if (k === 'sp_helptext' && args[0]) {
      const alvo = chave(String(avaliar(ctx, args[0].v, L))); const ob = ctx.objs.get(alvo);
      if (ob) { ctx.res.push({ columns: ['Text'], values: ob.fonte.split('\n').map(l => [l]) }); return; }
    }
    if (k === 'sp_settriggerorder') {
      const pega = (n, i) => { const a = args.find(x => x.nome && x.nome.toLowerCase() === n) || args[i]; return a ? String(avaliar(ctx, a.v, L)) : null; };
      const g = ctx.objs.get(chave(pega('@triggername', 0) || '')); if (g) g.ordem = /first/i.test(pega('@order', 1)) ? -1 : /last/i.test(pega('@order', 1)) ? 1 : 0; return;
    }
    if (/^sp_(columns|help|helptext|tables)$/.test(k)) { execSQL(ctx, txt, L, true); return; }
    throw new ErroSQL(`Não foi possível encontrar a procedure '${nome}'.`, 2812);
  }
  function rodarDinamico(ctx, sql, vars) {
    const escAnt = ctx.esc; ctx.esc = { vars };
    try { rodar(ctx, sql); } finally { ctx.esc = escAnt; }
  }
  function chamarProc(ctx, o, args, L) {
    const vars = new Map(), saidas = [];
    if (args.length > o.params.length) throw new ErroSQL(`A procedure ${o.nome} recebeu argumentos demais.`, 8144);
    o.params.forEach((p, i) => {
      const a = args.find(x => x.nome && x.nome.toLowerCase() === p.nome.toLowerCase()) || (args[i] && !args[i].nome ? args[i] : null);
      let v;
      if (a && !/^DEFAULT$/i.test(a.v)) v = avaliar(ctx, coercao(a.v, p.tipo), L);
      else if (p.def != null) v = primeiro(ctx.db.exec(preparar(`SELECT ${coercao(p.def, p.tipo)}`)));
      else throw new ErroSQL(`A procedure '${o.nome}' espera o parâmetro '${p.nome}', que não foi informado.`, 201);
      vars.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, v });
      if (a && a.saida) { if (!p.saida) throw new ErroSQL(`O parâmetro ${p.nome} não foi declarado como OUTPUT na procedure.`, 8162); saidas.push([a.v, p.nome]); }
    });
    args.filter(a => a.nome && !o.params.some(p => p.nome.toLowerCase() === a.nome.toLowerCase())).forEach(a => { throw new ErroSQL(`${a.nome} não é um parâmetro da procedure ${o.nome}.`, 8145); });
    const ret = chamarCorpo(ctx, o, vars);
    saidas.forEach(([destino, p]) => atribuir(ctx, destino, vars.get(p.toLowerCase()).v));
    return ret == null ? 0 : ret;
  }
  function inserirExec(ctx, m, L) {
    const resAnt = ctx.res; ctx.res = []; let obtidos;
    try { execExec(ctx, 'EXEC ' + m[3], L); } finally { obtidos = ctx.res; ctx.res = resAnt; }
    const u = obtidos[obtidos.length - 1]; if (!u || !u.values.length) { ctx.rowcount = 0; return null; }
    const vals = u.values.map(l => '(' + l.map(v => (typeof v === 'string' ? litTexto(L, v) : literalDe(v))).join(', ') + ')').join(', ');
    return execSQL(ctx, `INSERT INTO ${m[1]} ${m[2] || ''} VALUES ${vals}`, L, false);
  }

  /* ---------- OUTPUT e MERGE ---------- */
  function expandirOutput(lista, cols) {
    return dividirTopo(lista, ',').map(it => {
      const m = /^(inserted|deleted)\s*\.\s*\*$/i.exec(it.trim());
      if (m) { const a = m[1].toLowerCase() === 'inserted' ? '__i' : '__d'; return cols.map(c => `${a}."${c}" AS "${c}"`).join(', '); }
      return it.replace(/(^|[^\w.])inserted\s*\.\s*/gi, '$1__i.').replace(/(^|[^\w.])deleted\s*\.\s*/gi, '$1__d.').replace(/\$action/gi, '__o.acao');
    }).join(', ');
  }
  function separarOutput(clausula) {
    const T = tokenizar(clausula); const k = T.findIndex(t => t.d === 0 && t.u === 'INTO');
    if (k < 0) return { lista: clausula, destino: null };
    return { lista: clausula.slice(0, T[k].i), destino: clausula.slice(T[k + 1].i) };
  }
  function entregarOutput(ctx, tab, linhas, out, L, resultado) {
    const db = ctx.db, cols = colunasDe(ctx, tab), k = ++ctx.n;
    db.exec(`CREATE TEMP TABLE __o${k} (acao TEXT, irid INTEGER, drid INTEGER)`);
    for (const l of linhas) db.run(`INSERT INTO __o${k} VALUES (?, ?, ?)`, [l[0], l[1], l[2]]);
    const { lista, destino } = separarOutput(out.clausula);
    const sel = `SELECT ${expandirOutput(lista, cols)} FROM __o${k} AS __o LEFT JOIN main."${tab}" AS __i ON __i.rowid = __o.irid LEFT JOIN ${out.velha} AS __d ON __d.__rid = __o.drid`;
    let r;
    if (destino) { execSQL(ctx, `INSERT INTO ${destino} ${sel}`, L, false); r = null; }
    else r = execSQL(ctx, sel, L, resultado);
    db.exec(`DROP TABLE IF EXISTS __o${k}; DROP TABLE IF EXISTS ${out.velha};`);
    return r;
  }
  function fotografar(ctx, tab) { const k = ++ctx.n, nome = `__velha${k}`; ctx.db.exec(`CREATE TEMP TABLE ${nome} AS SELECT rowid AS __rid, * FROM main."${tab}"`); return nome; }
  function rowidsDe(r) { const u = r && r[r.length - 1]; return u ? u.values.map(v => v[0]) : []; }
  function execOutput(ctx, s, L, resultado) {
    const T = tokenizar(s); const k = T.findIndex(t => t.d === 0 && t.u === 'OUTPUT');
    const U0 = T[0].u; let fim = T.length;
    const fins = U0 === 'INSERT' ? /^(VALUES|SELECT|DEFAULT|EXEC|EXECUTE|WITH)$/ : /^(WHERE|FROM|OPTION)$/;
    for (let j = k + 1; j < T.length; j++) if (T[j].d === 0 && fins.test(T[j].u)) { fim = j; break; }
    const clausula = s.slice(T[k + 1].i, fim < T.length ? T[fim].i : s.length);
    const base = (s.slice(0, T[k].i) + ' ' + (fim < T.length ? s.slice(T[fim].i) : '')).trim();
    const dml = alvoDML(dmlComJoin(base));
    const tab = dml.alvo;
    const velha = fotografar(ctx, tab);
    const r = execSQL(ctx, base + ' RETURNING rowid', L, false);
    const ids = rowidsDe(r), acao = dml.acao;
    const linhas = ids.map(id => [acao, acao === 'DELETE' ? null : id, acao === 'INSERT' ? null : id]);
    const rc = ids.length;
    const res = entregarOutput(ctx, tab, linhas, { clausula, velha }, L, resultado);
    ctx.rowcount = rc;
    return res;
  }
  function execMerge(ctx, s, L, resultado) {
    const T = tokenizar(s); let p = 1;
    if (T[p] && T[p].u === 'TOP') { p++; if (T[p].v === '(') { let d = 0; for (; p < T.length; p++) { if (T[p].v === '(') d++; else if (T[p].v === ')' && --d === 0) { p++; break; } } } }
    if (T[p] && T[p].u === 'INTO') p++;
    const alvoTxt = T[p].v, tab = chave(alvoTxt); p++;
    if (T[p] && T[p].u === 'WITH' && T[p + 1] && T[p + 1].v === '(') { let d = 0; for (; p < T.length; p++) { if (T[p].v === '(') d++; else if (T[p].v === ')' && --d === 0) { p++; break; } } }
    let ta = semEsquema(alvoTxt);
    if (T[p] && T[p].u === 'AS') p++;
    if (T[p] && T[p].u !== 'USING') { ta = T[p].v; p++; }
    if (!T[p] || T[p].u !== 'USING') throw new ErroSQL('Sintaxe incorreta no MERGE: falta o USING.', 102);
    p++;
    let fonteSel, sa;
    if (T[p].v === '(') {
      let d = 0, q = p; for (; q < T.length; q++) { if (T[q].v === '(') d++; else if (T[q].v === ')' && --d === 0) break; }
      const dentro = s.slice(T[p].i + 1, T[q].i).trim(); p = q + 1;
      if (T[p] && T[p].u === 'AS') p++;
      sa = T[p].v; p++;
      if (/^VALUES\b/i.test(dentro)) {
        if (!T[p] || T[p].v !== '(') throw new ErroSQL('Com (VALUES ...) informe os nomes das colunas: AS origem (col1, col2).', 102);
        let d2 = 0, q2 = p; for (; q2 < T.length; q2++) { if (T[q2].v === '(') d2++; else if (T[q2].v === ')' && --d2 === 0) break; }
        const cols = s.slice(T[p].i + 1, T[q2].i).split(',').map(x => x.trim()); p = q2 + 1;
        fonteSel = `SELECT ${cols.map((c, i) => `column${i + 1} AS ${c}`).join(', ')} FROM (${dentro})`;
      } else fonteSel = dentro;
    } else {
      const nomeFonte = T[p].v; p++; sa = semEsquema(nomeFonte);
      if (T[p] && T[p].u === 'AS') p++;
      if (T[p] && T[p].u !== 'ON') { sa = T[p].v; p++; }
      fonteSel = `SELECT * FROM ${nomeFonte}`;
    }
    if (!T[p] || T[p].u !== 'ON') throw new ErroSQL('Sintaxe incorreta no MERGE: falta o ON com a condição de junção.', 102);
    // cláusulas WHEN e OUTPUT
    const marcas = []; let nCase = 0;
    for (let q = p + 1; q < T.length; q++) { const t = T[q]; if (t.d) continue; if (t.u === 'CASE') nCase++; else if (t.u === 'END' && nCase) nCase--; else if (!nCase && (t.u === 'WHEN' || t.u === 'OUTPUT' || t.u === 'OPTION')) marcas.push(q); }
    if (!marcas.length || T[marcas[0]].u !== 'WHEN') throw new ErroSQL('O MERGE precisa de pelo menos uma cláusula WHEN.', 102);
    const cond = s.slice(T[p + 1].i, T[marcas[0]].i);
    const clausulas = []; let out = null;
    marcas.forEach((q, i) => {
      const txt = s.slice(T[q].i, i + 1 < marcas.length ? T[marcas[i + 1]].i : s.length).trim();
      if (T[q].u === 'OUTPUT') out = txt.replace(/^OUTPUT\s+/i, ''); else if (T[q].u === 'WHEN') clausulas.push(txt);
    });
    const db = ctx.db, k = ++ctx.n, src = `__msrc${k}`, par = `__mpar${k}`, cl = `__mcl${k}`;
    execSQL(ctx, `CREATE TEMP TABLE ${src} AS ${fonteSel}`, L, false);
    execSQL(ctx, `CREATE TEMP TABLE ${par} AS SELECT ${ta}.rowid AS trid, ${sa}.rowid AS srid FROM main.${semEsquema(alvoTxt)} AS ${ta} JOIN ${src} AS ${sa} ON ${cond}`, L, false);
    db.exec(`CREATE TEMP TABLE ${cl} (trid INTEGER, srid INTEGER, k INTEGER, tipo TEXT)`);
    const acoes = [];
    clausulas.forEach((c, i) => {
      let m;
      const acao = txt => { if ((m = /^UPDATE\s+SET\s+([\s\S]+)$/i.exec(txt))) return { t: 'UPDATE', sets: m[1] }; if (/^DELETE$/i.test(txt.trim())) return { t: 'DELETE' }; if ((m = /^INSERT\s*(\([^)]*\))?\s*(?:VALUES\s*\(([\s\S]*)\)|(DEFAULT\s+VALUES))\s*$/i.exec(txt.trim()))) return { t: 'INSERT', cols: m[1] || '', vals: m[2], padrao: !!m[3] }; throw new ErroSQL('Ação inválida no MERGE: ' + desmascarar(txt, L), 102); };
      const sep = (re) => { const x = re.exec(c); if (!x) return null; const resto = c.slice(x[0].length); const T2 = tokenizar(resto); let th = -1, nc = 0; for (const t of T2) { if (t.d) continue; if (t.u === 'CASE') nc++; else if (t.u === 'END' && nc) nc--; else if (!nc && t.u === 'THEN') { th = t; break; } } if (!th) throw new ErroSQL('Falta THEN na cláusula do MERGE.', 102); const antes = resto.slice(0, th.i).trim(); return { extra: antes.replace(/^AND\s+/i, '').trim(), acao: acao(resto.slice(th.f).trim()) }; };
      let x;
      if ((x = sep(/^WHEN\s+MATCHED\b/i))) acoes.push({ i, tipo: 'M', extra: x.extra, a: x.acao });
      else if ((x = sep(/^WHEN\s+NOT\s+MATCHED\s+BY\s+SOURCE\b/i))) acoes.push({ i, tipo: 'S', extra: x.extra, a: x.acao });
      else if ((x = sep(/^WHEN\s+NOT\s+MATCHED(?:\s+BY\s+TARGET)?\b/i))) acoes.push({ i, tipo: 'T', extra: x.extra, a: x.acao });
      else throw new ErroSQL('Cláusula WHEN inválida no MERGE.', 102);
    });
    const tabela = semEsquema(alvoTxt);
    for (const a of acoes) {
      const ex = a.extra ? ` AND (${a.extra})` : '';
      if (a.tipo === 'M') execSQL(ctx, `INSERT INTO ${cl} SELECT p.trid, p.srid, ${a.i}, 'M' FROM ${par} p JOIN main.${tabela} AS ${ta} ON ${ta}.rowid = p.trid JOIN ${src} AS ${sa} ON ${sa}.rowid = p.srid WHERE p.trid NOT IN (SELECT trid FROM ${cl} WHERE tipo = 'M')${ex}`, L, false);
      else if (a.tipo === 'T') execSQL(ctx, `INSERT INTO ${cl} SELECT NULL, ${sa}.rowid, ${a.i}, 'T' FROM ${src} AS ${sa} WHERE ${sa}.rowid NOT IN (SELECT srid FROM ${par}) AND ${sa}.rowid NOT IN (SELECT srid FROM ${cl} WHERE tipo = 'T')${ex}`, L, false);
      else execSQL(ctx, `INSERT INTO ${cl} SELECT ${ta}.rowid, NULL, ${a.i}, 'S' FROM main.${tabela} AS ${ta} WHERE ${ta}.rowid NOT IN (SELECT trid FROM ${par}) AND ${ta}.rowid NOT IN (SELECT trid FROM ${cl} WHERE tipo = 'S')${ex}`, L, false);
    }
    const dup = db.exec(`SELECT trid FROM ${cl} WHERE tipo = 'M' GROUP BY trid HAVING COUNT(*) > 1`);
    if (dup.length && dup[0].values.length) { limparMerge(); throw new ErroSQL('A instrução MERGE tentou atualizar ou excluir a mesma linha mais de uma vez: uma linha do destino combinou com mais de uma linha da origem.', 8672); }
    function limparMerge() { db.exec(`DROP TABLE IF EXISTS ${src}; DROP TABLE IF EXISTS ${par}; DROP TABLE IF EXISTS ${cl};`); }
    const velha = out ? fotografar(ctx, tab) : null;
    const linhas = []; let total = 0;
    for (const a of acoes) {
      const filtro = `(SELECT trid FROM ${cl} WHERE k = ${a.i})`;
      let r;
      if (a.a.t === 'UPDATE') {
        const sets = dividirTopo(a.a.sets, ',').map(x => x.replace(/^\s*[\w\[\]]+\s*\.\s*(?=[\w\[\]]+\s*=)/, '')).join(', ');
        r = a.tipo === 'M'
          ? execSQL(ctx, `UPDATE main.${tabela} AS ${ta} SET ${sets} FROM ${src} AS ${sa}, ${cl} AS __c WHERE __c.k = ${a.i} AND __c.trid = ${ta}.rowid AND __c.srid = ${sa}.rowid RETURNING rowid`, L, false)
          : execSQL(ctx, `UPDATE main.${tabela} AS ${ta} SET ${sets} WHERE ${ta}.rowid IN ${filtro} RETURNING rowid`, L, false);
        rowidsDe(r).forEach(id => linhas.push(['UPDATE', id, id]));
      } else if (a.a.t === 'DELETE') {
        r = execSQL(ctx, `DELETE FROM main.${tabela} WHERE rowid IN ${filtro} RETURNING rowid`, L, false);
        rowidsDe(r).forEach(id => linhas.push(['DELETE', null, id]));
      } else {
        r = a.a.padrao
          ? execSQL(ctx, `INSERT INTO main.${tabela} DEFAULT VALUES RETURNING rowid`, L, false)
          : execSQL(ctx, `INSERT INTO main.${tabela} ${a.a.cols} SELECT ${a.a.vals} FROM ${src} AS ${sa} WHERE ${sa}.rowid IN (SELECT srid FROM ${cl} WHERE k = ${a.i}) RETURNING rowid`, L, false);
        rowidsDe(r).forEach(id => linhas.push(['INSERT', id, null]));
      }
      total += rowidsDe(r).length;
    }
    limparMerge();
    let res = null;
    if (out) res = entregarOutput(ctx, tab, linhas, { clausula: out, velha }, L, resultado);
    ctx.rowcount = total;
    return res;
  }

  /* ---------- ALTER TABLE com constraints ---------- */
  function editarEsquema(ctx, tab, novo) {
    const db = ctx.db, sv = db.exec('PRAGMA schema_version')[0].values[0][0];
    db.exec('PRAGMA writable_schema = ON');
    try { db.run("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND lower(name) = lower(?)", [novo, tab]); db.exec(`PRAGMA schema_version = ${sv + 1}`); }
    finally { db.exec('PRAGMA writable_schema = OFF'); }
  }
  function sqlTabela(ctx, tab) { const r = ctx.db.exec(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND lower(name) = lower('${tab.replace(/'/g, "''")}')`); if (!r.length || !r[0].values.length) throw new ErroSQL(`Nome de objeto inválido: ${tab}`, 208); return r[0].values[0]; }
  function reescrever(ctx, tab, fn) {
    const [nome, sql] = sqlTabela(ctx, tab); const it = itensTabela(sql);
    const itens = fn(it.itens.slice(), it.L);
    editarEsquema(ctx, nome, desmascarar(it.pre + '\n  ' + itens.join(',\n  ') + '\n' + it.pos, it.L));
  }
  const contaSQL = (ctx, sql) => primeiro(ctx.db.exec(sql)) || 0;
  function alterarTabela(ctx, s, L, final) {
    const m = /^\s*ALTER\s+TABLE\s+([\w.\[\]"]+)\s+(WITH\s+(NO)?CHECK\s+)?(ADD|DROP|NOCHECK|CHECK|ALTER\s+COLUMN|ENABLE\s+TRIGGER|DISABLE\s+TRIGGER)\b\s*([\s\S]*)$/i.exec(s);
    if (!m) return false;
    const tab = semEsquema(m[1]), op = m[4].toUpperCase().replace(/\s+/g, ' '), resto = m[5].trim(), validar = !m[3];
    const db = ctx.db, nomeReal = sqlTabela(ctx, tab)[0];
    const fin = t => final(t);
    if (op === 'ENABLE TRIGGER' || op === 'DISABLE TRIGGER') return ligarGatilho(ctx, `${op} ${resto} ON ${tab}`, L);
    return comDDL(ctx, 'ALTER_TABLE', s, L, () => {
      if (op === 'ADD') {
        const partes = dividirTopo(resto.replace(/^COLUMN\s+/i, ''), ',');
        for (const p of partes) {
          if (!/^(CONSTRAINT|CHECK|UNIQUE|PRIMARY|FOREIGN)\b/i.test(p)) { db.exec(fin(`ALTER TABLE ${nomeReal} ADD COLUMN ${p}`)); continue; }
          adicionarRestricao(ctx, nomeReal, p, L, validar, fin);
        }
        return;
      }
      if (op === 'DROP') {
        let r = resto;
        if (/^COLUMN\b/i.test(r)) { for (const c of dividirTopo(r.replace(/^COLUMN\s+(IF\s+EXISTS\s+)?/i, ''), ',')) { try { db.exec(`ALTER TABLE "${nomeReal}" DROP COLUMN ${c}`); } catch (e) { throw new ErroSQL(`Não é possível remover a coluna ${c}: ela é usada por uma constraint, índice ou view. Remova a constraint antes.`, 5074); } } return; }
        const seExiste = /^CONSTRAINT\s+IF\s+EXISTS\b/i.test(r);
        for (const n of dividirTopo(r.replace(/^CONSTRAINT\s+(IF\s+EXISTS\s+)?/i, ''), ',')) removerRestricao(ctx, nomeReal, semEsquema(n), seExiste);
        return;
      }
      if (op === 'NOCHECK' || op === 'CHECK') {
        const alvo = resto.replace(/^CONSTRAINT\s+/i, '').trim();
        const regs = restricoes(ctx).filter(r => r.tabela.toLowerCase() === nomeReal.toLowerCase() && (r.tipo === 'CHECK' || r.tipo === 'FOREIGN KEY'));
        const nomes = /^ALL$/i.test(alvo) ? null : dividirTopo(alvo, ',').map(x => semEsquema(x).toLowerCase());
        const chaveT = nomeReal.toLowerCase(); ctx.desligadas[chaveT] = ctx.desligadas[chaveT] || [];
        if (op === 'NOCHECK') {
          for (const r of regs) { if (r.desligada || (nomes && !nomes.includes(r.nome.toLowerCase()))) continue; removerRestricao(ctx, nomeReal, r.nome, false); ctx.desligadas[chaveT].push({ reg: Object.assign({}, r), def: textoRestricao(r) }); }
          if (nomes) nomes.forEach(n => { if (!regs.some(r => r.nome.toLowerCase() === n)) throw new ErroSQL(`A constraint '${n}' não existe na tabela ${nomeReal}.`, 4917); });
        } else {
          const lista = ctx.desligadas[chaveT].filter(d => !nomes || nomes.includes(d.reg.nome.toLowerCase()));
          for (const d of lista) { adicionarRestricao(ctx, nomeReal, `CONSTRAINT ${d.reg.nome} ${d.def}`, [], !!m[2] && validar, t => preparar(t), true); ctx.desligadas[chaveT].splice(ctx.desligadas[chaveT].indexOf(d), 1); }
        }
        return;
      }
      if (op === 'ALTER COLUMN') {
        const mm = /^([\w\[\]]+)\s+([\s\S]+?)\s*(NOT\s+NULL|NULL)?\s*$/i.exec(resto);
        const col = mm[1].replace(/^\[|\]$/g, ''), tipo = mm[2].replace(/\s+COLLATE\s+\S+/i, ''), nulo = mm[3] ? /^NOT/i.test(mm[3]) ? 'NOT NULL' : 'NULL' : 'NULL';
        if (nulo === 'NOT NULL' && contaSQL(ctx, `SELECT COUNT(*) FROM "${nomeReal}" WHERE "${col}" IS NULL`)) throw new ErroSQL(`Não é possível inserir o valor NULL na coluna '${col}': já existem linhas com NULL.`, 515);
        const tam = /CHAR\s*\(\s*(\d+)\s*\)/i.exec(tipo);
        if (tam && contaSQL(ctx, `SELECT COUNT(*) FROM "${nomeReal}" WHERE length("${col}") > ${tam[1]}`)) throw new ErroSQL('Os dados de cadeia de caracteres ou binários seriam truncados.', 2628);
        if (/^(INT|BIGINT|SMALLINT|TINYINT)\b/i.test(tipo) && contaSQL(ctx, `SELECT COUNT(*) FROM "${nomeReal}" WHERE "${col}" IS NOT NULL AND CAST("${col}" AS INTEGER) <> "${col}"`)) throw new ErroSQL(`Falha na conversão dos valores da coluna '${col}' para ${tipo}.`, 245);
        reescrever(ctx, nomeReal, (itens) => itens.map(it => {
          if (ehRestricaoTabela(it)) return it;
          const partes = clausulasColuna(it), nome = partes[0].split(/\s+/)[0].replace(/^\[|\]$|^"|"$/g, '');
          if (nome.toLowerCase() !== col.toLowerCase()) return it;
          const outras = partes.slice(1).filter(p => !/^(NOT\s+NULL|NULL)$/i.test(p.trim()));
          return [`${partes[0].split(/\s+/)[0]} ${converterTipoDecl(tipo)}`, nulo === 'NOT NULL' ? 'NOT NULL' : ''].concat(outras).filter(Boolean).join(' ');
        }));
        if (/^(INT|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|REAL|MONEY)\b/i.test(tipo)) db.exec(`UPDATE "${nomeReal}" SET "${col}" = CAST("${col}" AS ${/^(INT|BIGINT|SMALLINT|TINYINT)/i.test(tipo) ? 'INTEGER' : 'REAL'}) WHERE "${col}" IS NOT NULL`);
        return;
      }
    });
  }
  const converterTipoDecl = t => t.trim();
  function textoRestricao(r) {
    if (r.tipo === 'CHECK') return `CHECK ${/^\(/.test(r.def) ? r.def : '(' + r.def + ')'}`;
    if (r.tipo === 'FOREIGN KEY') return `FOREIGN KEY (${r.coluna}) REFERENCES ${r.ref}${r.refCol ? ' (' + r.refCol + ')' : ''}${r.onDelete !== 'NO_ACTION' ? ' ON DELETE ' + r.onDelete.replace('_', ' ') : ''}${r.onUpdate !== 'NO_ACTION' ? ' ON UPDATE ' + r.onUpdate.replace('_', ' ') : ''}`;
    return '';
  }
  function adicionarRestricao(ctx, tab, def, L, validar, fin, reativando) {
    const db = ctx.db;
    let nome = null, corpo = def.trim();
    const mn = /^CONSTRAINT\s+([\w\[\]]+)\s+/i.exec(corpo); if (mn) { nome = mn[1].replace(/^\[|\]$/g, ''); corpo = corpo.slice(mn[0].length); }
    const corpoSql = fin(corpo);
    if (nome && !reativando && restricoes(ctx).some(r => r.nome.toLowerCase() === nome.toLowerCase())) throw new ErroSQL(`Já existe um objeto chamado '${nome}' no banco de dados. Não foi possível criar a constraint.`, 2714);
    let m;
    if ((m = /^CHECK\s*\(([\s\S]*)\)\s*$/i.exec(corpoSql))) {
      if (validar && contaSQL(ctx, `SELECT COUNT(*) FROM "${tab}" WHERE NOT (${m[1]})`)) throw new ErroSQL(`A instrução ALTER TABLE entrou em conflito com a restrição CHECK "${nome || 'CK_' + tab}". Já existem linhas que violam a regra.`, 547);
      nome = nome || `CK_${tab}_${restricoes(ctx).filter(r => r.tabela === tab && r.tipo === 'CHECK').length + 1}`;
      reescrever(ctx, tab, itens => itens.concat([`CONSTRAINT ${nome} CHECK (${m[1]})`]));
      return;
    }
    if ((m = /^FOREIGN\s+KEY\s*\(\s*([^)]+)\)\s*REFERENCES\s+([\w.\[\]"]+)\s*(?:\(\s*([^)]+)\))?([\s\S]*)$/i.exec(corpoSql))) {
      const col = m[1].trim(), ref = semEsquema(m[2]), refCol = m[3] ? m[3].trim() : null;
      if (validar) {
        const rc = refCol || (colunasDe(ctx, ref)[0]);
        if (contaSQL(ctx, `SELECT COUNT(*) FROM "${tab}" c WHERE c.${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${ref}" r WHERE r.${rc} = c.${col})`)) throw new ErroSQL(`A instrução ALTER TABLE entrou em conflito com a restrição FOREIGN KEY "${nome || 'FK_' + tab + '_' + col}". Há valores em ${col} que não existem em ${ref}.`, 547);
      }
      nome = nome || `FK_${tab}_${col}`;
      reescrever(ctx, tab, itens => itens.concat([`CONSTRAINT ${nome} FOREIGN KEY (${col}) REFERENCES ${ref}${refCol ? ' (' + refCol + ')' : ''}${m[4]}`]));
      return;
    }
    if ((m = /^(UNIQUE|PRIMARY\s+KEY)\s*(?:(?:NON)?CLUSTERED\s*)?\(\s*([^)]+)\)\s*$/i.exec(corpoSql))) {
      const cols = m[2].split(',').map(c => c.trim().replace(/\s+(ASC|DESC)$/i, '')), pk = /^PRIMARY/i.test(m[1]);
      if (pk && restricoes(ctx).some(r => r.tabela.toLowerCase() === tab.toLowerCase() && r.tipo === 'PRIMARY KEY')) throw new ErroSQL(`A tabela '${tab}' já tem uma chave primária.`, 1779);
      if (contaSQL(ctx, `SELECT COUNT(*) FROM (SELECT 1 FROM "${tab}" WHERE ${cols.map(c => c + ' IS NOT NULL').join(' AND ')} GROUP BY ${cols.join(', ')} HAVING COUNT(*) > 1)`)) throw new ErroSQL(`Não foi possível criar a restrição ${pk ? 'PRIMARY KEY' : 'UNIQUE'}: há valores duplicados em (${cols.join(', ')}).`, 1505);
      nome = nome || `${pk ? 'PK' : 'UQ'}_${tab}_${cols[0]}`;
      db.exec(`CREATE UNIQUE INDEX "${nome}" ON "${tab}" (${cols.join(', ')})`);
      ctx.uq.set(nome, { tabela: tab, pk });
      return;
    }
    if ((m = /^DEFAULT\s+([\s\S]+?)\s+FOR\s+([\w\[\]]+)\s*$/i.exec(corpoSql))) {
      const col = m[2].replace(/^\[|\]$/g, ''), expr = m[1].trim();
      if (restricoes(ctx).some(r => r.tabela.toLowerCase() === tab.toLowerCase() && r.tipo === 'DEFAULT' && r.coluna.toLowerCase() === col.toLowerCase())) throw new ErroSQL(`A coluna '${col}' já tem um DEFAULT associado.`, 1781);
      nome = nome || `DF_${tab}_${col}`;
      let achou = false;
      reescrever(ctx, tab, itens => itens.map(it => {
        if (ehRestricaoTabela(it)) return it;
        const n = it.trim().split(/\s+/)[0].replace(/^\[|\]$|^"|"$/g, '');
        if (n.toLowerCase() !== col.toLowerCase()) return it;
        achou = true; return `${it} CONSTRAINT ${nome} DEFAULT (${/^\(/.test(expr) ? expr.replace(/^\((.*)\)$/s, '$1') : expr})`;
      }));
      if (!achou) throw new ErroSQL(`Nome de coluna inválido: ${col}`, 207);
      return;
    }
    throw new ErroSQL('Tipo de constraint não reconhecido no ALTER TABLE.', 102);
  }
  function removerRestricao(ctx, tab, nome, seExiste) {
    const db = ctx.db, n = nome.toLowerCase();
    if (ctx.uq.has(nome) || [...ctx.uq.keys()].some(k => k.toLowerCase() === n)) { const k = [...ctx.uq.keys()].find(x => x.toLowerCase() === n); db.exec(`DROP INDEX "${k}"`); ctx.uq.delete(k); return; }
    const des = ctx.desligadas[tab.toLowerCase()] || []; const di = des.findIndex(d => d.reg.nome.toLowerCase() === n); if (di >= 0) { des.splice(di, 1); return; }
    const reg = restricoes(ctx).find(r => r.tabela.toLowerCase() === tab.toLowerCase() && r.nome.toLowerCase() === n);
    if (!reg) { if (seExiste) return; throw new ErroSQL(`'${nome}' não é uma constraint da tabela ${tab}.`, 3728); }
    if (reg.tipo === 'PRIMARY KEY' || reg.tipo === 'UNIQUE') throw new ErroSQL('O laboratório não remove chaves primárias nem UNIQUE criadas junto com a tabela. No SQL Server o comando seria o mesmo ALTER TABLE ... DROP CONSTRAINT.', 50000);
    let feito = false, nCk = 0;
    reescrever(ctx, tab, itens => itens.filter(it => {
      if (!ehRestricaoTabela(it)) return true;
      const nm = /^CONSTRAINT\s+(\S+)/i.exec(it), corpo = it.replace(/^CONSTRAINT\s+\S+\s+/i, '');
      if (/^CHECK/i.test(corpo)) nCk++;
      const gerado = /^CHECK/i.test(corpo) ? `CK_${tab}_${nCk}` : /^FOREIGN/i.test(corpo) ? `FK_${tab}_${(/\(\s*([^)]+)\)/.exec(corpo) || [])[1]}` : null;
      const nomeIt = nm ? nm[1].replace(/^\[|\]$/g, '') : gerado;
      if (!feito && nomeIt && nomeIt.toLowerCase() === n) { feito = true; return false; }
      return true;
    }).map(it => {
      if (feito || ehRestricaoTabela(it)) return it;
      const partes = clausulasColuna(it), col = partes[0].split(/\s+/)[0].replace(/^\[|\]$|^"|"$/g, '');
      const fica = partes.slice(1).filter(p => {
        const nm = /^CONSTRAINT\s+(\S+)/i.exec(p), corpo = p.replace(/^CONSTRAINT\s+\S+\s+/i, '');
        const gerado = /^DEFAULT/i.test(corpo) ? `DF_${tab}_${col}` : /^CHECK/i.test(corpo) ? `CK_${tab}_${col}` : /^REFERENCES/i.test(corpo) ? `FK_${tab}_${col}` : null;
        const nomeIt = nm ? nm[1].replace(/^\[|\]$/g, '') : gerado;
        if (!feito && nomeIt && nomeIt.toLowerCase() === n) { feito = true; return false; }
        return true;
      });
      return [partes[0]].concat(fica).join(' ');
    }));
    if (!feito && !seExiste) throw new ErroSQL(`'${nome}' não é uma constraint da tabela ${tab}.`, 3728);
  }

  /* ---------- API ---------- */
  function executar(SQL, sql, verificacao, preparo) {
    const db = novoBanco(SQL), ctx = novoContexto(SQL, db);
    try {
      if (preparo) { rodar(ctx, preparo); ctx.res = []; ctx.msgs = []; }
      rodar(ctx, sql);
      if (verificacao) { ctx.res = []; ctx.msgs = []; rodar(ctx, verificacao); }
      const u = ctx.res[ctx.res.length - 1];
      if (u) return { cols: u.columns, rows: u.values, msgs: ctx.msgs.slice() };
      if (ctx.msgs.length) return { cols: ['Mensagens'], rows: ctx.msgs.map(x => [x]), msgs: ctx.msgs.slice(), soMensagens: true };
      return null;
    } catch (e) {
      if (ehControle(e)) { if (e instanceof Retorno) { const u = ctx.res[ctx.res.length - 1]; return u ? { cols: u.columns, rows: u.values } : null; } throw new Error('BREAK/CONTINUE fora de um WHILE.'); }
      const er = comoErro(e), x = new Error(er.message); x.numero = er.numero; throw x;
    } finally { db.close(); }
  }

  /* Sessão do laboratório livre: o banco continua vivo entre execuções (como uma janela de consulta do SSMS).
     Devolve todos os conjuntos de resultados do lote, as mensagens e o total de linhas afetadas. */
  function sessao(SQL) {
    let db = null, ctx = null;
    const abrir = () => { if (db) db.close(); db = novoBanco(SQL); ctx = novoContexto(SQL, db); };
    abrir();
    return {
      executar(sql) {
        ctx.res = []; ctx.msgs = []; ctx.passos = 0; ctx.esc = { vars: new Map() }; ctx.erro = null; ctx.rowcount = 0;
        const fim = () => ({ sets: ctx.res.map(u => ({ cols: u.columns, rows: u.values })), msgs: ctx.msgs.slice(), afetadas: ctx.rowcount, tran: ctx.tran });
        try { rodar(ctx, sql); return fim(); }
        catch (e) {
          if (ehControle(e)) { if (e instanceof Retorno) return fim(); const x = new Error('BREAK/CONTINUE fora de um WHILE.'); x.parcial = fim(); throw x; }
          const er = comoErro(e), x = new Error(er.message); x.numero = er.numero; x.parcial = fim(); throw x;
        }
      },
      reiniciar: abrir,
      db: () => db,
      fechar() { if (db) db.close(); db = null; }
    };
  }

  const API = { AGORA, BANCOS, registrarBanco, usar, preparar, executar, novoBanco, registrar, traduzirErro, compilar, sessao };
  Object.defineProperty(API, 'atual', { get: () => atual });
  Object.defineProperty(API, 'TABELAS', { get: () => (BANCOS[atual] || {}).TABELAS || [] });
  Object.defineProperty(API, 'SEED', { get: () => (BANCOS[atual] || {}).SEED || '' });
  raiz.MotorSQL = API;
})(typeof window !== 'undefined' ? window : globalThis);
