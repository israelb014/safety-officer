import { store, flagsOf, vehicleById } from '../db.js';
import { icon } from '../icons.js';
import { esc, ring, emptyState } from '../ui.js';
import { pageHead } from './common.js';
import { ownerSummary } from './vehicles.js';

let showInactive = false;
let search = '';

export function render(root) {
  const draw = () => {
    const q = search.trim();
    const list = store.drivers
      .filter((d) => showInactive || d.active !== false)
      .filter((d) => !q || `${d.full_name} ${d.phone || ''} ${d.id_number || ''}`.includes(q));
    const inactiveCount = store.drivers.filter((d) => d.active === false).length;
    root.querySelector('.list').innerHTML = list.length ? list.map(card).join('')
      : emptyState('users', store.drivers.length ? 'לא נמצאו נהגים' : 'עדיין אין נהגים', store.drivers.length ? '' : 'הוסיפו את הנהג הראשון',
        store.drivers.length ? '' : `<a class="btn btn-primary" href="#/driver/new">${icon('plus')} הוספת נהג</a>`);
    root.querySelector('.inactive-toggle').hidden = !inactiveCount;
  };

  root.innerHTML = `
    ${pageHead({ title: 'נהגים', sub: `${store.drivers.filter((d) => d.active !== false).length} נהגים פעילים`, actions: `<a class="btn btn-primary" href="#/driver/new">${icon('plus')} נהג חדש</a>` })}
    <div class="toolbar">
      <label class="search">${icon('search', 20)}<input class="input" type="search" placeholder="חיפוש לפי שם או טלפון" value="${esc(search)}"></label>
      <label class="switch inactive-toggle"><input type="checkbox" ${showInactive ? 'checked' : ''}><span class="switch-ui"></span><span>הצגת לא פעילים</span></label>
    </div>
    <div class="grid list"></div>`;
  root.querySelector('.search input').oninput = (e) => { search = e.target.value; draw(); };
  root.querySelector('.inactive-toggle input').onchange = (e) => { showInactive = e.target.checked; draw(); };
  draw();
}

function card(d) {
  const s = ownerSummary('driver', d);
  const reg84 = flagsOf(d.id).regulation_84;
  const veh = d.default_vehicle_id ? vehicleById(d.default_vehicle_id) : null;
  return `
    <article class="card list-card status-${s.status} ${d.active === false ? 'inactive' : ''}">
      <a class="list-card-main card-link" href="#/driver/${d.id}">
        <p class="driver-name">${esc(d.full_name)}</p>
        <div class="chips">
          <span class="chip ${reg84 ? 'chip-valid' : 'chip-none'}">תקנה 84: ${reg84 ? 'יש' : 'אין'}</span>
          ${veh ? `<span class="chip chip-plain" dir="ltr">${esc(veh.plate)}</span>` : ''}
          ${d.active === false ? '<span class="chip chip-none">לא פעיל</span>' : ''}
          ${s.missing ? `<span class="chip chip-none">${s.missing} ללא תאריך</span>` : ''}
        </div>
      </a>
      <div class="list-card-side">
        ${ring(s.status, s.days, 68)}
        ${d.phone ? `<a class="call-btn" href="tel:${esc(d.phone.replace(/[^\d+]/g, ''))}" aria-label="התקשרות ל${esc(d.full_name)}">${icon('phone', 20)}<span dir="ltr">${esc(d.phone)}</span></a>` : ''}
      </div>
    </article>`;
}
