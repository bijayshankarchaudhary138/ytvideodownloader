/**
 * Simple JSON-file database - no native dependencies, works everywhere
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch(e) { console.error('DB parse error:', e); }
  }
  return {
    posts: [],
    categories: [],
    sources: [],
    scraping_logs: [],
    subscribers: [],
    admins: [],
    _counters: { postId: 1, categoryId: 1, sourceId: 1, logId: 1, adminId: 1 }
  };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Initialize defaults
function initDefaults() {
  const defaultCats = [
    { slug: 'latest-jobs', name: 'Latest Jobs', hindi_name: 'नवीनतम नौकरियां', color: '#d32f2f', sort_order: 1 },
    { slug: 'results', name: 'Results', hindi_name: 'परिणाम', color: '#2e7d32', sort_order: 2 },
    { slug: 'admit-card', name: 'Admit Card', hindi_name: 'प्रवेश पत्र', color: '#1565c0', sort_order: 3 },
    { slug: 'answer-key', name: 'Answer Key', hindi_name: 'उत्तर कुंजी', color: '#e65100', sort_order: 4 },
    { slug: 'syllabus', name: 'Syllabus', hindi_name: 'पाठ्यक्रम', color: '#6a1b9a', sort_order: 5 },
    { slug: 'admission', name: 'Admission', hindi_name: 'प्रवेश', color: '#00838f', sort_order: 6 },
    { slug: 'scholarship', name: 'Scholarship', hindi_name: 'छात्रवृत्ति', color: '#37474f', sort_order: 7 }
  ];

  defaultCats.forEach(cat => {
    if (!db.categories.find(c => c.slug === cat.slug)) {
      db.categories.push({ id: db._counters.categoryId++, ...cat });
    }
  });

  if (!db.admins.find(a => a.username === 'admin')) {
    db.admins.push({
      id: db._counters.adminId++,
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      name: 'Administrator',
      email: 'admin@example.com',
      role: 'superadmin',
      created_at: new Date().toISOString()
    });
  }

  saveDB(db);
}
initDefaults();

// Simple query helper
const DB = {
  prepare(sql) {
    // Extremely minimal SQL-like interface for the queries we use
    // We parse SELECT/INSERT/UPDATE/DELETE statements
    const sqlStr = sql.trim().replace(/\s+/g, ' ');

    return {
      get(...params) {
        return this.all(...params)[0] || undefined;
      },
      all(...params) {
        return runSelect(sqlStr, params, db);
      },
      run(...params) {
        return runModify(sqlStr, params, db, saveDB);
      }
    };
  },
  pragma() {},
  exec() {}
};

function parseWhere(whereClause, params) {
  // Very simple WHERE parsing for our patterns
  let pIdx = 0;
  const conditions = [];
  const parts = whereClause.split(/\s+AND\s+/i);
  parts.forEach(part => {
    const likeMatch = part.match(/(\w+)\s+LIKE\s+\?/i);
    const eqMatch = part.match(/(\w+)\s*=\s*\?/);
    const eqValMatch = part.match(/(\w+)\s*=\s*'([^']*)'/);
    const eqIntMatch = part.match(/(\w+)\s*=\s*(\d+)/);
    const nullMatch = part.match(/(\w+)\s+IS\s+NOT\s+NULL/i);

    if (likeMatch) {
      conditions.push({ field: likeMatch[1], op: 'LIKE', value: params[pIdx++] });
    } else if (eqMatch) {
      conditions.push({ field: eqMatch[1], op: '=', value: params[pIdx++] });
    } else if (eqValMatch) {
      conditions.push({ field: eqValMatch[1], op: '=', value: eqValMatch[2] });
    } else if (eqIntMatch) {
      conditions.push({ field: eqIntMatch[1], op: '=', value: parseInt(eqIntMatch[2]) });
    } else if (nullMatch) {
      conditions.push({ field: nullMatch[1], op: 'NOT NULL' });
    }
  });
  return conditions;
}

function matchCondition(item, cond) {
  const val = item[cond.field];
  if (cond.op === '=') return String(val) === String(cond.value);
  if (cond.op === 'LIKE') {
    const pattern = cond.value.replace(/%/g, '.*');
    return new RegExp(pattern, 'i').test(String(val || ''));
  }
  if (cond.op === 'NOT NULL') return val != null && val !== '';
  return true;
}

function getTable(name) {
  if (name === 'posts') return db.posts;
  if (name === 'categories') return db.categories;
  if (name === 'sources') return db.sources;
  if (name === 'scraping_logs') return db.scraping_logs;
  if (name === 'subscribers') return db.subscribers;
  if (name === 'admins') return db.admins;
  return [];
}

function runSelect(sql, params, db) {
  // SELECT fields FROM table [WHERE ...] [ORDER BY ...] [LIMIT ? OFFSET ?]
  const selMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\?|\d+)(?:\s+OFFSET\s+(\?|\d+))?)?$/i);
  if (!selMatch) return [];

  const [, fields, tableName, whereClause, orderBy, limitStr, offsetStr] = selMatch;
  let rows = getTable(tableName).slice();

  if (whereClause) {
    const conds = parseWhere(whereClause, params);
    rows = rows.filter(r => conds.every(c => matchCondition(r, c)));
  }

  // ORDER BY
  if (orderBy) {
    const orderParts = orderBy.split(',').map(s => s.trim());
    rows.sort((a, b) => {
      for (const op of orderParts) {
        const desc = /\sDESC/i.test(op);
        const field = op.replace(/\s+(ASC|DESC)/i, '').trim();
        let va = a[field], vb = b[field];
        // Handle datetime() wrapped fields
        const dtMatch = field.match(/datetime\((\w+)\)/);
        if (dtMatch) {
          va = a[dtMatch[1]]; vb = b[dtMatch[1]];
        }
        if (va === vb) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (va < vb) return desc ? 1 : -1;
        if (va > vb) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  // Handle LIMIT/OFFSET (consume remaining params)
  let limit = Infinity, offset = 0;
  let remainingParams = params.slice();
  if (whereClause) {
    // estimate params used
    const usedCount = (whereClause.match(/\?/g) || []).length;
    remainingParams = params.slice(usedCount);
  }
  if (limitStr) {
    limit = limitStr === '?' ? remainingParams.shift() : parseInt(limitStr);
  }
  if (offsetStr) {
    offset = offsetStr === '?' ? remainingParams.shift() : parseInt(offsetStr);
  }

  rows = rows.slice(offset, offset + limit);

  // Field selection
  if (fields.trim() !== '*') {
    const fieldList = fields.split(',').map(f => f.trim().replace(/^.+\((\w+)\)\s+AS\s+\w+$/i, '$1'));
    // Handle COUNT(*) as c
    if (fields.includes('COUNT(*)')) {
      return [{ c: rows.length, total: rows.length }];
    }
    rows = rows.map(r => {
      const o = {};
      fieldList.forEach(f => { if (f in r) o[f] = r[f]; });
      return o;
    });
  }

  return rows;
}

function runModify(sql, params, db, save) {
  // INSERT
  const insMatch = sql.match(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insMatch) {
    const [, tableName, colsStr] = insMatch;
    const cols = colsStr.split(',').map(c => c.trim());
    const table = getTable(tableName);

    // Check OR IGNORE
    const isIgnore = /OR\s+IGNORE/i.test(sql);
    if (isIgnore) {
      // Check unique: for categories/slug, admins/username
      if (tableName === 'categories') {
        const slugIdx = cols.indexOf('slug');
        if (slugIdx >= 0 && table.find(c => c.slug === params[slugIdx])) return { lastInsertRowid: 0, changes: 0 };
      }
      if (tableName === 'admins') {
        const unIdx = cols.indexOf('username');
        if (unIdx >= 0 && table.find(a => a.username === params[unIdx])) return { lastInsertRowid: 0, changes: 0 };
      }
      if (tableName === 'sources') {
        const nIdx = cols.indexOf('name');
        if (nIdx >= 0 && table.find(s => s.name === params[nIdx])) return { lastInsertRowid: 0, changes: 0 };
      }
      if (tableName === 'posts') {
        const slugIdx = cols.indexOf('slug');
        const urlIdx = cols.indexOf('source_url');
        if (slugIdx >= 0 && table.find(p => p.slug === params[slugIdx])) return { lastInsertRowid: 0, changes: 0 };
        if (urlIdx >= 0 && params[urlIdx] && table.find(p => p.source_url === params[urlIdx])) return { lastInsertRowid: 0, changes: 0 };
      }
    }

    const idField = tableName === 'posts' ? 'id' : 'id';
    let newId = 1;
    if (table.length > 0) newId = Math.max(...table.map(r => r.id || 0)) + 1;

    const obj = { id: newId, created_at: new Date().toISOString() };
    cols.forEach((c, i) => { obj[c] = params[i]; });
    table.push(obj);
    save(db);
    return { lastInsertRowid: newId, changes: 1 };
  }

  // UPDATE
  const updMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (updMatch) {
    const [, tableName, setClause, whereClause] = updMatch;
    const table = getTable(tableName);
    const setParts = setClause.split(',').map(s => s.trim());
    const sets = [];
    let pIdx = 0;
    setParts.forEach(p => {
      const m = p.match(/(\w+)\s*=\s*\?/);
      if (m) sets.push({ field: m[1], paramIdx: pIdx++ });
    });
    const whereParams = params.slice(pIdx);
    const conds = parseWhere(whereClause, whereParams);
    let changes = 0;
    table.forEach(r => {
      if (conds.every(c => matchCondition(r, c))) {
        sets.forEach(s => { r[s.field] = params[s.paramIdx]; });
        r.updated_at = new Date().toISOString();
        changes++;
      }
    });
    save(db);
    return { changes, lastInsertRowid: 0 };
  }

  // DELETE
  const delMatch = sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)$/i);
  if (delMatch) {
    const [, tableName, whereClause] = delMatch;
    const table = getTable(tableName);
    const conds = parseWhere(whereClause, params);
    const before = table.length;
    for (let i = table.length - 1; i >= 0; i--) {
      if (conds.every(c => matchCondition(table[i], c))) table.splice(i, 1);
    }
    save(db);
    return { changes: before - table.length, lastInsertRowid: 0 };
  }

  return { changes: 0, lastInsertRowid: 0 };
}

export default DB;
