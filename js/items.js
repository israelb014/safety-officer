// Shared definitions — imported by the browser app AND by scripts/daily.mjs (Node).
// Keep this file free of DOM/browser APIs.
// To add a new expiry type: add one line to the relevant list below.

export const VEHICLE_ITEMS = [
  { key: 'vehicle_license', label: 'תוקף רישיון רכב' },
  { key: 'insurance_mandatory', label: 'ביטוח חובה' },
  { key: 'insurance_comprehensive', label: "ביטוח מקיף / צד ג'" },
  { key: 'fire_extinguisher', label: 'מטף כיבוי אש' },
  { key: 'winter_check', label: 'בדיקת חורף' },
];

// Shown only when vehicle_type === 'bus'
export const BUS_ITEMS = [
  { key: 'bus_brakes', label: 'בדיקת בלמים פניאומטיים' },
  { key: 'tachograph_calibration', label: 'כיול טכוגרף' },
  { key: 'engine_fire_system', label: 'מערכת כיבוי אש אוטומטית בתא מנוע' },
  { key: 'speed_limiter', label: 'מגביל מהירות' },
  { key: 'emergency_exits', label: 'פטישי חירום ויציאות חירום' },
  { key: 'first_aid_kit', label: 'ערכת עזרה ראשונה' },
];

export const DRIVER_ITEMS = [
  { key: 'driving_license', label: 'רישיון נהיגה' },
  { key: 'police_clearance', label: 'אישור משטרה' },
  { key: 'training_summer', label: 'אישור הדרכה קיץ' },
  { key: 'training_winter', label: 'אישור הדרכה חורף' },
];

// Document slots that are not expiry items
export const EXTRA_SLOTS = [
  { key: 'regulation_84', label: 'תקנה 84' },
  { key: 'receipt', label: 'קבלה' },
];

export const VEHICLE_TYPES = [
  { key: 'minibus', label: 'מיניבוס' },
  { key: 'van', label: 'ואן' },
  { key: 'bus', label: 'אוטובוס' },
  { key: 'private', label: 'רכב פרטי' },
  { key: 'other', label: 'אחר' },
];

export const SERVICE_TYPES = [
  { key: 'periodic', label: 'טיפול תקופתי' },
  { key: 'tires', label: 'צמיגים' },
  { key: 'brakes', label: 'בלמים' },
  { key: 'battery', label: 'מצבר' },
  { key: 'ac', label: 'מיזוג' },
  { key: 'repair', label: 'תיקון' },
  { key: 'other', label: 'אחר' },
];

export const DEFAULT_LEAD_DAYS = [30, 14, 7, 1, 0];
export const EXPIRING_WINDOW = 30; // days — orange threshold
export const DEFAULT_SERVICE_DAYS = 14;
export const DEFAULT_SERVICE_KM = 1000;

const ALL = [...VEHICLE_ITEMS, ...BUS_ITEMS, ...DRIVER_ITEMS, ...EXTRA_SLOTS];
const LABELS = Object.fromEntries(ALL.map((i) => [i.key, i.label]));

export function labelOf(key) {
  return LABELS[key] || key;
}
export function vehicleTypeLabel(key) {
  return VEHICLE_TYPES.find((t) => t.key === key)?.label || 'אחר';
}
export function serviceTypeLabel(key) {
  return SERVICE_TYPES.find((t) => t.key === key)?.label || 'אחר';
}

/** Expiry items that apply to an owner. */
export function itemsFor(ownerType, vehicleType) {
  if (ownerType === 'driver') return DRIVER_ITEMS;
  return vehicleType === 'bus' ? [...VEHICLE_ITEMS, ...BUS_ITEMS] : VEHICLE_ITEMS;
}

// ---------- dates (all as 'YYYY-MM-DD' strings, timezone-safe) ----------

/** Today's date in Israel as YYYY-MM-DD. */
export function todayISO(tz = 'Asia/Jerusalem') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA gives YYYY-MM-DD
}

