// Shared bits for views.
import { icon } from '../icons.js';
import { esc } from '../ui.js';

export function pageHead({ title, sub = '', back = null, actions = '' }) {
  return `
    <header class="page-head">
      ${back ? `<a class="icon-btn back-btn" href="${esc(back)}" aria-label="חזרה">${icon('chevronRight', 28)}</a>` : ''}
      <div class="page-title">
        <h1>${esc(title)}</h1>
        ${sub ? `<p>${sub}</p>` : ''}
      </div>
      <div class="page-actions">${actions}</div>
    </header>`;
}

export function selectOptions(list, value, { empty = null } = {}) {
  return (empty != null ? `<option value="">${esc(empty)}</option>` : '')
    + list.map((o) => `<option value="${esc(o.key)}" ${String(o.key) === String(value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}

/** Tracks whether a form changed since `snapshot()`. */
export function dirtyTracker(form, serialize) {
  let base = serialize();
  return {
    snapshot() { base = serialize(); },
    isDirty() { return serialize() !== base; },
  };
}

export function serializeForm(form) {
  const data = {};
  form.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!el.name) return;
    data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return JSON.stringify(data);
}

/** Shows / clears inline validation errors. errors: {fieldName: message} */
export function showErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) continue;
    el.classList.add('invalid');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.innerHTML = `${icon('alert', 16)} ${esc(msg)}`;
    (el.closest('.field') || el.parentElement).appendChild(p);
    if (!first) first = el;
  }
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => first.focus({ preventScroll: true }), 300);
  }
  return !first;
}

export function intOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(String(v).replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[,\s₪]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function strOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}
