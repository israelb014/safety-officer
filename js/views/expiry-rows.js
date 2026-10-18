// Expiry date rows (label + date + status chip + document slot), shared by vehicle & driver forms.
import { expiryOf } from '../db.js';
import { esc, statusChip } from '../ui.js';
import { statusOf, daysBetween, todayISO, daysText, STATUS_LABEL } from '../items.js';
import { docSlot } from '../docs.js';

export function expiryRowsHtml(items, ownerType, ownerId) {
  return items.map((it) => {
    const val = ownerId ? expiryOf(ownerType, ownerId, it.key)?.expiry_date || '' : '';
    return `
      <div class="expiry-row" id="row-${it.key}" data-key="${it.key}">
        <div class="expiry-head">
          <label class="expiry-label" for="exp_${it.key}">${esc(it.label)}</label>
          <span class="expiry-status">${chipFor(val)}</span>
        </div>
        <div class="expiry-body">
          <input class="input" type="date" id="exp_${it.key}" name="exp_${it.key}" value="${esc(val)}">
          <div class="doc-mount"></div>
        </div>
      </div>`;
  }).join('');
}

function chipFor(val) {
  const st = statusOf(val);
  if (!val) return statusChip('none');
  const d = daysBetween(todayISO(), val);
  return statusChip(st, `${STATUS_LABEL[st]} · ${daysText(d)}`);
}

/** Wires live status chips + document slots. getOwnerId: async ensure-saved; ownerId: sync getter. */
export function wireExpiryRows(container, { ownerType, ownerId, getOwnerId }) {
  container.querySelectorAll('.expiry-row').forEach((row) => {
    const input = row.querySelector('input[type=date]');
    input.addEventListener('input', () => { row.querySelector('.expiry-status').innerHTML = chipFor(input.value); });
    input.addEventListener('change', () => { row.querySelector('.expiry-status').innerHTML = chipFor(input.value); });
    row.querySelector('.doc-mount').appendChild(docSlot({
      ownerType, slotKey: row.dataset.key, ownerId, getOwnerId, getExpiry: () => input.value || null,
    }));
  });
}

export function readExpiryDates(form, items) {
  const out = {};
  for (const it of items) out[it.key] = form.querySelector(`[name="exp_${it.key}"]`)?.value || '';
  return out;
}

export function focusRow(root, key) {
  const row = root.querySelector(`#row-${CSS.escape(key)}`);
  if (!row || row.offsetParent === null) return;
  setTimeout(() => {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('highlight');
    setTimeout(() => row.querySelector('input')?.focus({ preventScroll: true }), 400);
    setTimeout(() => row.classList.remove('highlight'), 2600);
  }, 150);
}