function toUTC(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `fromIso` to `toIso` (positive = future). */
export function daysBetween(fromIso, toIso) {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** DD/MM/YYYY */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ---------- status ----------

/** 'expired' | 'expiring' | 'valid' | 'none' */
export function statusOf(expiryIso, today = todayISO()) {
  if (!expiryIso) return 'none';
  const d = daysBetween(today, expiryIso);
  if (d < 0) return 'expired';
  if (d <= EXPIRING_WINDOW) return 'expiring';
  return 'valid';
}

export const STATUS_LABEL = {
  expired: 'פג תוקף',
  expiring: 'עומד לפוג',
  valid: 'תקין',
  none: 'אין תאריך',
};

const RANK = { expired: 3, expiring: 2, valid: 1, none: 0 };

/** Worst status among a list of statuses. */
export function worstStatus(statuses) {
  let worst = 'none';
  for (const s of statuses) if (RANK[s] > RANK[worst]) worst = s;
  return worst;
}

/** Hebrew "days left" text. */
export function daysText(days) {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === -1) return 'פג אתמול';
  if (days < 0) return `פג לפני ${-days} ימים`;
  return `עוד ${days} ימים`;
}

/**
 * Builds the list of applicable expiry entries for active owners.
 * vehicles/drivers: rows; expiry: rows of expiry_items.
 * Returns [{ownerType, ownerId, ownerName, key, label, date, days, status}]
 */
export function collectExpiries({ vehicles, drivers, expiry, today = todayISO() }) {
  const byOwner = new Map();
  for (const e of expiry) byOwner.set(`${e.owner_type}:${e.owner_id}:${e.item_key}`, e);
  const out = [];
  const push = (ownerType, owner, name, items) => {
    for (const it of items) {
      const e = byOwner.get(`${ownerType}:${owner.id}:${it.key}`);
      const date = e?.expiry_date || null;
      const days = date ? daysBetween(today, date) : null;
      out.push({
        ownerType, ownerId: owner.id, ownerName: name, key: it.key, label: it.label,
        date, days, status: statusOf(date, today),
      });
    }
  };
  for (const v of vehicles) if (v.active !== false) push('vehicle', v, v.plate, itemsFor('vehicle', v.vehicle_type));
  for (const d of drivers) if (d.active !== false) push('driver', d, d.full_name, DRIVER_ITEMS);
  return out;
}

/** Latest "next service" info per vehicle. */
export function nextServiceFor(vehicle, services, today = todayISO(),
  limits = { days: DEFAULT_SERVICE_DAYS, km: DEFAULT_SERVICE_KM }) {
  const list = services
    .filter((s) => s.vehicle_id === vehicle.id && (s.next_date || s.next_km))
    .sort((a, b) => (b.service_date || '').localeCompare(a.service_date || ''));
  const s = list[0];
  if (!s) return null;
  const daysLeft = s.next_date ? daysBetween(today, s.next_date) : null;
  const kmLeft = s.next_km != null && vehicle.current_km != null ? s.next_km - vehicle.current_km : null;
  const due = (daysLeft != null && daysLeft <= limits.days) || (kmLeft != null && kmLeft <= limits.km);
  return { service: s, nextDate: s.next_date, nextKm: s.next_km, daysLeft, kmLeft, due };
}

/** Days of the current month (1..yesterday) with no check mark. */
export function missingTachoDays(vehicleId, days, today = todayISO()) {
  const [y, m, d] = today.split('-').map(Number);
  const checked = new Set(
    days.filter((r) => r.vehicle_id === vehicleId && r.checked).map((r) => r.day),
  );
  const missing = [];
  for (let i = 1; i < d; i++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    if (!checked.has(iso)) missing.push(iso);
  }
  return missing;
}

export function formatPlate(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === s.replace(/[\s\-.]/g, '').length) {
    if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return s;
}
