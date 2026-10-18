// Legacy import: CSV exports (phpMyAdmin) of the old MySQL tables → new schema, with preview.
import { sb, configured } from './db.js';
import { icon } from './icons.js';
import { esc, toast, errText, $ } from './ui.js';
import { VEHICLE_ITEMS, DRIVER_ITEMS, formatPlate, fmtDate } from './items.js';

// ---------- CSV ----------
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

export function parseDate(v) {
  const s = String(v ?? '').trim();
  if (!s || /^0{4}-0{2}-0{2}/.test(s) || s.toUpperCase() === 'NULL') return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  return null;
}
function iso(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const clean = (v) => {
  const s = String(v ?? '').trim();
  return s && s.toUpperCase() !== 'NULL' ? s : null;
};
const intv = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const truthy = (v) => /^(1|true|yes|y|כן|יש|v|x)$/i.test(String(v ?? '').trim());
const normPlate = (p) => String(p || '').replace(/[\s\-.]/g, '');

function vehicleType(v) {
  const s = String(v || '').toLowerCase();
  if (/אוטובוס|bus/.test(s) && !/mini|מיני/.test(s)) return 'bus';
  if (/מיני|mini/.test(s)) return 'minibus';
  if (/ואן|van/.test(s)) return 'van';
  if (/פרטי|private|car/.test(s)) return 'private';
  return s ? 'other' : 'minibus';
}

// ---------- table definitions ----------
const DATE_FIELD = (key, label, guesses) => ({ key: `exp:${key}`, label, guesses, date: true });

const TABLES = [
  {
    key: 'vehicles', title: 'רכבים', table: 'vehicles', iconName: 'car',
    fields: [
      { key: 'legacy_id', label: 'מזהה ישן (id)', guesses: ['^id$', 'vehicle_id', 'car_id'] },
      { key: 'plate', label: 'מספר רישוי *', required: true, guesses: ['plate', 'license_plate', 'number', 'car_num', 'mispar', 'רישוי', 'מספר'] },
      { key: 'vehicle_type', label: 'סוג רכב', guesses: ['type', 'kind', 'סוג'] },
      { key: 'manufacturer', label: 'יצרן', guesses: ['manufacturer', 'make', 'brand', 'company', 'יצרן'] },
      { key: 'model', label: 'דגם', guesses: ['model', 'דגם'] },
      { key: 'year', label: 'שנה', guesses: ['year', 'שנה', 'shnat'] },
      { key: 'seats', label: 'מקומות', guesses: ['seats', 'places', 'מקומות'] },
      { key: 'current_km', label: 'ק"מ', guesses: ['km', 'mileage', 'odometer', 'קמ', 'ק"מ'] },
      { key: 'notes', label: 'הערות', guesses: ['notes', 'remarks', 'comment', 'הערות'] },
      ...VEHICLE_ITEMS.map((i) => DATE_FIELD(i.key, i.label, {
        vehicle_license: ['license_exp', 'license_date', 'rishayon', 'test_date', 'רישיון'],
        insurance_mandatory: ['chova', 'mandatory', 'compulsory', 'חובה'],
        insurance_comprehensive: ['makif', 'comprehensive', 'third', 'מקיף'],
        fire_extinguisher: ['extinguisher', 'fire', 'מטף'],
        winter_check: ['winter', 'חורף'],
      }[i.key] || [])),
    ],
  },
  {
    key: 'drivers', title: 'נהגים', table: 'drivers', iconName: 'users',
    fields: [
      { key: 'legacy_id', label: 'מזהה ישן (id)', guesses: ['^id$', 'driver_id'] },
      { key: 'full_name', label: 'שם מלא', guesses: ['full_name', '^name$', 'driver_name', 'שם מלא', '^שם$'] },
      { key: 'first_name', label: 'שם פרטי', guesses: ['first', 'fname', 'פרטי'] },
      { key: 'last_name', label: 'שם משפחה', guesses: ['last', 'lname', 'family', 'משפחה'] },
      { key: 'id_number', label: 'ת"ז', guesses: ['id_number', 'tz', 'teudat', 'identity', 'ת"ז', 'תז'] },
      { key: 'phone', label: 'טלפון', guesses: ['phone', 'mobile', 'cell', 'tel', 'טלפון', 'נייד'] },
      { key: 'notes', label: 'הערות', guesses: ['notes', 'remarks', 'הערות'] },
      { key: 'regulation_84', label: 'תקנה 84 (כן/לא)', guesses: ['84', 'takana', 'תקנה'] },
      ...DRIVER_ITEMS.map((i) => DATE_FIELD(i.key, i.label, {
        driving_license: ['license', 'rishayon', 'רישיון'],
        police_clearance: ['police', 'משטרה'],
        training_summer: ['summer', 'קיץ'],
        training_winter: ['winter', 'חורף'],
      }[i.key] || [])),
    ],
  },
  {
    key: 'insurance', title: 'ביטוחים', iconName: 'shield',
    fields: [
      { key: 'vehicle', label: 'רכב (מזהה ישן או מספר רישוי) *', required: true, guesses: ['vehicle_id', 'car_id', 'plate', 'vehicle', 'רכב'] },
      { key: 'type', label: 'סוג ביטוח (חובה/מקיף)', guesses: ['type', 'kind', 'סוג'] },
      { key: 'date', label: 'תאריך תוקף *', required: true, date: true, guesses: ['expir', 'end', 'valid', 'until', 'to_date', 'date', 'תוקף', 'תאריך'] },
    ],
    extra: 'insurance',
  },
  {
    key: 'vehicle_test', title: 'טסטים (רישיון רכב)', iconName: 'calendar',
    fields: [
      { key: 'vehicle', label: 'רכב (מזהה ישן או מספר רישוי) *', required: true, guesses: ['vehicle_id', 'car_id', 'plate', 'vehicle', 'רכב'] },
      { key: 'date', label: 'תאריך תוקף *', required: true, date: true, guesses: ['expir', 'next', 'valid', 'until', 'date', 'תוקף', 'תאריך'] },
    ],
    extra: 'test',
  },
];

const state = Object.fromEntries(TABLES.map((t) => [t.key, { rows: null, headerRow: true, map: {}, fileName: '', defaultItem: t.extra === 'test' ? 'vehicle_license' : 'insurance_mandatory' }]));

function headersOf(t) {
  const s = state[t.key];
  if (!s.rows) return [];
  const width = Math.max(...s.rows.map((r) => r.length));
  return Array.from({ length: width }, (_, i) => (s.headerRow ? String(s.rows[0][i] ?? '').trim() : '') || `עמודה ${i + 1}`);
}
function dataRows(t) {
  const s = state[t.key];
  return s.rows ? (s.headerRow ? s.rows.slice(1) : s.rows) : [];
}
function guessMap(t) {
  const hs = headersOf(t).map((h) => h.toLowerCase());
  const map = {};
  const used = new Set();
  for (const f of t.fields) {
    for (const g of f.guesses) {
      const re = new RegExp(g, 'i');
      const idx = hs.findIndex((h, i) => !used.has(i) && re.test(h));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); break; }
    }
  }
  return map;
}
const get = (t, row, key) => {
  const i = state[t.key].map[key];
  return i == null || i === '' ? null : row[i];
};

