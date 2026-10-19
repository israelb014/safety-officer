// App shell: auth, routing, navigation, unsaved-changes guard, iOS install banner.
import { sb, configured, loadAll, store } from './db.js';
import { icon } from './icons.js';
import { $, esc, confirmDialog, errText, loading } from './ui.js';
import { todayISO } from './items.js';
import { isDirty, clearDirty } from './nav.js';

import * as dashboard from './views/dashboard.js';
import * as vehicles from './views/vehicles.js';
import * as vehicleForm from './views/vehicle-form.js';
import * as tacho from './views/tacho.js';
import * as drivers from './views/drivers.js';
import * as driverForm from './views/driver-form.js';
import * as services from './views/services.js';
import * as serviceForm from './views/service-form.js';
import * as documents from './views/documents.js';
import * as settings from './views/settings.js';

const TABS = [
  { hash: '#/home', label: 'בית', icon: 'home', match: ['home'] },
  { hash: '#/vehicles', label: 'רכבים', icon: 'car', match: ['vehicles', 'vehicle', 'tacho'] },
  { hash: '#/drivers', label: 'נהגים', icon: 'users', match: ['drivers', 'driver'] },
  { hash: '#/services', label: 'טיפולים', icon: 'wrench', match: ['services', 'service'] },
  { hash: '#/documents', label: 'מסמכים', icon: 'file', match: ['documents'] },
  { hash: '#/settings', label: 'הגדרות', icon: 'settings', match: ['settings'] },
];

const ROUTES = {
  home: dashboard,
  vehicles,
  vehicle: vehicleForm,
  tacho,
  drivers,
  driver: driverForm,
  services,
  service: serviceForm,
  documents,
  settings,
};

// ---------- unsaved-changes guard ----------
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

let currentHash = '';
let routing = false;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs = ''] = raw.split('?');
  const [name, ...params] = path.split('/');
  return { name, params, query: Object.fromEntries(new URLSearchParams(qs)) };
}

async function onHashChange() {
  if (routing) return;
  if (isDirty()) {
    const target = location.hash;
    history.replaceState(null, '', currentHash || '#/home');
    const leave = await confirmDialog('יש שינויים שלא נשמרו. לצאת בלי לשמור?', { ok: 'יציאה בלי שמירה', cancel: 'להישאר', danger: true });
    if (!leave) return;
    clearDirty();
    routing = true;
    location.hash = target;
    setTimeout(() => { routing = false; }, 0);
  }
  route();
}

async function route() {
  clearDirty();
  currentHash = location.hash || '#/home';
  const { name, params, query } = parseHash();
  const view = ROUTES[name] || dashboard;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    const tab = TABS.find((t) => t.hash === a.getAttribute('href'));
    a.classList.toggle('active', !!tab?.match.includes(name));
  });
  const root = $('#view');
  root.classList.remove('view-in');
  void root.offsetWidth;
  root.classList.add('view-in');
  window.scrollTo(0, 0);
  try {
    await view.render(root, params, query);
    if (view === dashboard) iosBanner(root);
    root.querySelectorAll('textarea.input').forEach(autosize);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card error-card">${icon('alert', 32)}<p>${esc(errText(e))}</p><button class="btn btn-primary" onclick="location.reload()">טעינה מחדש</button></div>`;
  }
}

