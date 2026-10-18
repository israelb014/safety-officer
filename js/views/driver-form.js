import { sb, store, load, driverById, saveRow, saveExpiries, saveFlags, flagsOf, docsOf } from '../db.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, errText, $ } from '../ui.js';
import { DRIVER_ITEMS } from '../items.js';
import { setDirtyGuard, navigate } from '../nav.js';
import { pageHead, selectOptions, dirtyTracker, serializeForm, showErrors, strOrNull } from './common.js';
import { expiryRowsHtml, wireExpiryRows, readExpiryDates, focusRow } from './expiry-rows.js';
import { docSlot, deleteOwnerDocuments } from '../docs.js';

export async function render(root, [idParam], query) {
  const isNew = !idParam || idParam === 'new';
  const d = isNew ? null : driverById(idParam);
  if (!isNew && !d) {
    root.innerHTML = pageHead({ title: 'נהג לא נמצא', back: '#/drivers' });
    return;
  }
  let id = d?.id || null;
  const reg84 = id ? flagsOf(id).regulation_84 : false;
  const vehicles = store.vehicles.filter((v) => v.active !== false || v.id === d?.default_vehicle_id)
    .map((v) => ({ key: v.id, label: v.plate }));

  root.innerHTML = `
    ${pageHead({
      title: isNew ? 'נהג חדש' : d.full_name,
      back: '#/drivers',
      actions: isNew ? '' : `<button type="button" class="icon-btn danger" data-delete aria-label="מחיקה">${icon('trash', 24)}</button>`,
    })}
    <form class="form" novalidate>
      <section class="card form-section">
        <h2>${icon('user')} פרטים</h2>
        <div class="form-grid">
          <label class="field field-wide"><span>שם מלא *</span><input class="input" name="full_name" value="${esc(d?.full_name)}" autocomplete="off"></label>
          <label class="field"><span>ת"ז</span><input class="input" name="id_number" inputmode="numeric" dir="ltr" maxlength="9" value="${esc(d?.id_number)}"></label>
          <label class="field"><span>טלפון</span><input class="input" name="phone" type="tel" inputmode="tel" dir="ltr" value="${esc(d?.phone)}"></label>
          <label class="field"><span>רכב קבוע</span>
            <select class="input" name="default_vehicle_id">${selectOptions(vehicles, d?.default_vehicle_id, { empty: 'ללא' })}</select>
          </label>
          <label class="field field-wide"><span>הערות</span><textarea class="input" name="notes" rows="2">${esc(d?.notes)}</textarea></label>
          <label class="switch field-wide"><input type="checkbox" name="active" ${d?.active === false ? '' : 'checked'}><span class="switch-ui"></span><span>נהג פעיל</span></label>
        </div>
      </section>

      <section class="card form-section">
        <h2>${icon('calendar')} תאריכי תוקף</h2>
        <div class="expiry-list">${expiryRowsHtml(DRIVER_ITEMS, 'driver', id)}</div>
      </section>

      <section class="card form-section" id="row-regulation_84">
        <h2>${icon('shieldCheck')} תקנה 84</h2>
        <div class="big-toggle" role="radiogroup" aria-label="תקנה 84">
          <label class="bt-option bt-yes"><input type="radio" name="regulation_84" value="yes" ${reg84 ? 'checked' : ''}><span>${icon('check', 26)} יש</span></label>
          <label class="bt-option bt-no"><input type="radio" name="regulation_84" value="no" ${reg84 ? '' : 'checked'}><span>${icon('x', 26)} אין</span></label>
        </div>
        <div class="reg84-doc"></div>
      </section>

      <div class="save-bar">
        <button type="submit" class="btn btn-primary btn-lg">${icon('check')} שמירה</button>
      </div>
    </form>`;

  const form = $('form', root);
  const tracker = dirtyTracker(form, () => serializeForm(form) + (form.querySelector('[name=regulation_84]:checked')?.value || ''));
  setDirtyGuard(() => tracker.isDirty());

  function validate() {
    const errors = {};
    if (!form.full_name.value.trim()) errors.full_name = 'יש להזין שם מלא';
    const idn = form.id_number.value.trim();
    if (idn && !/^\d{5,9}$/.test(idn)) errors.id_number = 'ת"ז צריכה להכיל 5–9 ספרות';
    const phone = form.phone.value.trim();
    if (phone && phone.replace(/\D/g, '').length < 9) errors.phone = 'מספר טלפון לא תקין';
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
          full_name: form.full_name.value.trim(),
          id_number: strOrNull(form.id_number.value),
          phone: strOrNull(form.phone.value),
          default_vehicle_id: form.default_vehicle_id.value || null,
          notes: strOrNull(form.notes.value),
          active: form.active.checked,
        };
        if (id) row.id = id;
        const saved = await saveRow('drivers', row);
        const wasNew = !id;
        id = saved.id;
        await saveExpiries('driver', id, readExpiryDates(form, DRIVER_ITEMS));
        const reg = form.querySelector('[name=regulation_84]:checked')?.value === 'yes';
        if (wasNew || reg !== flagsOf(id).regulation_84) await saveFlags(id, reg);
        await load('drivers');
        tracker.snapshot();
        if (wasNew) {
          history.replaceState(null, '', `#/driver/${id}`);
          $('.page-title h1', root).textContent = saved.full_name;
        }
        if (!quiet) toast('הנהג נשמר');
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
    if (r) toast('הנהג נשמר');
    return r;
  };
  wireExpiryRows(form, { ownerType: 'driver', ownerId: () => id, getOwnerId: ensureId });
  $('.reg84-doc', root).appendChild(docSlot({ ownerType: 'driver', slotKey: 'regulation_84', ownerId: () => id, getOwnerId: ensureId }));
  tracker.snapshot();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await save()) navigate('#/drivers', { force: true });
  };

  $('[data-delete]', root)?.addEventListener('click', async () => {
    try {
      const { data: tacho } = await sb.from('tachograph_days').select('id').eq('driver_id', id).limit(1);
      const hasHistory = docsOf('driver', id).length || tacho?.length;
      if (hasHistory) {
        if (driverById(id).active === false) { toast('הנהג כבר לא פעיל. יש לו היסטוריה ולכן הוא לא נמחק', 'err'); return; }
        if (!await confirmDialog('לנהג יש היסטוריה (מסמכים / יומן טכוגרף). הוא יסומן כ"לא פעיל" ולא יימחק.', { ok: 'סימון כלא פעיל' })) return;
        await saveRow('drivers', { id, active: false });
        await load('drivers');
        toast('הנהג סומן כלא פעיל');
      } else {
        if (!await confirmDialog(`למחוק את הנהג ${d.full_name}?`, { ok: 'מחיקה', danger: true })) return;
        await deleteOwnerDocuments('driver', id);
        const { error } = await sb.from('drivers').delete().eq('id', id);
        if (error) throw error;
        await load('drivers', 'expiry', 'flags', 'vehicles');
        toast('הנהג נמחק');
      }
      navigate('#/drivers', { force: true });
    } catch (e) { toast(errText(e), 'err'); }
  });

  if (query.focus) focusRow(root, query.focus);
}
