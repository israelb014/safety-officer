import { store, vehicleById, driverById, pagesOf } from '../db.js';
import { icon } from '../icons.js';
import { esc, emptyState, plateBox } from '../ui.js';
import { fmtDate, labelOf, serviceTypeLabel } from '../items.js';
import { pageHead } from './common.js';
import { openDocument } from '../docs.js';

const state = { owner: '', slot: '', q: '', history: false };

function ownerInfo(doc) {
  if (doc.owner_type === 'vehicle') {
    const v = vehicleById(doc.owner_id);
    return { text: v?.plate || 'רכב שנמחק', plate: v?.plate, href: v ? `#/vehicle/${v.id}?focus=${doc.slot_key}` : null };
  }
  if (doc.owner_type === 'driver') {
    const d = driverById(doc.owner_id);
    return { text: d?.full_name || 'נהג שנמחק', href: d ? `#/driver/${d.id}?focus=${doc.slot_key}` : null };
  }
  const s = store.services.find((x) => x.id === doc.owner_id);
  const v = s ? vehicleById(s.vehicle_id) : null;
  return {
    text: s ? `${serviceTypeLabel(s.service_type)} ${fmtDate(s.service_date)}${v ? ` · ${v.plate}` : ''}` : 'טיפול שנמחק',
    plate: v?.plate,
    href: s ? `#/service/${s.id}` : null,
  };
}

export function render(root) {
  const owners = [
    ...store.vehicles.map((v) => ({ key: `vehicle:${v.id}`, label: `רכב ${v.plate}` })),
    ...store.drivers.map((d) => ({ key: `driver:${d.id}`, label: `נהג ${d.full_name}` })),
    { key: 'service:*', label: 'כל קבלות הטיפולים' },
  ];
  const slots = [...new Set(store.documents.map((d) => d.slot_key))].map((k) => ({ key: k, label: labelOf(k) }));
  const historyCount = store.documents.filter((d) => !d.is_current).length;

  root.innerHTML = `
    ${pageHead({ title: 'מסמכים', sub: `${store.documents.filter((d) => d.is_current).length} מסמכים נוכחיים · ${historyCount} בהיסטוריה` })}
    <div class="toolbar toolbar-wrap">
      <label class="search">${icon('search', 20)}<input class="input" type="search" placeholder="חיפוש" value="${esc(state.q)}"></label>
      <select class="input" name="owner"><option value="">כל הרכבים והנהגים</option>${owners.map((o) => `<option value="${esc(o.key)}" ${o.key === state.owner ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <select class="input" name="slot"><option value="">כל סוגי המסמכים</option>${slots.map((o) => `<option value="${esc(o.key)}" ${o.key === state.slot ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <label class="switch"><input type="checkbox" name="history" ${state.history ? 'checked' : ''}><span class="switch-ui"></span><span>כולל היסטוריה</span></label>
    </div>
    <p class="muted hint">${icon('info', 16)} מצרפים מסמכים מתוך מסך הרכב, הנהג או הטיפול — ליד כל תאריך תוקף.</p>
    <div class="grid list"></div>`;

  const draw = () => {
    const q = state.q.trim().replace(/-/g, '');
    const [ot, oid] = state.owner ? state.owner.split(':') : [];
    const list = store.documents
      .filter((d) => state.history || d.is_current)
      .filter((d) => !ot || (d.owner_type === ot && (oid === '*' || d.owner_id === oid)))
      .filter((d) => !state.slot || d.slot_key === state.slot)
      .map((d) => ({ d, o: ownerInfo(d) }))
      .filter(({ d, o }) => !q || `${labelOf(d.slot_key)} ${o.text} ${d.title || ''}`.replace(/-/g, '').includes(q));
    root.querySelector('.list').innerHTML = list.length ? list.map(({ d, o }) => {
      const pages = pagesOf(d.id);
      const pdf = pages[0]?.mime === 'application/pdf';
      return `
        <article class="card doc-card ${d.is_current ? '' : 'doc-old'}">
          <button type="button" class="doc-card-main" data-open="${d.id}">
            <span class="doc-thumb">${icon(pdf ? 'file' : 'image', 28)}</span>
            <span class="doc-info">
              <b>${esc(labelOf(d.slot_key))}</b>
              <span>${o.plate && d.owner_type === 'vehicle' ? plateBox(o.plate, true) : esc(o.text)}</span>
              <small>הועלה ${fmtDate(d.created_at)}${pages.length > 1 ? ` · ${pages.length} עמודים` : ''}${d.expiry_at_upload ? ` · תוקף ${fmtDate(d.expiry_at_upload)}` : ''}</small>
            </span>
            ${d.is_current ? '' : '<span class="chip chip-none">היסטוריה</span>'}
          </button>
          ${o.href ? `<a class="icon-btn" href="${o.href}" aria-label="מעבר">${icon('chevronLeft', 24)}</a>` : ''}
        </article>`;
    }).join('') : emptyState('file', 'לא נמצאו מסמכים');
    root.querySelectorAll('[data-open]').forEach((b) => {
      b.onclick = () => openDocument(store.documents.find((x) => x.id === b.dataset.open), { onChange: draw });
    });
  };

  root.querySelector('.search input').oninput = (e) => { state.q = e.target.value; draw(); };
  root.querySelector('[name=owner]').onchange = (e) => { state.owner = e.target.value; draw(); };
  root.querySelector('[name=slot]').onchange = (e) => { state.slot = e.target.value; draw(); };
  root.querySelector('[name=history]').onchange = (e) => { state.history = e.target.checked; draw(); };
  draw();
}
