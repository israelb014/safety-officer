// In-memory stand-in for @supabase/supabase-js, used ONLY by tests/smoke.mjs
// (served in place of the CDN module). Data persists in localStorage between reloads.
const LS = 'fake-supabase-db';
const uid = () => {
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
};
const now = () => new Date().toISOString();

const DEFAULTS = {
  vehicles: { active: true, vehicle_type: 'minibus' },
  drivers: { active: true },
  driver_flags: { regulation_84: false },
  documents: { is_current: true },
  tachograph_days: { checked: false },
  settings: { ntfy_topic: null, lead_days: [30, 14, 7, 1, 0], service_days: 14, service_km: 1000 },
  notification_log: { kind: 'digest', status: 'sent', item_count: 0 },
  services: { service_type: 'periodic' },
};
const UNIQUE = {
  vehicles: [['plate']],
  expiry_items: [['owner_type', 'owner_id', 'item_key']],
  tachograph_days: [['vehicle_id', 'day']],
  tachograph_signoffs: [['vehicle_id', 'year', 'month']],
  driver_flags: [['driver_id']],
  settings: [['id']],
};
const PK = { driver_flags: 'driver_id' };

function loadDb() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
let db = loadDb();
if (!db.settings) db.settings = [{ id: 1, ...DEFAULTS.settings, created_at: now(), updated_at: now() }];
const save = () => localStorage.setItem(LS, JSON.stringify(db));
const T = (name) => (db[name] ||= []);

function conflictErr(table) {
  return { message: `duplicate key value violates unique constraint "${table}_key"`, code: '23505' };
}
function checkUnique(table, row, ignoreId) {
  for (const cols of UNIQUE[table] || []) {
    if (T(table).some((r) => r !== ignoreId && cols.every((c) => String(r[c]) === String(row[c])))) return conflictErr(table);
  }
  if (table === 'documents' && row.is_current) {
    if (T(table).some((r) => r !== ignoreId && r.is_current && r.owner_type === row.owner_type && r.owner_id === row.owner_id && r.slot_key === row.slot_key)) return conflictErr(table);
  }
  return null;
}

function cascadeDelete(table, row) {
  const del = (t, pred) => { db[t] = T(t).filter((r) => { if (pred(r)) { cascadeDelete(t, r); return false; } return true; }); };
  if (table === 'vehicles') {
    del('services', (r) => r.vehicle_id === row.id);
    del('tachograph_days', (r) => r.vehicle_id === row.id);
    del('tachograph_signoffs', (r) => r.vehicle_id === row.id);
    del('expiry_items', (r) => r.owner_type === 'vehicle' && r.owner_id === row.id);
    del('documents', (r) => r.owner_type === 'vehicle' && r.owner_id === row.id);
    T('drivers').forEach((d) => { if (d.default_vehicle_id === row.id) d.default_vehicle_id = null; });
  }
  if (table === 'drivers') {
    del('driver_flags', (r) => r.driver_id === row.id);
    del('expiry_items', (r) => r.owner_type === 'driver' && r.owner_id === row.id);
    del('documents', (r) => r.owner_type === 'driver' && r.owner_id === row.id);
    T('vehicles').forEach((v) => { if (v.default_driver_id === row.id) v.default_driver_id = null; });
  }
  if (table === 'services') del('documents', (r) => r.owner_type === 'service' && r.owner_id === row.id);
  if (table === 'documents') del('document_pages', (r) => r.document_id === row.id);
}

class Query {
  constructor(table) {
    this.table = table; this.op = 'select'; this.filters = []; this.orders = [];
    this.lim = null; this.mode = 'many'; this.returning = false; this.payload = null; this.conflict = null;
  }
  select() { if (this.op !== 'select') this.returning = true; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.conflict = opts.onConflict; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  in(c, arr) { this.filters.push((r) => arr.map(String).includes(String(r[c]))); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
  order(c, { ascending = true } = {}) { this.orders.push([c, ascending]); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  match(r) { return this.filters.every((f) => f(r)); }

  run() {
    const t = T(this.table);
    let out = [];
    if (this.op === 'select') {
      out = t.filter((r) => this.match(r));
    } else if (this.op === 'insert') {
      for (const p of [].concat(this.payload)) {
        const row = { id: uid(), ...DEFAULTS[this.table], ...p, created_at: now(), updated_at: now() };
        if (PK[this.table]) delete row.id;
        const err = checkUnique(this.table, row);
        if (err) return { data: null, error: err };
        t.push(row); out.push(row);
      }
    } else if (this.op === 'update') {
      for (const r of t.filter((x) => this.match(x))) {
        const next = { ...r, ...this.payload, updated_at: now() };
        const err = checkUnique(this.table, next, r);
        if (err) return { data: null, error: err };
        Object.assign(r, next); out.push(r);
      }
    } else if (this.op === 'upsert') {
      const cols = (this.conflict || 'id').split(',');
      for (const p of [].concat(this.payload)) {
        const ex = t.find((r) => cols.every((c) => String(r[c]) === String(p[c])));
        if (ex) { Object.assign(ex, p, { updated_at: now() }); out.push(ex); } else {
          const row = { id: uid(), ...DEFAULTS[this.table], ...p, created_at: now(), updated_at: now() };
          if (PK[this.table]) delete row.id;
          t.push(row); out.push(row);
        }
      }
    } else if (this.op === 'delete') {
      const gone = t.filter((r) => this.match(r));
      db[this.table] = t.filter((r) => !this.match(r));
      gone.forEach((r) => cascadeDelete(this.table, r));
      out = gone;
    }
    save();
    out = out.map((r) => ({ ...r }));
    for (const [c, asc] of [...this.orders].reverse()) {
      out.sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.lim != null) out = out.slice(0, this.lim);
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };
    if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: `single() got ${out.length} rows` } };
    if (this.mode === 'maybe') return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }
  then(res, rej) {
    return new Promise((r) => setTimeout(r, 15)).then(() => this.run()).then(res, rej);
  }
}

const files = new Map();
const listeners = [];
const SESSION = 'fake-supabase-session';

export function createClient() {
  return {
    from: (t) => new Query(t),
    auth: {
      async getSession() {
        return { data: { session: localStorage.getItem(SESSION) ? { user: { email: 'nissim@example.com' } } : null } };
      },
      async getUser() { return { data: { user: { email: 'nissim@example.com' } } }; },
      async signInWithPassword({ email, password }) {
        if (password === 'wrong') return { error: { message: 'Invalid login credentials' } };
        localStorage.setItem(SESSION, email);
        return { data: {}, error: null };
      },
      async signOut() { localStorage.removeItem(SESSION); listeners.forEach((f) => f('SIGNED_OUT')); return { error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: {
      from: () => ({
        async upload(path, blob) { files.set(path, blob); return { data: { path }, error: null }; },
        async remove(paths) { paths.forEach((p) => files.delete(p)); return { data: [], error: null }; },
        async createSignedUrls(paths) {
          return { data: paths.map((p) => ({ path: p, signedUrl: files.has(p) ? URL.createObjectURL(files.get(p)) : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })), error: null };
        },
      }),
    },
  };
}