// Map one CSV row → normalized record (+ problem text)
function mapRow(t, row) {
  if (t.key === 'vehicles') {
    const plate = formatPlate(clean(get(t, row, 'plate')) || '');
    const rec = {
      legacy_id: clean(get(t, row, 'legacy_id')), plate,
      vehicle_type: vehicleType(get(t, row, 'vehicle_type')),
      manufacturer: clean(get(t, row, 'manufacturer')), model: clean(get(t, row, 'model')),
      year: intv(get(t, row, 'year')), seats: intv(get(t, row, 'seats')), current_km: intv(get(t, row, 'current_km')),
      notes: clean(get(t, row, 'notes')), dates: {},
    };
    for (const i of VEHICLE_ITEMS) { const d = parseDate(get(t, row, `exp:${i.key}`)); if (d) rec.dates[i.key] = d; }
    return { rec, problem: plate ? '' : 'חסר מספר רישוי' };
  }
  if (t.key === 'drivers') {
    const full = clean(get(t, row, 'full_name'))
      || [clean(get(t, row, 'first_name')), clean(get(t, row, 'last_name'))].filter(Boolean).join(' ');
    const rec = {
      legacy_id: clean(get(t, row, 'legacy_id')), full_name: full || '',
      id_number: clean(get(t, row, 'id_number')), phone: clean(get(t, row, 'phone')), notes: clean(get(t, row, 'notes')),
      regulation_84: state[t.key].map.regulation_84 != null && state[t.key].map.regulation_84 !== '' ? truthy(get(t, row, 'regulation_84')) : null,
      dates: {},
    };
    for (const i of DRIVER_ITEMS) { const d = parseDate(get(t, row, `exp:${i.key}`)); if (d) rec.dates[i.key] = d; }
    return { rec, problem: full ? '' : 'חסר שם' };
  }
  const vehicle = clean(get(t, row, 'vehicle'));
  const date = parseDate(get(t, row, 'date'));
  let item = state[t.key].defaultItem;
  if (t.extra === 'insurance' && state[t.key].map.type != null && state[t.key].map.type !== '') {
    const ty = String(get(t, row, 'type') || '');
    item = /חובה|mandator|compuls|chova|hova/i.test(ty) ? 'insurance_mandatory'
      : /מקיף|צד|comp|third|makif/i.test(ty) ? 'insurance_comprehensive' : state[t.key].defaultItem;
  }
  return { rec: { vehicle, date, item }, problem: !vehicle ? 'חסר רכב' : !date ? 'תאריך לא תקין' : '' };
}

