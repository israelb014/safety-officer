import { store, vehicleById, docsOf } from '../db.js';
import { icon } from '../icons.js';
import { esc, emptyState, money, num, plateBox } from '../ui.js';
import { fmtDate, serviceTypeLabel, nextServiceFor, todayISO, daysText } from '../items.js';
import { pageHead, selectOptions } from './common.js';
import { navigate } from '../nav.js';

export function render(root, _params, query) {
  const vehicleId = query.vehicle || '';
  const vehicles = store.vehicles
    .filter((v) => v.active !== false || store.services.some((s) => s.vehicle_id === v.id))
    .map((v) => ({ key: v.id, label: v.plate }));
  const list = store.services
    .filter((s) => !vehicleId || s.vehicle_id === vehicleId)
    .sort((a, b) => (b.service_date || '').localeCompare(a.service_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));

  const veh = vehicleId ? vehicleById(vehicleId) : null;
  const year = todayISO().slice(0, 4);
  const yearCost = list.filter((s) => s.service_date?.startsWith(year)).reduce((t, s) => t + Number(s.cost || 0), 0);
  const next = veh ? nextServiceFor(veh, store.services, todayISO(), {
    days: store.settings?.service_days ?? 14, km: store.settings?.service_km ?? 1000,
  }) : null;

  root.innerHTML = `
    ${pageHead({ title: 'טיפולים', actions: `<a class="btn btn-primary" href="#/service/new${vehicleId ? `?vehicle=${vehicleId}` : ''}">${icon('plus')} טיפול חדש</a>` })}
    <div class="toolbar">
      <label class="field filter">${icon('car', 20)}
        <select class="input" name="vehicle">${selectOptions(vehicles, vehicleId, { empty: 'כל הרכבים' })}</select>
      </label>
    </div>
    ${veh ? `
      <section class="card vehicle-summary">
        <div class="vs-head">${plateBox(veh.plate)}<span class="muted">${veh.current_km != null ? `${num(veh.current_km)} ק"מ` : ''}</span></div>
        <div class="stats">
          <div class="stat"><span>עלות ${year}</span><b>${money(yearCost) || '₪0'}</b></div>
          <div class="stat"><span>טיפולים</span><b>${list.length}</b></div>
          <div class="stat ${next?.due ? 'stat-warn' : ''}"><span>טיפול הבא</span><b>${next
            ? [next.nextDate ? `${fmtDate(next.nextDate)}` : '', next.nextKm ? `${num(next.nextKm)} ק"מ` : ''].filter(Boolean).join(' / ')
            : '—'}</b>${next?.nextDate ? `<small>${daysText(next.daysLeft)}</small>` : ''}</div>
        </div>
      </section>` : ''}
    <div class="${veh ? 'timeline' : 'grid'} list">
      ${list.length ? list.map((s) => (veh ? timelineItem(s) : card(s))).join('')
        : emptyState('wrench', 'אין טיפולים רשומים', '', `<a class="btn btn-primary" href="#/service/new${vehicleId ? `?vehicle=${vehicleId}` : ''}">${icon('plus')} רישום טיפול</a>`)}
    </div>`;

  root.querySelector('select[name=vehicle]').onchange = (e) => {
    navigate(e.target.value ? `#/services?vehicle=${e.target.value}` : '#/services');
  };
}

function receiptBadge(s) {
  return docsOf('service', s.id, 'receipt').some((d) => d.is_current) ? `<span class="chip chip-plain">${icon('paperclip', 14)} קבלה</span>` : '';
}

function card(s) {
  const v = vehicleById(s.vehicle_id);
  return `
    <a class="card service-card" href="#/service/${s.id}">
      <div class="sc-top">
        <span class="sc-date">${icon('calendar', 18)} ${fmtDate(s.service_date)}</span>
        ${v ? plateBox(v.plate, true) : ''}
      </div>
      <h3>${esc(serviceTypeLabel(s.service_type))}</h3>
      <p class="muted">${[s.km != null ? `${num(s.km)} ק"מ` : '', s.garage ? esc(s.garage) : ''].filter(Boolean).join(' · ')}</p>
      ${s.description ? `<p class="sc-desc">${esc(s.description)}</p>` : ''}
      <div class="sc-bottom">${s.cost != null ? `<b class="sc-cost">${money(s.cost)}</b>` : '<span></span>'}${receiptBadge(s)}</div>
    </a>`;
}

function timelineItem(s) {
  return `
    <a class="tl-item" href="#/service/${s.id}">
      <span class="tl-dot">${icon('wrench', 16)}</span>
      <div class="card tl-card">
        <div class="sc-top"><span class="sc-date">${fmtDate(s.service_date)}</span>${s.cost != null ? `<b class="sc-cost">${money(s.cost)}</b>` : ''}</div>
        <h3>${esc(serviceTypeLabel(s.service_type))}</h3>
        <p class="muted">${[s.km != null ? `${num(s.km)} ק"מ` : '', s.garage ? esc(s.garage) : ''].filter(Boolean).join(' · ')}</p>
        ${s.description ? `<p class="sc-desc">${esc(s.description)}</p>` : ''}
        ${receiptBadge(s)}
      </div>
    </a>`;
}
