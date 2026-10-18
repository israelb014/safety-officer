import { sb, store, load, vehicleById, saveRow } from '../db.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, errText, $ } from '../ui.js';
import { SERVICE_TYPES, todayISO } from '../items.js';
import { setDirtyGuard, navigate } from '../nav.js';
import {
  pageHead, selectOptions, dirtyTracker, serializeForm, showErrors, intOrNull, numOrNull, strOrNull,
} from './common.js';
import { docSlot, deleteOwnerDocuments } from '../docs.js';

export async function render(root, [idParam], query) {
  const isNew = !idParam || idParam === 'new';
  const s = isNew ? null : store.services.find((x) => x.id === idParam);
  if (!isNew && !s) {
    root.innerHTML = pageHead({ title: 'טיפול לא נמצא', back: '#/services' });
    return;
  }
  let id = s?.id || null;
  const vehicleId = s?.vehicle_id || query.vehicle || '';
  const vehicles = store.vehicles.filter((v) => v.active !== false || v.id === vehicleId)
    .map((v) => ({ key: v.id, label: v.plate }));
  const back = vehicleId ? `#/services?vehicle=${vehicleId}` : '#/services';

  root.innerHTML = `
    ${pageHead({
      title: isNew ? 'טיפול חדש' : 'עריכת טיפול',
      back,
      actions: isNew ? '' : `<button type="button" class="icon-btn danger" data-delete aria-label="מחיקה">${icon('trash', 24)}</button>`,
    })}
    <form class="form" novalidate>
      <section class="card form-section">
        <h2>${icon('wrench')} פרטי הטיפול</h2>
        <div class="form-grid">
          <label class="field"><span>רכב *</span>
            <select class="input" name="vehicle_id">${selectOptions(vehicles, vehicleId, { empty: 'בחירת רכב' })}</select>
          </label>
          <label class="field"><span>תאריך *</span><input class="input" type="date" name="service_date" value="${esc(s?.service_date || todayISO())}"></label>
          <label class="field"><span>סוג טיפול</span>
            <select class="input" name="service_type">${selectOptions(SERVICE_TYPES, s?.service_type || 'periodic')}</select>
          </label>
          <label class="field"><span>ק"מ</span><input class="input" type="number" inputmode="numeric" min="0" name="km" value="${esc(s?.km)}"></label>
          <label class="field"><span>מוסך</span><input class="input" name="garage" value="${esc(s?.garage)}" list="garages"></label>
          <label class="field"><span>עלות ₪</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" name="cost" value="${esc(s?.cost)}"></label>
          <label class="field field-wide"><span>תיאור</span><textarea class="input" name="description" rows="3">${esc(s?.description)}</textarea></label>
        </div>
        <datalist id="garages">${[...new Set(store.services.map((x) => x.garage).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
      </section>

      <section class="card form-section">
        <h2>${icon('calendar')} טיפול הבא</h2>
        <p class="muted">אפשר למלא תאריך, ק"מ, או את שניהם</p>
        <div class="form-grid">
          <label class="field"><span>תאריך טיפול הבא</span><input class="input" type="date" name="next_date" value="${esc(s?.next_date)}"></label>
          <label class="field"><span>ק"מ לטיפול הבא</span><input class="input" type="number" inputmode="numeric" min="0" name="next_km" value="${esc(s?.next_km)}"></label>
        </div>
      </section>

      <section class="card form-section">
        <h2>${icon('paperclip')} קבלה</h2>
        <div class="receipt-doc"></div>
      </section>

      <div class="save-bar">
        <button type="submit" class="btn btn-primary btn-lg">${icon('check')} שמירה</button>
      </div>
    </form>`;

  const form = $('form', root);
  const tracker = dirtyTracker(form, () => serializeForm(form));
  setDirtyGuard(() => tracker.isDirty());

  // Suggest next km when the km changes and next km is empty
  form.km.addEventListener('change', () => {
    const km = intOrNull(form.km.value);
    if (km != null && !form.next_km.value && form.service_type.value === 'periodic') form.next_km.placeholder = `למשל ${(km + 15000).toLocaleString('he-IL')}`;
  });

  function validate() {
    const errors = {};
    if (!form.vehicle_id.value) errors.vehicle_id = 'יש לבחור רכב';
    if (!form.service_date.value) errors.service_date = 'יש לבחור תאריך';
    else if (form.service_date.value > todayISO()) errors.service_date = 'תאריך הטיפול לא יכול להיות בעתיד';
    const km = intOrNull(form.km.value);
    if (form.km.value && (km == null || km < 0)) errors.km = 'ק"מ לא תקין';
    const cost = numOrNull(form.cost.value);
    if (form.cost.value && (cost == null || cost < 0)) errors.cost = 'עלות לא תקינה';
    const nkm = intOrNull(form.next_km.value);
    if (form.next_km.value && (nkm == null || nkm < 0)) errors.next_km = 'ק"מ לא תקין';
    else if (nkm != null && km != null && nkm <= km) errors.next_km = 'ק"מ לטיפול הבא צריך להיות גדול מהק"מ הנוכחי';
    if (form.next_date.value && form.service_date.value && form.next_date.value <= form.service_date.value) {
      errors.next_date = 'תאריך הטיפול הבא צריך להיות אחרי תאריך הטיפול';
    }
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
          vehicle_id: form.vehicle_id.value,
          service_date: form.service_date.value,
          service_type: form.service_type.value,
          km: intOrNull(form.km.value),
          garage: strOrNull(form.garage.value),
          cost: numOrNull(form.cost.value),
          description: strOrNull(form.description.value),
          next_date: form.next_date.value || null,
          next_km: intOrNull(form.next_km.value),
        };
        if (id) row.id = id;
        const saved = await saveRow('services', row);
        const wasNew = !id;
        id = saved.id;
        // Update the vehicle's current km if this service shows a higher reading
        const veh = vehicleById(row.vehicle_id);
        if (veh && row.km != null && (veh.current_km == null || row.km > veh.current_km)) {
          await saveRow('vehicles', { id: veh.id, current_km: row.km });
          await load('vehicles');
        }
        await load('services');
        tracker.snapshot();
        if (wasNew) {
          history.replaceState(null, '', `#/service/${id}`);
          $('.page-title h1', root).textContent = 'עריכת טיפול';
        }
        if (!quiet) toast('הטיפול נשמר');
        return id;
      } catch (e) {
        toast(errText(e), 'err');
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
    if (r) toast('הטיפול נשמר');
    return r;
  };
  $('.receipt-doc', root).appendChild(docSlot({ ownerType: 'service', slotKey: 'receipt', ownerId: () => id, getOwnerId: ensureId }));
  tracker.snapshot();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await save()) navigate(`#/services?vehicle=${form.vehicle_id.value}`, { force: true });
  };

  $('[data-delete]', root)?.addEventListener('click', async () => {
    if (!await confirmDialog('למחוק את הטיפול? גם הקבלה המצורפת תימחק.', { ok: 'מחיקה', danger: true })) return;
    try {
      await deleteOwnerDocuments('service', id);
      const { error } = await sb.from('services').delete().eq('id', id);
      if (error) throw error;
      await load('services');
      toast('הטיפול נמחק');
      navigate(back, { force: true });
    } catch (e) { toast(errText(e), 'err'); }
  });
}