// Text areas grow with their content (e.g. multi-line vehicle notes)
function autosize(t) {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 3}px`;
}
document.addEventListener('input', (e) => { if (e.target.matches?.('textarea.input')) autosize(e.target); });

// ---------- shell ----------
function shellHtml() {
  const links = TABS.map((t) => `<a href="${t.hash}" data-tab class="nav-link">${icon(t.icon, 24)}<span>${t.label}</span></a>`).join('');
  return `
    <div class="shell">
      <aside class="sidenav">
        <div class="brand">${brandMark()}<div><b>קצין בטיחות</b><small>ניהול רכבים ונהגים</small></div></div>
        <nav>${links}</nav>
      </aside>
      <main id="view" class="view"></main>
    </div>
    <nav class="tabbar">${links}</nav>`;
}

function brandMark(size = 40) {
  return `<span class="brand-mark" style="width:${size}px;height:${size}px">${icon('shieldCheck', Math.round(size * 0.6))}</span>`;
}

function loginHtml() {
  return `
    <div class="login">
      <form class="login-card card" novalidate>
        <div class="login-logo">${brandMark(72)}</div>
        <h1>קצין בטיחות</h1>
        <p class="muted">כניסה למערכת</p>
        <label class="field"><span>אימייל</span>
          <input class="input" type="email" name="email" autocomplete="username" inputmode="email" dir="ltr" required>
        </label>
        <label class="field"><span>סיסמה</span>
          <input class="input" type="password" name="password" autocomplete="current-password" dir="ltr" required>
        </label>
        <p class="error-text" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${icon('lock')} כניסה</button>
      </form>
    </div>`;
}

function setupHtml() {
  return `
    <div class="login">
      <div class="login-card card">
        <div class="login-logo">${brandMark(72)}</div>
        <h1>המערכת עדיין לא הוגדרה</h1>
        <p>יש להעתיק את כתובת הפרויקט ואת מפתח ה-anon של Supabase לקובץ <code>config.js</code>. ההוראות המלאות נמצאות בקובץ README.md.</p>
      </div>
    </div>`;
}

async function showLogin() {
  document.body.innerHTML = loginHtml();
  const form = $('.login-card');
  const err = $('.error-text', form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      err.textContent = 'יש למלא אימייל וסיסמה';
      err.hidden = false;
      return;
    }
    const btn = $('button', form);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> מתחבר…';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      err.textContent = errText(error);
      err.hidden = false;
      btn.disabled = false;
      btn.innerHTML = `${icon('lock')} כניסה`;
      return;
    }
    startApp();
  };
}

let started = false;
let lastLoad = 0;

async function startApp() {
  started = true;
  document.body.innerHTML = shellHtml();
  $('#view').innerHTML = loading();
  try {
    await loadAll(todayISO());
    lastLoad = Date.now();
  } catch (e) {
    $('#view').innerHTML = `<div class="card error-card">${icon('alert', 32)}<p>${esc(errText(e))}</p><button class="btn btn-primary" onclick="location.reload()">נסו שוב</button></div>`;
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/home');
  route();
}

async function reloadData() {
  await loadAll(todayISO());
  lastLoad = Date.now();
}

// Refresh data when the app comes back to the foreground after a while
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !started || !store.loaded) return;
  if (Date.now() - lastLoad < 5 * 60 * 1000 || isDirty()) return;
  try { await reloadData(); route(); } catch { /* offline — keep showing cached data */ }
});

// ---------- iOS "add to home screen" banner ----------
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}
function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

// Shown at the top of the home screen (in the page flow, so it never covers buttons)
function iosBanner(root) {
  let dismissed = false;
  try { dismissed = localStorage.getItem('ios-banner-dismissed') === '1'; } catch { /* ignore */ }
  if (dismissed || !isIosSafari() || isStandalone()) return;
  const slot = document.createElement('div');
  root.prepend(slot);
  slot.innerHTML = `
    <div class="ios-banner card">
      ${icon('smartphone', 28)}
      <div><b>התקנה על מסך הבית</b><p>בספארי: כפתור השיתוף ${icon('share', 18)} ← "הוסף למסך הבית"</p></div>
      <a class="btn btn-sm btn-primary" href="#/settings?section=install">איך?</a>
      <button class="icon-btn" aria-label="סגירה">${icon('x')}</button>
    </div>`;
  const close = () => {
    try { localStorage.setItem('ios-banner-dismissed', '1'); } catch { /* ignore */ }
    slot.remove();
  };
  $('.icon-btn', slot).onclick = close;
  $('.btn', slot).addEventListener('click', close);
}

// ---------- boot ----------
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (!configured) { document.body.innerHTML = setupHtml(); return; }
  window.addEventListener('hashchange', onHashChange);
  const { data } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { started = false; store.loaded = false; showLogin(); }
  });
  if (data.session) startApp();
  else showLogin();
}

boot();