// ---------- UI ----------
function render(root) {
  root.innerHTML = `
    <header class="page-head">
      <a class="icon-btn back-btn" href="./index.html#/settings" aria-label="חזרה">${icon('chevronRight', 28)}</a>
      <div class="page-title"><h1>ייבוא מהמערכת הישנה</h1><p>קבצי CSV שיוצאו מ-phpMyAdmin</p></div>
    </header>
    <div class="card import-help">
      <p>${icon('info', 18)} ב-phpMyAdmin: בוחרים טבלה ← <b>Export</b> ← Format: <b>CSV</b> ← מסמנים <b>Put columns names in the first row</b> ← Go.
      מעלים כאן את הקבצים, בודקים את התצוגה המקדימה ולוחצים "ייבוא". אפשר לייבא שוב — רכבים קיימים מתעדכנים לפי מספר רישוי.</p>
    </div>
    <div class="import-steps">
      ${TABLES.map((t) => `<section class="card import-card" data-t="${t.key}"></section>`).join('')}
    </div>
    <div class="save-bar" style="bottom:16px">
      <button class="btn btn-primary btn-lg" data-run disabled>${icon('upload')} ייבוא</button>
    </div>
    <section class="card" data-log hidden><h2>תוצאות</h2><ul class="import-log"></ul></section>`;
  TABLES.forEach((t) => drawCard(root, t));
  $('[data-run]', root).onclick = () => run(root);
}

