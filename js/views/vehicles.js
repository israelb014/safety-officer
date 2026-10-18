import { store, expiryOf, driverById } from '../db.js';
import { icon } from '../icons.js';
import { esc, ring, plateBox, emptyState } from '../ui.js';
import { itemsFor, statusOf, worstStatus, daysBetween, todayISO, vehicleTypeLabel } from '../items.js';
import { pageHead } from './common.js';

/** Worst status + days of the nearest expiry for an owner. */
export function ownerSummary(ownerType, owner, today = todayISO()) {
  const items = itemsFor(ownerType, owner.vehicle_type);
  const dates = items.map((i) => expiryOf(ownerType, owner.id, i.key)?.expiry_date).filter(Boolean);
  const statuses = items.map((i) => statusOf(expiryOf(ownerType, owner.id, i.key)?.expiry_date, today));
  const anyMissing = statuses.includes('none');
  const status = worstStatus(statuses.filter((s) => s !== 'none'));
  const minDays = dates.length ? Math.min(...dates.map((d) => daysBetween(today, d))) : null;
  return { status, days: minDays, missing: anyMissing ? statuses.filter((s) => s === 'none').length : 0 };
}

let showInactive = false;
let search = '';

export function render(root) {
  const draw = () => {
    const q = search.trim().replace(/[-\s]/g, '');
    const list = store.vehicles
      .filter((v) => showInactive || v.active !== false)
      .filter((v) => !q || `${v.plate}${v.manufacturer || ''}${v.model || ''}`.replace(/[-\s]/g, '').includes(q));
    const inactiveCount = store.vehicles.filter((v) => v.active === false).length;
    root.querySelector('.list').innerHTML = list.length ? list.map(card).join('')
      : emptyState('car', store.vehicles.length ? 'לא נמצאו רכבים' : 'עדיין אין רכבים', store.vehicles.length ? '' : 'הוסיפו את הרכב הראשון',
        store.vehicles.length ? '' : `<a class="btn btn-primary" href="#/vehicle/new">${icon('plus')} הוספת רכב</a>`);
    root.querySelector('.inactive-toggle').hidden = !inactiveCount;
  };

  root.innerHTML = `
    ${pageHead({ title: 'רכבים', sub: `${store.vehicles.filter((v) => v.active !== false).length} רכבים פעילים`, actions: `<a class="btn btn-primary" href="#/vehicle/new">${icon('plus')} רכב חדש</a>` })}
    <div class="toolbar">
      <label class="search">${icon('search', 20)}<input class="input" type="search" placeholder="חיפוש לפי מספר רישוי" value="${esc(search)}" inputmode="numeric"></label>
      <label class="switch inactive-toggle"><input type="checkbox" ${showInactive ? 'checked' : ''}><span class="switch-ui"></span><span>הצגת לא פעילים</span></label>
    </div>
    <div class="grid list"></div>`;
  root.querySelector('.search input').oninput = (e) => { search = e.target.value; draw(); };
  root.querySelector('.inactive-toggle input').onchange = (e) => { showInactive = e.target.checked; draw(); };
  draw();
}

function card(v) {
  const s = ownerSummary('vehicle', v);
  const drv = v.default_driver_id ? driverById(v.default_driver_id) : null;
  return `
    <a class="card list-card status-${s.status} ${v.active === false ? 'inactive' : ''}" href="#/vehicle/${v.id}">
      <div class="list-card-main">
        ${plateBox(v.plate)}
        <p class="list-card-title">${icon(v.vehicle_type === 'bus' ? 'bus' : 'car', 18)} ${esc(vehicleTypeLabel(v.vehicle_type))}${v.manufacturer || v.model ? ` · ${esc([v.manufacturer, v.model].filter(Boolean).join(' '))}` : ''}</p>
        ${drv ? `<p class="muted">${icon('user', 16)} ${esc(drv.full_name)}</p>` : ''}
        ${v.active === false ? '<span class="chip chip-none">לא פעיל</span>' : ''}
        ${s.missing ? `<span class="chip chip-none">${s.missing} ללא תאריך</span>` : ''}
      </div>
      ${ring(s.status, s.days, 68)}
    </a>`;
}
