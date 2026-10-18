// UI helpers: escaping, toasts, dialogs, status rings, plate boxes.
import { icon } from './icons.js';
import { STATUS_LABEL } from './items.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- toast ----------
let toastTimer;
export function toast(msg, type = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check', 22)}<span>${esc(msg)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), type === 'err' ? 4500 : 2600);
}

// ---------- modal / sheet ----------
/**
 * Opens a bottom sheet (phone) / centered dialog (desktop).
 * `render(body, close)` fills the body. Returns a promise resolved with the close value.
 */
export function sheet({ title, render, wide = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `
      <div class="sheet-backdrop"></div>
      <div class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
          <button class="icon-btn sheet-close" aria-label="סגירה">${icon('x', 24)}</button>
        </div>
        <div class="sheet-body"></div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    let done = false;
    const close = (val) => {
      if (done) return;
      done = true;
      wrap.classList.remove('open');
      document.body.classList.remove('no-scroll');
      setTimeout(() => wrap.remove(), 220);
      window.removeEventListener('hashchange', onHash);
      resolve(val);
    };
    const onHash = () => close(undefined);
    window.addEventListener('hashchange', onHash);
    $('.sheet-backdrop', wrap).onclick = () => close(undefined);
    $('.sheet-close', wrap).onclick = () => close(undefined);
    render($('.sheet-body', wrap), close);
    requestAnimationFrame(() => wrap.classList.add('open'));
  });
}

export function confirmDialog(message, { ok = 'אישור', cancel = 'ביטול', danger = false, title = 'אישור פעולה' } = {}) {
  return sheet({
    title,
    render(body, close) {
      body.innerHTML = `
        <p class="confirm-text">${esc(message)}</p>
        <div class="btn-row">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
          <button class="btn btn-ghost" data-cancel>${esc(cancel)}</button>
        </div>`;
      $('[data-ok]', body).onclick = () => close(true);
      $('[data-cancel]', body).onclick = () => close(false);
      setTimeout(() => $('[data-ok]', body).focus(), 50);
    },
  }).then((v) => v === true);
}

export function promptText(title, value = '', { placeholder = '', multiline = true, maxlength = 200 } = {}) {
  return sheet({
    title,
    render(body, close) {
      body.innerHTML = `
        ${multiline
          ? `<textarea class="input" rows="3" maxlength="${maxlength}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
          : `<input class="input" maxlength="${maxlength}" placeholder="${esc(placeholder)}" value="${esc(value)}">`}
        <div class="btn-row">
          <button class="btn btn-primary" data-ok>שמירה</button>
          <button class="btn btn-ghost" data-clear>ניקוי</button>
        </div>`;
      const inp = $('.input', body);
      $('[data-ok]', body).onclick = () => close(inp.value.trim());
      $('[data-clear]', body).onclick = () => close('');
      setTimeout(() => inp.focus(), 80);
    },
  });
}

// ---------- status visuals ----------
export function statusChip(status, text) {
  return `<span class="chip chip-${status}">${esc(text || STATUS_LABEL[status])}</span>`;
}

/**
 * Circular SVG ring. days: number|null. Full ring = 365 days.
 */
export function ring(status, days, size = 64) {
  const r = 26, c = 2 * Math.PI * r;
  let frac;
  if (days == null) frac = 0;
  else if (days < 0) frac = 1;
  else frac = Math.max(0.04, Math.min(1, days / 365));
  const label = days == null ? '—' : days < 0 ? `${-days}` : `${days}`;
  const sub = days == null ? 'אין' : days < 0 ? 'באיחור' : days === 0 ? 'היום' : 'ימים';
  return `
    <div class="ring ring-${status}" style="width:${size}px;height:${size}px" aria-label="${esc(STATUS_LABEL[status])}">
      <svg viewBox="0 0 64 64" width="${size}" height="${size}">
        <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
        <circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 32 32)"/>
      </svg>
      <div class="ring-text"><b>${label}</b><small>${sub}</small></div>
    </div>`;
}

export function plateBox(plate, small = false) {
  return `<span class="plate ${small ? 'plate-sm' : ''}" dir="ltr"><span class="plate-il">IL</span><span class="plate-num">${esc(plate)}</span></span>`;
}

export function emptyState(iconName, title, text = '', actionHtml = '') {
  return `<div class="empty card">${icon(iconName, 48)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actionHtml}</div>`;
}

export function loading() {
  return '<div class="loading"><span class="spinner"></span></div>';
}

export function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
}

export function money(n) {
  if (n == null || n === '') return '';
  return `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}

export function num(n) {
  return n == null || n === '' ? '' : Number(n).toLocaleString('he-IL');
}

// Friendly Hebrew error text from a Supabase / network error
export function errText(err) {
  const m = String(err?.message || err || '');
  if (/duplicate key|unique/i.test(m)) return 'הערך כבר קיים במערכת';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'אין חיבור לאינטרנט. נסו שוב.';
  if (/JWT|not authorized|permission|row-level/i.test(m)) return 'אין הרשאה — יש להתחבר מחדש';
  if (/Invalid login credentials/i.test(m)) return 'אימייל או סיסמה שגויים';
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return 'הקובץ גדול מדי (מקסימום 10MB)';
  return m ? `שגיאה: ${m}` : 'אירעה שגיאה';
}
