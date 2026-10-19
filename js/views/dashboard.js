import { store } from '../db.js';
import { icon } from '../icons.js';
import { esc, ring, statusChip, plateBox, num } from '../ui.js';
import {
  collectExpiries, todayISO, fmtDate, daysText, nextServiceFor, missingTachoDays,
} from '../items.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

export function render(root) {
  const today = todayISO();
  const all = collectExpiries({ vehicles: store.vehicles, drivers: store.drivers, expiry: store.expiry, today });
  const counts = { expired: 0, expiring: 0, valid: 0 };
  for (const e of all) if (counts[e.status] != null) counts[e.status]++;
  const due = all.filter((e) => e.status === 'expired' || e.status === 'expiring')
    .sort((a, b) => a.date.localeCompare(b.date));

  const limits = { days: store.settings?.service_days ?? 14, km: store.settings?.service_km ?? 1000 };
  const active = store.vehicles.filter((v) => v.active !== false);
  const serviceDue = active.map((v) => ({ v, n: nextServiceFor(v, store.services, today, limits) }))
    .filter((x) => x.n?.due);
  const tachoMissing = active.filter((v) => v.vehicle_type === 'bus')
    .map((v) => ({ v, missing: missingTachoDays(v.id, store.tachoMonth, today) }))
    .filter((x) => x.missing.length);

  const total = due.length + serviceDue.length + tachoMissing.length;
  const dateStr = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  root.innerHTML = `
    <section class="hero">
      <p class="hero-date">${esc(dateStr)}</p>
      <h1>${greeting()}</h1>
      <p class="hero-sub">${total ? `יש <b>${total}</b> פריטים לטיפול` : 'הכל תקין. אין פריטים לטיפול'}</p>
    </section>

    <section class="counters">
      <button type="button" class="counter counter-expired" data-jump>${icon('alert', 26)}<b>${counts.expired}</b><span>פג תוקף</span></button>
      <button type="button" class="counter counter-expiring" data-jump>${icon('clock', 26)}<b>${counts.expiring}</b><span>עומד לפוג</span></button>
      <div class="counter counter-valid">${icon('check', 26)}<b>${counts.valid}</b><span>תקין</span></div>
    </section>

    ${!store.vehicles.length && !store.drivers.length ? `
      <section class="card onboarding">
        <h2>מתחילים</h2>
        <p>הוסיפו את הרכבים והנהגים. אחרי זה המערכת תתריע לבד לפני שמשהו פג.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/vehicle/new">${icon('plus')} הוספת רכב</a>
          <a class="btn btn-secondary" href="#/driver/new">${icon('plus')} הוספת נהג</a>
        </div>
      </section>` : ''}

    ${due.length ? `<h2 class="section-title" id="due-title">תאריכי תוקף לטיפול</h2>
      <div class="grid">${due.map(dueCard).join('')}</div>` : ''}

    ${tachoMissing.length ? `<h2 class="section-title">יומן טכוגרף — ימים שלא סומנו</h2>
      <div class="grid">${tachoMissing.map(({ v, missing }) => `
        <article class="card item-card status-expiring">
          <div class="item-main">
            <div class="item-icon">${icon('tacho', 28)}</div>
            <div class="item-text">
              <h3>יומן טכוגרף</h3>
              <div class="item-owner">${plateBox(v.plate, true)}</div>
              <p class="item-date">${missing.length === 1 ? `יום אחד לא סומן (${fmtDate(missing[0])})` : `${missing.length} ימים לא סומנו החודש`}</p>
            </div>
          </div>
          <a class="btn btn-primary btn-block" href="#/tacho/${v.id}">${icon('edit')} עדכון</a>
        </article>`).join('')}</div>` : ''}

    ${serviceDue.length ? `<h2 class="section-title">טיפול הבא מתקרב</h2>
      <div class="grid">${serviceDue.map(({ v, n }) => `
        <article class="card item-card ${(n.daysLeft != null && n.daysLeft < 0) || (n.kmLeft != null && n.kmLeft < 0) ? 'status-expired' : 'status-expiring'}">
          <div class="item-main">
            <div class="item-icon">${icon('wrench', 28)}</div>
            <div class="item-text">
              <h3>טיפול הבא</h3>
              <div class="item-owner">${plateBox(v.plate, true)}</div>
              <p class="item-date">
                ${n.nextDate ? `${fmtDate(n.nextDate)} · ${daysText(n.daysLeft)}` : ''}
                ${n.nextDate && n.nextKm ? '<br>' : ''}
                ${n.nextKm ? `ב-${num(n.nextKm)} ק"מ${n.kmLeft != null ? ` · ${n.kmLeft < 0 ? `עבר ב-${num(-n.kmLeft)}` : `נותרו ${num(n.kmLeft)}`} ק"מ` : ''}` : ''}
              </p>
            </div>
          </div>
          <a class="btn btn-primary btn-block" href="#/service/new?vehicle=${v.id}">${icon('plus')} רישום טיפול</a>
        </article>`).join('')}</div>` : ''}

    ${!total && (store.vehicles.length || store.drivers.length) ? `
      <div class="all-good card">
        <div class="ring ring-valid" style="width:96px;height:96px">
          <svg viewBox="0 0 64 64" width="96" height="96"><circle cx="32" cy="32" r="26" class="ring-bg"/><circle cx="32" cy="32" r="26" class="ring-fg" stroke-dasharray="163.4" stroke-dashoffset="0" transform="rotate(-90 32 32)"/></svg>
          <div class="ring-text">${icon('check', 40)}</div>
        </div>
        <h2>הכל תקין</h2>
        <p>אין תאריכים שפגו או עומדים לפוג ב-30 הימים הקרובים.</p>
      </div>` : ''}
  `;
  root.querySelectorAll('[data-jump]').forEach((b) => {
    b.onclick = () => document.getElementById('due-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function dueCard(e) {
  const href = e.ownerType === 'vehicle'
    ? `#/vehicle/${e.ownerId}?focus=${e.key}`
    : `#/driver/${e.ownerId}?focus=${e.key}`;
  return `
    <article class="card item-card status-${e.status}">
      <div class="item-main">
        ${ring(e.status, e.days, 64)}
        <div class="item-text">
          <h3>${esc(e.label)}</h3>
          <div class="item-owner">${e.ownerType === 'vehicle' ? plateBox(e.ownerName, true) : `${icon('user', 18)} <b>${esc(e.ownerName)}</b>`}</div>
          <p class="item-date"><b>${daysText(e.days)}</b>${fmtDate(e.date)}</p>
        </div>
        ${statusChip(e.status)}
      </div>
      <a class="btn btn-primary btn-block" href="${href}">${icon('edit')} עדכון</a>
    </article>`;
}