function drawCard(root, t) {
  const el = root.querySelector(`[data-t="${t.key}"]`);
  const s = state[t.key];
  const hs = headersOf(t);
  const rows = dataRows(t);
  const mapped = rows.map((r) => mapRow(t, r));
  const bad = mapped.filter((m) => m.problem).length;
  el.innerHTML = `
    <h2>${icon(t.iconName)} ${esc(t.title)} <small class="muted">(${esc(t.key)}.csv)</small></h2>
    <div class="file-row">
      <label class="btn btn-secondary">${icon('upload')} בחירת קובץ<input type="file" accept=".csv,text/csv,text/plain" hidden></label>
      <span class="file-name">${esc(s.fileName || 'לא נבחר קובץ')}</span>
      ${s.rows ? `<label class="switch"><input type="checkbox" data-header ${s.headerRow ? 'checked' : ''}><span class="switch-ui"></span><span>שורה ראשונה = כותרות</span></label>` : ''}
    </div>
    ${s.rows ? `
      <details ${t.fields.some((f) => f.required && s.map[f.key] == null) ? 'open' : ''}>
        <summary class="link-btn">התאמת עמודות</summary>
        <div class="map-grid">
          ${t.fields.map((f) => `
            <label class="field"><span>${esc(f.label)}</span>
              <select class="input" data-field="${esc(f.key)}">
                <option value="">— לא לייבא —</option>
                ${hs.map((h, i) => `<option value="${i}" ${s.map[f.key] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}
              </select>
            </label>`).join('')}
          ${t.extra ? `
            <label class="field"><span>${t.extra === 'insurance' ? 'סוג ביטוח כשאין עמודת סוג' : 'לאיזה תאריך תוקף לייבא'}</span>
              <select class="input" data-default>
                ${(t.extra === 'insurance' ? VEHICLE_ITEMS.filter((i) => i.key.startsWith('insurance')) : VEHICLE_ITEMS)
                  .map((i) => `<option value="${i.key}" ${s.defaultItem === i.key ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}
              </select>
            </label>` : ''}
        </div>
      </details>
      <div class="import-summary">
        <span class="chip chip-valid">${rows.length - bad} שורות תקינות</span>
        ${bad ? `<span class="chip chip-expired">${bad} שורות עם בעיה (לא ייובאו)</span>` : ''}
      </div>
      <div class="preview-wrap">${previewTable(t, mapped.slice(0, 8))}</div>` : ''}`;

  el.querySelector('input[type=file]').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1255').decode(buf); // Hebrew Windows encoding
    s.rows = parseCsv(text);
    s.fileName = `${f.name} · ${s.rows.length} שורות`;
    s.map = guessMap(t);
    drawCard(root, t);
    updateRun(root);
  };
  el.querySelector('[data-header]')?.addEventListener('change', (e) => {
    s.headerRow = e.target.checked;
    s.map = guessMap(t);
    drawCard(root, t);
    updateRun(root);
  });
  el.querySelectorAll('[data-field]').forEach((sel) => {
    sel.onchange = () => {
      if (sel.value === '') delete s.map[sel.dataset.field]; else s.map[sel.dataset.field] = Number(sel.value);
      drawCard(root, t);
      updateRun(root);
    };
  });
  el.querySelector('[data-default]')?.addEventListener('change', (e) => { s.defaultItem = e.target.value; drawCard(root, t); });
}

function previewTable(t, mapped) {
  if (!mapped.length) return '<p class="muted" style="padding:10px">אין שורות</p>';
  let cols;
  if (t.key === 'vehicles') cols = [['plate', 'מספר רישוי'], ['vehicle_type', 'סוג'], ['manufacturer', 'יצרן'], ['model', 'דגם'], ['year', 'שנה'], ['dates', 'תאריכים']];
  else if (t.key === 'drivers') cols = [['full_name', 'שם'], ['id_number', 'ת"ז'], ['phone', 'טלפון'], ['regulation_84', 'תקנה 84'], ['dates', 'תאריכים']];
  else cols = [['vehicle', 'רכב'], ['item', 'פריט'], ['date', 'תוקף']];
  const fmt = (k, v) => {
    if (k === 'dates') return Object.entries(v).map(([key, d]) => `${[...VEHICLE_ITEMS, ...DRIVER_ITEMS].find((i) => i.key === key)?.label}: ${fmtDate(d)}`).join(', ');
    if (k === 'date') return fmtDate(v);
    if (k === 'item') return VEHICLE_ITEMS.find((i) => i.key === v)?.label || v;
    if (k === 'regulation_84') return v == null ? '' : v ? 'יש' : 'אין';
    return v ?? '';
  };
  return `<table class="preview"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${mapped.map(({ rec, problem }) => `<tr class="${problem ? 'bad' : ''}">${cols.map(([k]) => `<td>${esc(fmt(k, rec[k]))}</td>`).join('')}<td>${esc(problem)}</td></tr>`).join('')}</tbody></table>`;
}

function updateRun(root) {
  $('[data-run]', root).disabled = !TABLES.some((t) => state[t.key].rows);
}

// ---------- import ----------
async function run(root) {
  const btn = $('[data-run]', root);
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span> מייבא…';
  const logBox = $('[data-log]', root);
  logBox.hidden = false;
  const log = (ok, text) => {
    $('.import-log', logBox).insertAdjacentHTML('beforeend', `<li class="${ok ? 'ok' : 'err'}">${icon(ok ? 'check' : 'alert', 18)} ${esc(text)}</li>`);
  };
  const expiryMap = new Map(); // owner_type:owner_id:item → date (latest wins)
  const addExp = (ownerType, ownerId, key, date) => {
    const k = `${ownerType}:${ownerId}:${key}`;
    if (!expiryMap.has(k) || expiryMap.get(k) < date) expiryMap.set(k, date);
  };

  try {
    // vehicles
    const vt = TABLES[0];
    if (state.vehicles.rows) {
      const recs = dataRows(vt).map((r) => mapRow(vt, r)).filter((m) => !m.problem).map((m) => m.rec);
      const byPlate = new Map();
      recs.forEach((r) => byPlate.set(normPlate(r.plate), r));
      const unique = [...byPlate.values()];
      const { data: existing, error: e0 } = await sb.from('vehicles').select('id,plate');
      if (e0) throw e0;
      const exByPlate = new Map(existing.map((v) => [normPlate(v.plate), v]));
      for (const r of unique) {
        const { dates, ...row } = r;
        const ex = exByPlate.get(normPlate(r.plate));
        const q = ex ? sb.from('vehicles').update(row).eq('id', ex.id).select().single()
          : sb.from('vehicles').insert(row).select().single();
        const { data, error } = await q;
        if (error) { log(false, `רכב ${r.plate}: ${errText(error)}`); continue; }
        for (const [k, d] of Object.entries(dates)) addExp('vehicle', data.id, k, d);
      }
      log(true, `${unique.length} רכבים יובאו`);
    }

    // drivers
    const dt = TABLES[1];
    if (state.drivers.rows) {
      const recs = dataRows(dt).map((r) => mapRow(dt, r)).filter((m) => !m.problem).map((m) => m.rec);
      const { data: existing, error: e0 } = await sb.from('drivers').select('id,full_name,id_number,legacy_id');
      if (e0) throw e0;
      let n = 0;
      for (const r of recs) {
        const { dates, regulation_84: reg, ...row } = r;
        const ex = existing.find((d) => (r.legacy_id && d.legacy_id === r.legacy_id)
          || (r.id_number && d.id_number === r.id_number) || d.full_name === r.full_name);
        const q = ex ? sb.from('drivers').update(row).eq('id', ex.id).select().single()
          : sb.from('drivers').insert(row).select().single();
        const { data, error } = await q;
        if (error) { log(false, `נהג ${r.full_name}: ${errText(error)}`); continue; }
        if (!ex) existing.push(data);
        n++;
        if (reg != null) await sb.from('driver_flags').upsert({ driver_id: data.id, regulation_84: reg }, { onConflict: 'driver_id' });
        for (const [k, d] of Object.entries(dates)) addExp('driver', data.id, k, d);
      }
      log(true, `${n} נהגים יובאו`);
    }

    // insurance + tests
    const { data: allVehicles, error: e1 } = await sb.from('vehicles').select('id,plate,legacy_id');
    if (e1) throw e1;
    const findVehicle = (ref) => {
      const s = String(ref || '').trim();
      return allVehicles.find((v) => v.legacy_id && v.legacy_id === s)
        || allVehicles.find((v) => normPlate(v.plate) === normPlate(s));
    };
    for (const t of TABLES.slice(2)) {
      if (!state[t.key].rows) continue;
      let n = 0, miss = 0;
      for (const { rec, problem } of dataRows(t).map((r) => mapRow(t, r))) {
        if (problem) continue;
        const v = findVehicle(rec.vehicle);
        if (!v) { miss++; continue; }
        addExp('vehicle', v.id, rec.item, rec.date);
        n++;
      }
      log(true, `${t.title}: ${n} תאריכים${miss ? ` (${miss} שורות בלי רכב תואם — לא יובאו)` : ''}`);
      if (miss) log(false, `${t.title}: ${miss} שורות לא נמצא להן רכב. ודאו שייבאתם קודם את קובץ הרכבים.`);
    }

    // expiry upsert
    if (expiryMap.size) {
      const rows = [...expiryMap.entries()].map(([k, date]) => {
        const [owner_type, owner_id, item_key] = k.split(':');
        return { owner_type, owner_id, item_key, expiry_date: date };
      });
      const { error } = await sb.from('expiry_items').upsert(rows, { onConflict: 'owner_type,owner_id,item_key' });
      if (error) throw error;
      log(true, `${rows.length} תאריכי תוקף נשמרו`);
    }
    toast('הייבוא הסתיים');
  } catch (e) {
    log(false, errText(e));
    toast(errText(e), 'err');
  }
  btn.disabled = false;
  btn.innerHTML = `${icon('upload')} ייבוא`;
  logBox.scrollIntoView({ behavior: 'smooth' });
}

// ---------- boot (auth-protected) ----------
(async () => {
  const root = $('.import-view');
  if (!configured) { root.innerHTML = '<div class="card">המערכת לא הוגדרה (config.js)</div>'; return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.replace('./index.html'); return; }
  render(root);
})();
