// Daily job (GitHub Actions): builds ONE digest of everything that needs attention,
// sends it to ntfy, logs it, and cleans up old archived documents.
// Node 20+, no npm dependencies.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required)
//      NTFY_TOPIC (optional fallback if settings.ntfy_topic is empty)
//      APP_URL    (optional, default https://israelb014.github.io/safety-officer/)
//      DRY_RUN=1  (optional: print the digest, send nothing, write nothing)

import {
  collectExpiries, nextServiceFor, todayISO, addDays, fmtDate, daysText,
  DEFAULT_LEAD_DAYS, DEFAULT_SERVICE_DAYS, DEFAULT_SERVICE_KM,
} from '../js/items.js';
import { ntfyPublish } from '../js/ntfy.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const APP_URL = process.env.APP_URL || 'https://israelb014.github.io/safety-officer/';
const DRY = process.env.DRY_RUN === '1';
const RETENTION_YEARS = 2;

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const today = todayISO('Asia/Jerusalem');
  const yesterday = addDays(today, -1);
  console.log(`Daily run for ${today}`);

  const [settingsRows, vehicles, drivers, expiry, services, tachoYesterday] = await Promise.all([
    rest('settings?id=eq.1&select=*'),
    rest('vehicles?select=*'),
    rest('drivers?select=*'),
    rest('expiry_items?select=*'),
    rest('services?select=*'),
    rest(`tachograph_days?select=vehicle_id,checked&day=eq.${yesterday}`),
  ]);
  const settings = settingsRows?.[0] || {};
  const topic = settings.ntfy_topic || process.env.NTFY_TOPIC || '';
  const lead = Array.isArray(settings.lead_days) && settings.lead_days.length ? settings.lead_days : DEFAULT_LEAD_DAYS;
  const limits = { days: settings.service_days ?? DEFAULT_SERVICE_DAYS, km: settings.service_km ?? DEFAULT_SERVICE_KM };

  // ---- expiries: lead days before, on the day, and every day after ----
  const due = collectExpiries({ vehicles, drivers, expiry, today })
    .filter((e) => e.date && (e.days < 0 || lead.includes(e.days)))
    .sort((a, b) => a.days - b.days);

  const lines = due.map((e) => `• ${e.label} — ${e.ownerName} — ${daysText(e.days)} (${fmtDate(e.date)})`);

  // ---- next service ----
  const active = vehicles.filter((v) => v.active !== false);
  for (const v of active) {
    const n = nextServiceFor(v, services, today, limits);
    if (!n?.due) continue;
    const parts = [];
    if (n.nextDate) parts.push(`${daysText(n.daysLeft)} (${fmtDate(n.nextDate)})`);
    if (n.kmLeft != null) parts.push(n.kmLeft < 0 ? `עבר ב-${-n.kmLeft} ק"מ` : `נותרו ${n.kmLeft} ק"מ`);
    lines.push(`• טיפול הבא — ${v.plate} — ${parts.join(' / ')}`);
  }

  // ---- tachograph: buses not marked yesterday ----
  const checkedYesterday = new Set(tachoYesterday.filter((r) => r.checked).map((r) => r.vehicle_id));
  for (const v of active.filter((x) => x.vehicle_type === 'bus')) {
    if (!checkedYesterday.has(v.id)) lines.push(`• יומן טכוגרף — ${v.plate} — לא סומן אתמול (${fmtDate(yesterday)})`);
  }

  const urgent = due.some((e) => e.days <= 0);
  const title = `קצין בטיחות — ${lines.length} פריטים לטיפול`;
  const body = lines.join('\n');

  if (!lines.length) {
    console.log('Nothing due today — no message sent.');
  } else if (DRY) {
    console.log(`[DRY RUN] ${title}\n${body}`);
  } else if (!topic) {
    console.error('No ntfy topic — open the app once (it creates the topic) or set NTFY_TOPIC.');
  } else {
    const already = await rest(`notification_log?select=id&kind=eq.digest&status=eq.sent&sent_on=eq.${today}`);
    if (already.length) {
      console.log('Digest already sent today — skipping.');
    } else {
      const priority = urgent ? 'high' : 'default';
      try {
        await ntfyPublish({
          topic, title, body, priority,
          tags: [urgent ? 'rotating_light' : 'warning'],
          click: `${APP_URL}#/home`,
        });
        await rest('notification_log', {
          method: 'POST', prefer: 'return=minimal',
          body: { kind: 'digest', sent_on: today, status: 'sent', title, body, item_count: lines.length, priority },
        });
        console.log(`Sent: ${title}`);
      } catch (e) {
        await rest('notification_log', {
          method: 'POST', prefer: 'return=minimal',
          body: { kind: 'digest', sent_on: today, status: 'error', title, body, item_count: lines.length, priority, error: String(e.message || e).slice(0, 500) },
        }).catch(() => {});
        throw e;
      }
    }
  }

  await retention();
}

// ---- delete archived documents 2 years after they were replaced ----
async function retention() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  const old = await rest(`documents?select=id&is_current=eq.false&replaced_at=lt.${encodeURIComponent(cutoff.toISOString())}`);
  if (!old.length) { console.log('Retention: nothing to delete.'); return; }
  const ids = old.map((d) => d.id);
  const pages = await rest(`document_pages?select=storage_path&document_id=in.(${ids.join(',')})`);
  console.log(`Retention: ${ids.length} archived documents, ${pages.length} files`);
  if (DRY) return;
  for (let i = 0; i < pages.length; i += 100) {
    const prefixes = pages.slice(i, i + 100).map((p) => p.storage_path);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/documents`, {
      method: 'DELETE', headers, body: JSON.stringify({ prefixes }),
    });
    if (!res.ok) throw new Error(`storage delete → ${res.status} ${await res.text()}`);
  }
  await rest(`documents?id=in.(${ids.join(',')})`, { method: 'DELETE' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
