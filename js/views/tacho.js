// יומן טכוגרף — one sheet per bus per month (digital copy of the paper form).
import { sb, store, vehicleById, driverById, BUCKET } from '../db.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, errText, sheet, promptText, initials, plateBox, uuid, loading, $ } from '../ui.js';
import { todayISO, daysInMonth, fmtDate } from '../items.js';
import { pageHead } from './common.js';
import { navigate } from '../nav.js';
import { signaturePad } from '../signature.js';
import { signedUrls } from '../docs.js';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const pad2 = (n) => String(n).padStart(2, '0');

export async function render(root, [vehicleId], query) {
  const v = vehicleById(vehicleId);
  if (!v) { root.innerHTML = pageHead({ title: 'רכב לא נמצא', back: '#/vehicles' }); return; }
  const today = todayISO();
  const year = Number(query.y) || Number(today.slice(0, 4));
  const month = Number(query.m) || Number(today.slice(5, 7));
  const nDays = daysInMonth(year, month);
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${year}-${pad2(month)}-${pad2(nDays)}`;

  root.innerHTML = `${pageHead({ title: 'יומן טכוגרף', back: `#/vehicle/${v.id}` })}${loading()}`;

  const [{ data: rows, error: e1 }, { data: signs, error: e2 }] = await Promise.all([
    sb.from('tachograph_days').select('*').eq('vehicle_id', v.id).gte('day', monthStart).lte('day', monthEnd),
    sb.from('tachograph_signoffs').select('*').eq('vehicle_id', v.id).eq('year', year).eq('month', month),
  ]);
  if (e1 || e2) throw e1 || e2;
  const days = new Map((rows || []).map((r) => [r.day, r]));
  let signoff = signs?.[0] || null;

  const years = [];
  for (let y = Number(today.slice(0, 4)) - 3; y <= Number(today.slice(0, 4)); y++) years.push(y);
  if (!years.includes(year)) years.unshift(year);

  const go = (y, m) => navigate(`#/tacho/${v.id}?y=${y}&m=${m}`);

  root.innerHTML = `
    ${pageHead({
      title: 'יומן טכוגרף', back: `#/vehicle/${v.id}`,
      actions: `<button type="button" class="btn btn-secondary" data-print>${icon('print')} הדפסה</button>`,
    })}
    <section class="card tacho-sheet">
      <div class="tacho-head">
        <div class="tacho-plate">${plateBox(v.plate)}</div>
        <div class="month-picker">
          <button type="button" class="icon-btn" data-prev aria-label="חודש קודם">${icon('chevronRight', 26)}</button>
          <select class="input" name="m">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === month ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select class="input" name="y">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <button type="button" class="icon-btn" data-next aria-label="חודש הבא">${icon('chevronLeft', 26)}</button>
        </div>
      </div>
      <h2 class="print-only print-title">יומן בדיקת טכוגרף — <bdi dir="ltr">${esc(v.plate)}</bdi> — ${MONTHS[month - 1]} ${year}</h2>
      <div class="tacho-stats"></div>
      <div class="tacho-scroll"><table class="tacho-grid"></table></div>
      <div class="print-notes-box"></div>
      <p class="muted tacho-help print-hide">${icon('info', 16)} לוחצים על משבצת בשורה "נבדק" כדי לסמן X. נהג והערה — לא חובה.</p>
      <div class="signature-box"></div>
    </section>`;

  $('[data-prev]', root).onclick = () => (month === 1 ? go(year - 1, 12) : go(year, month - 1));
  $('[data-next]', root).onclick = () => (month === 12 ? go(year + 1, 1) : go(year, month + 1));
  $('[name=m]', root).onchange = (e) => go(year, Number(e.target.value));
  $('[name=y]', root).onchange = (e) => go(Number(e.target.value), month);
  $('[data-print]', root).onclick = () => window.print();

  const isoOf = (d) => `${year}-${pad2(month)}-${pad2(d)}`;
  const locked = () => !!signoff;

  function drawGrid() {
    const cols = [];
    for (let d = 1; d <= nDays; d++) cols.push(d);
    const wd = (d) => new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const cell = (d, inner, cls, attrs = '') => {
      const iso = isoOf(d);
      const future = iso > today;
      const isToday = iso === today;
      return `<td class="${cls} ${isToday ? 'is-today' : ''} ${wd(d) === 6 ? 'is-sat' : ''}">
        <button type="button" data-day="${d}" ${attrs} ${future || locked() ? 'disabled' : ''}>${inner}</button></td>`;
    };
    $('.tacho-grid', root).innerHTML = `
      <thead><tr><th class="row-label">ימים</th>${cols.map((d) => `<th class="day-num ${isoOf(d) === today ? 'is-today' : ''} ${wd(d) === 6 ? 'is-sat' : ''}"><b>${d}</b><small>${WEEKDAYS[wd(d)]}</small></th>`).join('')}</tr></thead>
      <tbody>
        <tr class="row-check"><th class="row-label">נבדק</th>${cols.map((d) => {
          const r = days.get(isoOf(d));
          return cell(d, r?.checked ? icon('x', 22, 'mark') : '', `c-check ${r?.checked ? 'on' : ''}`, `data-act="check" aria-label="יום ${d} ${r?.checked ? 'נבדק' : 'לא נבדק'}"`);
        }).join('')}</tr>
        <tr class="row-driver"><th class="row-label">נהג</th>${cols.map((d) => {
          const r = days.get(isoOf(d));
          const drv = r?.driver_id ? driverById(r.driver_id) : null;
          return cell(d, drv ? esc(initials(drv.full_name)) : '', 'c-driver', `data-act="driver" aria-label="נהג ליום ${d}" title="${esc(drv?.full_name || '')}"`);
        }).join('')}</tr>
        <tr class="row-note"><th class="row-label">הערות</th>${cols.map((d) => {
          const r = days.get(isoOf(d));
          return cell(d, r?.note ? '<span class="note-dot"></span>' : '', 'c-note', `data-act="note" aria-label="הערה ליום ${d}" title="${esc(r?.note || '')}"`);
        }).join('')}</tr>
      </tbody>`;
    const passed = cols.filter((d) => isoOf(d) <= today).length;
    const checked = cols.filter((d) => days.get(isoOf(d))?.checked).length;
    const notes = cols.filter((d) => days.get(isoOf(d))?.note).map((d) => `<li><b>${d}/${month}:</b> ${esc(days.get(isoOf(d)).note)}</li>`);
    $('.tacho-stats', root).innerHTML = `
      <span class="chip ${checked >= passed ? 'chip-valid' : 'chip-expiring'}">${checked} מתוך ${passed} ימים נבדקו</span>
      ${signoff ? `<span class="chip chip-valid">${icon('lock', 14)} חתום</span>` : ''}`;
    $('.print-notes-box', root).innerHTML = notes.length ? `<ul class="print-only print-notes">${notes.join('')}</ul>` : '';
  }

  async function saveDay(d, patch) {
    const iso = isoOf(d);
    const prev = days.get(iso);
    const next = { ...(prev || { checked: false, driver_id: null, note: null }), ...patch, vehicle_id: v.id, day: iso };
    days.set(iso, next);
    drawGrid();
    const { data, error } = await sb.from('tachograph_days').upsert({
      vehicle_id: v.id, day: iso, checked: next.checked, driver_id: next.driver_id || null, note: next.note || null,
    }, { onConflict: 'vehicle_id,day' }).select().single();
    if (error) {
      if (prev) days.set(iso, prev); else days.delete(iso);
      drawGrid();
      toast(errText(error), 'err');
      return;
    }
    days.set(iso, data);
    // keep dashboard data fresh
    if (iso.slice(0, 7) === today.slice(0, 7)) {
      store.tachoMonth = store.tachoMonth.filter((r) => !(r.vehicle_id === v.id && r.day === iso)).concat(data);
    }
  }

  $('.tacho-grid', root).addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-day]');
    if (!b || b.disabled) return;
    const d = Number(b.dataset.day);
    const r = days.get(isoOf(d));
    if (b.dataset.act === 'check') {
      saveDay(d, { checked: !r?.checked });
    } else if (b.dataset.act === 'driver') {
      const picked = await pickDriver(r?.driver_id, `נהג ליום ${d}/${month}`);
      if (picked !== undefined) saveDay(d, { driver_id: picked });
    } else if (b.dataset.act === 'note') {
      const note = await promptText(`הערה ליום ${d}/${month}`, r?.note || '', { placeholder: 'הערה קצרה' });
      if (note !== undefined) saveDay(d, { note: note || null });
    }
  });

  drawGrid();
  // scroll today's column into view
  requestAnimationFrame(() => {
    const t = $('.tacho-grid th.is-today', root);
    const sc = $('.tacho-scroll', root);
    if (t && sc) {
      const tr = t.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      sc.scrollLeft += (tr.left + tr.width / 2) - (sr.left + sr.width / 2);
    }
  });

  // ---------- signature ----------
  async function drawSignature() {
    const box = $('.signature-box', root);
    if (signoff) {
      let url = '';
      try { [url] = signoff.signature_path ? await signedUrls([signoff.signature_path]) : ['']; } catch { /* ignore */ }
      box.innerHTML = `
        <h3>חתימת קצין בטיחות</h3>
        <div class="sig-signed">
          ${url ? `<img src="${esc(url)}" alt="חתימה" class="sig-img">` : ''}
          <p>נחתם בתאריך <b>${fmtDate(signoff.signed_at)}</b></p>
        </div>
        <button type="button" class="btn btn-danger-ghost print-hide" data-unsign>${icon('x')} בטל חתימה</button>`;
      $('[data-unsign]', box).onclick = async () => {
        if (!await confirmDialog('לבטל את החתימה? היומן יחזור להיות פתוח לעריכה.', { ok: 'ביטול חתימה', danger: true })) return;
        try {
          const { error } = await sb.from('tachograph_signoffs').delete().eq('id', signoff.id);
          if (error) throw error;
          if (signoff.signature_path) await sb.storage.from(BUCKET).remove([signoff.signature_path]);
          signoff = null;
          toast('החתימה בוטלה');
          drawGrid(); drawSignature();
        } catch (err) { toast(errText(err), 'err'); }
      };
      return;
    }
    box.innerHTML = `
      <h3>חתימת קצין בטיחות</h3>
      <div class="sig-pad-wrap"><canvas class="sig-pad" aria-label="משטח חתימה"></canvas><span class="sig-hint">חתמו כאן באצבע</span></div>
      <div class="sig-row print-hide">
        <label class="field"><span>תאריך</span><input class="input" type="date" name="sig_date" value="${today}"></label>
        <button type="button" class="btn btn-ghost" data-clear>${icon('refresh')} ניקוי</button>
      </div>
      <button type="button" class="btn btn-primary btn-block print-hide" data-sign disabled>${icon('pen')} חתימה ונעילת החודש</button>`;
    const canvas = $('.sig-pad', box);
    const pad = signaturePad(canvas);
    const signBtn = $('[data-sign]', box);
    canvas.addEventListener('signature-change', () => {
      signBtn.disabled = pad.isEmpty();
      $('.sig-hint', box).hidden = !pad.isEmpty();
    });
    $('[data-clear]', box).onclick = () => pad.clear();
    signBtn.onclick = async () => {
      const date = $('[name=sig_date]', box).value || today;
      signBtn.disabled = true;
      try {
        const blob = await pad.toBlob();
        const path = `tachograph/${v.id}/signature/${uuid()}.png`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' });
        if (upErr) throw upErr;
        const { data, error } = await sb.from('tachograph_signoffs')
          .insert({ vehicle_id: v.id, year, month, signature_path: path, signed_at: date }).select().single();
        if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
        pad.destroy();
        signoff = data;
        toast('החודש נחתם וננעל');
        drawGrid(); drawSignature();
      } catch (err) {
        toast(errText(err), 'err');
        signBtn.disabled = false;
      }
    };
  }
  drawSignature();
}

function pickDriver(currentId, title) {
  const list = store.drivers.filter((d) => d.active !== false || d.id === currentId);
  return sheet({
    title,
    render(body, close) {
      body.innerHTML = `
        <div class="pick-list">
          <button type="button" class="pick ${!currentId ? 'on' : ''}" data-id="">${icon('x', 20)} ללא נהג</button>
          ${list.map((d) => `<button type="button" class="pick ${d.id === currentId ? 'on' : ''}" data-id="${d.id}"><span class="avatar">${esc(initials(d.full_name))}</span>${esc(d.full_name)}</button>`).join('')}
        </div>`;
      body.querySelectorAll('.pick').forEach((b) => { b.onclick = () => close(b.dataset.id || null); });
    },
  });
}
