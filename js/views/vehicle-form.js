import { sb, store, load, vehicleById, saveRow, saveExpiries, docsOf } from '../db.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, errText, $ } from '../ui.js';
import {
  VEHICLE_ITEMS, BUS_ITEMS, VEHICLE_TYPES, formatPlate, nextServiceFor, todayISO, fmtDate, daysText,
} from '../items.js';
import { setDirtyGuard, navigate } from '../nav.js';
import {
  pageHead, selectOptions, dirtyTracker, serializeForm, showErrors, intOrNull, strOrNull,
} from './common.js';
import { expiryRowsHtml, wireExpiryRows, readExpiryDates, focusRow } from './expiry-rows.js';
import { deleteOwnerDocuments } from '../docs.js';

const normPlate = (p) => String(p || '').replace(/[\s\-.]/g, '');

export async function render(root, [idParam], query) {
  const isNew = !idParam || idParam === 'new';
  let v = isNew ? null : vehicleById(idParam);
  if (!isNew && !v) {
    root.innerHTML = `${pageHead({ title: 'רכב לא נמצא', back: '#/vehicles' })}`;
    return;
  }
  let id = v?.id || null;
  const drivers = store.drivers.filter((d) => d.active !== false || d.id === v?.default_driver_id)
    .map((d) => ({ key: d.id, label: d.full_name }));
  const thisYear = new Date().getFullYear();

  root.innerHTML = `
    ${pageHead({
      title: isNew ? 'רכב חדש' : v.plate,
      back: '#/vehicles',
      actions: isNew ? '' : `<button type="button" class="icon-btn danger" data-delete aria-label="מחיקה">${icon('trash', 24)}</button>`,
    })}
    <form class="form" novalidate>
      <section class="card form-section">
        <h2>${icon('car')} פרטי רכב</h2>
        <div class="form-grid">
          <label class="field"><span>מספר רישוי *</span>
            <input class="input input-plate" name="plate" inputmode="numeric" dir="ltr" placeholder="12-345-67" value="${esc(v?.plate)}" autocomplete="off">
          </label>
          <label class="field"><span>סוג רכב</span>
            <select class="input" name="vehicle_type">${selectOptions(VEHICLE_TYPES, v?.vehicle_type || 'minibus')}</select>
          </label>
          <label class="field"><span>יצרן</span><input class="input" name="manufacturer" value="${esc(v?.manufacturer)}"></label>
          <label class="field"><span>דגם</span><input class="input" name="model" value="${esc(v?.model)}"></label>
          <label class="field"><span>שנה</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="${thisYear + 1}" value="${esc(v?.year)}"></label>
          <label class="field"><span>מספר מקומות</span><input class="input" name="seats" type="number" inputmode="numeric" min="1" max="120" value="${esc(v?.seats)}"></label>
          <label class="field"><span>ק"מ נוכחי</span><input class="input" name="current_km" type="number" inputmode="numeric" min="0" value="${esc(v?.current_km)}"></label>
          <label class="field"><span>נהג קבוע</span>
            <select class="input" name="default_driver_id">${selectOptions(drivers, v?.default_driver_id, { empty: 'ללא' })}</select>
          </label>
          <label class="field field-wide"><span>הערות</span><textarea class="input" name="notes" rows="2">${esc(v?.notes)}</textarea></label>
          <label class="switch field-wide"><input type="checkbox" name="active" ${v?.active === false ? '' : 'checked'}><span class="switch-ui"></span><span>רכב פעיל</span></label>
        </div>
      </section>

      <section class="card form-section">
        <h2>${icon('calendar')} תאריכי תוקף</h2>
        <div class="expiry-list">${expiryRowsHtml(VEHICLE_ITEMS, 'vehicle', id)}</div>
      </section>

      <section class="card form-section bus-section" ${v?.vehicle_type === 'bus' ? '' : 'hidden'}>
        <h2>${icon('bus')} ציוד ובדיקות אוטובוס</h2>
        <div class="expiry-list">${expiryRowsHtml(BUS_ITEMS, 'vehicle', id)}</div>
        <button type="button" class="btn btn-secondary btn-block" data-tacho>${icon('tacho')} יומן טכוגרף</button>
      </section>

      <section class="card form-section service-summary" ${isNew ? 'hidden' : ''}></section>

      <div class="save-bar">
        <button type="submit" class="btn btn-primary btn-lg">${icon('check')} שמירה</button>
      </div>
    </form>`;

  const form = $('form', root);
  const busSection = $('.bus-section', root);
  form.vehicle_type.onchange = () => { busSection.hidden = form.vehicle_type.value !== 'bus'; };
  form.plate.addEventListener('blur', () => { if (form.plate.value) form.plate.value = formatPlate(form.plate.value); });

  const tracker = dirtyTracker(form, () => serializeForm(form));
  setDirtyGuard(() => tracker.isDirty());

  function renderServiceSummary() {
    const box = $('.service-summary', root);
    if (!id) return;
    box.hidden = false;
    const veh = vehicleById(id);
    const n = nextServiceFor(veh, store.services, todayISO(), {
      days: store.settings?.service_days ?? 14, km: store.settings?.service_km ?? 1000,
    });
    const count = store.services.filter((s) => s.vehicle_id === id).length;
    box.innerHTML = `
      <h2>${icon('wrench')} טיפולים</h2>
      <p>${count ? `${count} טיפולים רשומים` : 'אין טיפולים רשומים'}${n ? ` · טיפול הבא: ${[n.nextDate ? `${fmtDate(n.nextDate)} (${daysText(n.daysLeft)})` : '', n.nextKm ? `${n.nextKm.toLocaleString('he-IL')} ק"מ` : ''].filter(Boolean).join(' / ')}` : ''}</p>
      <div class="btn-row">
        <a class="btn btn-secondary" href="#/services?vehicle=${id}">${icon('list')} היסטוריית טיפולים</a>
        <a class="btn btn-secondary" href="#/service/new?vehicle=${id}">${icon('plus')} טיפול חדש</a>
      </div>`;
  }
  renderServiceSummary();

  function validate() {
    const errors = {};
    const plate = formatPlate(form.plate.value);
    if (!plate) errors.plate = 'יש להזין מספר רישוי';
    else if (store.vehicles.some((x) => x.id !== id && normPlate(x.plate) === normPlate(plate))) {
      errors.plate = 'מספר רישוי זה כבר קיים במערכת';
    }
    const year = intOrNull(form.year.value);
    if (form.year.value && (year == null || year < 1950 || year > thisYear + 1)) errors.year = `שנה לא תקינה (1950–${thisYear + 1})`;
    const seats = intOrNull(form.seats.value);
    if (form.seats.value && (seats == null || seats < 1 || seats > 120)) errors.seats = 'מספר מקומות לא תקין';
    const km = intOrNull(form.current_km.value);
    if (form.current_km.value && (km == null || km < 0)) errors.current_km = 'ק"מ לא תקין';
    return showErrors(form, errors);
  }

  let saving = null;
  async function save({ quiet = false } = {}) {
    if (saving) return saving;
    if (!validate()) return null;
    saving = (async () => {
      const btn = $('.save-bar .btn', root);
      btn.disabled = true;
      try {
        const row = {
          plate: formatPlate(form.plate.value),
          vehicle_type: form.vehicle_type.value,
          manufacturer: strOrNull(form.manufacturer.value),
          model: strOrNull(form.model.value),
          year: intOrNull(form.year.value),
          seats: intOrNull(form.seats.value),
          current_km: intOrNull(form.current_km.value),
          default_driver_id: form.default_driver_id.value || null,
          notes: strOrNull(form.notes.value),
          active: form.active.checked,
        };
        if (id) row.id = id;
        const saved = await saveRow('vehicles', row);
        const wasNew = !id;
        id = saved.id;
        await saveExpiries('vehicle', id, readExpiryDates(form, [...VEHICLE_ITEMS, ...BUS_ITEMS]));
        await load('vehicles');
        form.plate.value = saved.plate;
        tracker.snapshot();
        if (wasNew) {
          history.replaceState(null, '', `#/vehicle/${id}`);
          $('.page-title h1', root).textContent = saved.plate;
          renderServiceSummary();
        }
        if (!quiet) toast('הרכב נשמר');
        return id;
      } catch (e) {
        if (/duplicate|unique/i.test(e.message || '')) showErrors(form, { plate: 'מספר רישוי זה כבר קיים במערכת' });
        else toast(errText(e), 'err');
        return null;
      } finally {
        btn.disabled = false;
        saving = null;
      }
    })();
    return saving;
  }

  const ensureId = async () => {
    if (id) return id;
    const r = await save({ quiet: true });
    if (r) toast('הרכב נשמר');
    return r;
  };
  wireExpiryRows(form, { ownerType: 'vehicle', ownerId: () => id, getOwnerId: ensureId });
  tracker.snapshot();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await save()) navigate('#/vehicles', { force: true });
  };

  $('[data-tacho]', root).onclick = async () => {
    const vid = await ensureId();
    if (!vid) return;
    if (tracker.isDirty() && !(await save())) return;
    navigate(`#/tacho/${vid}`, { force: true });
  };

  $('[data-delete]', root)?.addEventListener('click', async () => {
    try {
      const { data: tacho } = await sb.from('tachograph_days').select('id').eq('vehicle_id', id).limit(1);
      const hasHistory = store.services.some((s) => s.vehicle_id === id) || docsOf('vehicle', id).length || tacho?.length;
      if (hasHistory) {
        if (vehicleById(id).active === false) { toast('הרכב כבר לא פעיל. יש לו היסטוריה ולכן הוא לא נמחק', 'err'); return; }
        if (!await confirmDialog('לרכב יש היסטוריה (טיפולים / מסמכים / יומן). הוא יסומן כ"לא פעיל" ולא יימחק.', { ok: 'סימון כלא פעיל' })) return;
        await saveRow('vehicles', { id, active: false });
        await load('vehicles');
        toast('הרכב סומן כלא פעיל');
      } else {
        if (!await confirmDialog(`למחוק את הרכב ${v.plate}?`, { ok: 'מחיקה', danger: true })) return;
        await deleteOwnerDocuments('vehicle', id);
        const { error } = await sb.from('vehicles').delete().eq('id', id);
        if (error) throw error;
        await load('vehicles', 'expiry', 'drivers');
        toast('הרכב נמחק');
      }
      navigate('#/vehicles', { force: true });
    } catch (e) { toast(errText(e), 'err'); }
  });

  if (query.focus) focusRow(root, query.focus);
}
