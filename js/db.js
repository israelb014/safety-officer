// Supabase client + a small in-memory store (the data set is small: tens of vehicles/drivers).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { DEFAULT_LEAD_DAYS } from './items.js';

export const configured = !/YOUR-/.test(SUPABASE_URL + SUPABASE_ANON_KEY);

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  : null;

export const BUCKET = 'documents';

// ---------- store ----------
export const store = {
  vehicles: [],
  drivers: [],
  expiry: [],
  flags: [],
  services: [],
  documents: [],
  pages: [],
  tachoMonth: [], // current-month tachograph rows (for dashboard)
  settings: null,
  loaded: false,
};

function ok({ data, error }) {
  if (error) throw error;
  return data;
}

const TABLES = {
  vehicles: () => sb.from('vehicles').select('*').order('plate'),
  drivers: () => sb.from('drivers').select('*').order('full_name'),
  expiry: () => sb.from('expiry_items').select('*'),
  flags: () => sb.from('driver_flags').select('*'),
  services: () => sb.from('services').select('*').order('service_date', { ascending: false }),
  documents: () => sb.from('documents').select('*').order('created_at', { ascending: false }),
  pages: () => sb.from('document_pages').select('*').order('page_no'),
};

export async function load(...names) {
  const list = names.length ? names : Object.keys(TABLES);
  const res = await Promise.all(list.map((n) => TABLES[n]().then(ok)));
  list.forEach((n, i) => { store[n] = res[i] || []; });
}

export async function loadTachoMonth(todayIso) {
  const start = `${todayIso.slice(0, 7)}-01`;
  store.tachoMonth = ok(await sb.from('tachograph_days').select('*').gte('day', start).lte('day', todayIso));
}

export async function loadSettings() {
  const rows = ok(await sb.from('settings').select('*').eq('id', 1));
  let s = rows?.[0];
  if (!s) {
    s = ok(await sb.from('settings').insert({ id: 1 }).select().single());
  }
  if (!s.ntfy_topic) {
    s = ok(await sb.from('settings').update({ ntfy_topic: randomTopic() }).eq('id', 1).select().single());
  }
  if (!Array.isArray(s.lead_days) || !s.lead_days.length) s.lead_days = DEFAULT_LEAD_DAYS;
  store.settings = s;
  return s;
}

export async function loadAll(todayIso) {
  await Promise.all([load(), loadSettings(), loadTachoMonth(todayIso)]);
  store.loaded = true;
}

export function randomTopic(len = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => chars[x % chars.length]).join('');
}

// ---------- lookups ----------
export const vehicleById = (id) => store.vehicles.find((v) => v.id === id);
export const driverById = (id) => store.drivers.find((d) => d.id === id);

export function expiryOf(ownerType, ownerId, key) {
  return store.expiry.find((e) => e.owner_type === ownerType && e.owner_id === ownerId && e.item_key === key);
}

export function flagsOf(driverId) {
  return store.flags.find((f) => f.driver_id === driverId) || { driver_id: driverId, regulation_84: false };
}

export function docsOf(ownerType, ownerId, slotKey) {
  return store.documents.filter((d) => d.owner_type === ownerType && d.owner_id === ownerId
    && (slotKey == null || d.slot_key === slotKey));
}

export function pagesOf(docId) {
  return store.pages.filter((p) => p.document_id === docId).sort((a, b) => a.page_no - b.page_no);
}

// ---------- writes ----------
export async function saveRow(table, row) {
  if (row.id) {
    const { id, ...rest } = row;
    return ok(await sb.from(table).update(rest).eq('id', id).select().single());
  }
  return ok(await sb.from(table).insert(row).select().single());
}

export async function deleteRow(table, id) {
  ok(await sb.from(table).delete().eq('id', id));
}

/** Upsert/clear expiry dates for an owner. dates: {item_key: 'YYYY-MM-DD'|''} */
export async function saveExpiries(ownerType, ownerId, dates) {
  const upserts = [];
  const clears = [];
  for (const [key, val] of Object.entries(dates)) {
    const cur = expiryOf(ownerType, ownerId, key);
    if (val) {
      if (cur?.expiry_date !== val) upserts.push({ owner_type: ownerType, owner_id: ownerId, item_key: key, expiry_date: val });
    } else if (cur) clears.push(key);
  }
  if (upserts.length) {
    ok(await sb.from('expiry_items').upsert(upserts, { onConflict: 'owner_type,owner_id,item_key' }));
  }
  if (clears.length) {
    ok(await sb.from('expiry_items').delete().eq('owner_type', ownerType).eq('owner_id', ownerId).in('item_key', clears));
  }
  if (upserts.length || clears.length) await load('expiry');
}

export async function saveFlags(driverId, regulation84) {
  ok(await sb.from('driver_flags').upsert({ driver_id: driverId, regulation_84: !!regulation84 }, { onConflict: 'driver_id' }));
  await load('flags');
}

export async function storageUsedBytes() {
  return store.pages.reduce((s, p) => s + Number(p.size_bytes || 0), 0);
}
