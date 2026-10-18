import { sb, store, loadSettings, randomTopic, storageUsedBytes } from '../db.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, errText, $ } from '../ui.js';
import { fmtDate, DEFAULT_LEAD_DAYS, todayISO } from '../items.js';
import { pageHead } from './common.js';
import { qrSvg } from '../qr.js';
import { ntfyPublish, topicUrl } from '../ntfy.js';
import { illus } from './illustrations.js';

const LEAD_CHOICES = [90, 60, 45, 30, 21, 14, 10, 7, 5, 3, 2, 1, 0];
const FREE_BYTES = 1024 * 1024 * 1024;

export async function render(root, _p, query) {
  const s = store.settings || await loadSettings();
  const topic = s.ntfy_topic;
  const url = topicUrl(topic);
  const used = await storageUsedBytes();
  const usedFrac = Math.min(1, used / FREE_BYTES);
  const r = 26, c = 2 * Math.PI * r;
  const lead = new Set(s.lead_days?.length ? s.lead_days : DEFAULT_LEAD_DAYS);
  const { data: { user } } = await sb.auth.getUser();

  root.innerHTML = `
    ${pageHead({ title: 'הגדרות' })}
    <div class="settings-grid">

    <section class="card form-section" id="sec-notify">
      <h2>${icon('bell')} התראות לטלפון</h2>
      <p>המערכת שולחת כל בוקר הודעה אחת לטלפון עם כל מה שצריך לטפל בו. ההודעות מגיעות דרך האפליקציה החינמית <b>ntfy</b>.</p>
      <a class="btn btn-primary btn-lg btn-block" href="${esc(url)}" target="_blank" rel="noopener">${icon('bell')} הצטרפות להתראות</a>
      <div class="qr-box">
        <div class="qr">${qrSvg(url, { size: 200 })}</div>
        <div class="topic">
          <span class="muted">שם הערוץ (topic):</span>
          <code dir="ltr">${esc(topic)}</code>
          <button type="button" class="btn btn-sm btn-ghost" data-copy>${icon('file', 18)} העתקה</button>
        </div>
      </div>
      <ol class="steps">
        <li>${illus('appstore')}<div><b>1. מתקינים את ntfy</b><p>פותחים את ה-App Store, מחפשים <b dir="ltr">ntfy</b> ומתקינים (חינם).</p></div></li>
        <li>${illus('plus')}<div><b>2. לוחצים על +</b><p>באפליקציה לוחצים על סימן הפלוס כדי להוסיף ערוץ.</p></div></li>
        <li>${illus('topic')}<div><b>3. מדביקים את שם הערוץ</b><p>מדביקים את שם הערוץ שלמעלה (או סורקים את הברקוד במצלמה) ולוחצים Subscribe.</p></div></li>
        <li>${illus('allow')}<div><b>4. מאשרים התראות</b><p>כשהטלפון שואל — לוחצים "אפשר" (Allow).</p></div></li>
      </ol>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" data-test>${icon('bell')} שלח התראת בדיקה</button>
        <button type="button" class="btn btn-ghost" data-regen>${icon('refresh')} ערוץ חדש</button>
      </div>
    </section>

    <section class="card form-section" id="sec-lead">
      <h2>${icon('clock')} מתי להתריע</h2>
      <p>בחרו כמה ימים לפני שפג תוקף תישלח התראה. אחרי שהתוקף פג — מתריעים כל יום עד שמעדכנים.</p>
      <div class="lead-chips">
        ${LEAD_CHOICES.map((d) => `<label class="lead-chip"><input type="checkbox" value="${d}" ${lead.has(d) ? 'checked' : ''}><span>${d === 0 ? 'ביום עצמו' : d === 1 ? 'יום לפני' : `${d} ימים`}</span></label>`).join('')}
      </div>
      <h3>טיפול הבא</h3>
      <div class="form-grid">
        <label class="field"><span>להתריע כשנותרו ימים</span><input class="input" type="number" inputmode="numeric" min="0" max="120" name="service_days" value="${esc(s.service_days ?? 14)}"></label>
        <label class="field"><span>להתריע כשנותרו ק"מ</span><input class="input" type="number" inputmode="numeric" min="0" step="100" name="service_km" value="${esc(s.service_km ?? 1000)}"></label>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-save-lead>${icon('check')} שמירה</button>
    </section>

    <section class="card form-section" id="sec-log">
      <h2>${icon('history')} התראות אחרונות</h2>
      <div class="log-list"><span class="spinner"></span></div>
    </section>

    <section class="card form-section" id="sec-storage">
      <h2>${icon('file')} נפח אחסון</h2>
      <div class="storage">
        <div class="ring ring-${usedFrac > 0.85 ? 'expired' : usedFrac > 0.6 ? 'expiring' : 'valid'}" style="width:96px;height:96px">
          <svg viewBox="0 0 64 64" width="96" height="96">
            <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
            <circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0.02, usedFrac))}" transform="rotate(-90 32 32)"/>
          </svg>
          <div class="ring-text"><b>${Math.round(usedFrac * 100)}%</b><small>בשימוש</small></div>
        </div>
        <div><p><b>${fmtBytes(used)}</b> מתוך 1GB (חינם)</p><p class="muted">${store.pages.length} קבצים · תמונות נדחסות אוטומטית</p></div>
      </div>
    </section>

    <section class="card form-section" id="sec-install">
      <h2>${icon('smartphone')} התקנה לאייפון</h2>
      <p>כך המערכת תיפתח כמו אפליקציה, ישר ממסך הבית:</p>
      <ol class="steps">
        <li>${illus('safari')}<div><b>1. פותחים בספארי</b><p>פותחים את הקישור של המערכת בדפדפן Safari.</p></div></li>
        <li>${illus('share')}<div><b>2. כפתור שיתוף</b><p>לוחצים על כפתור השיתוף ${icon('share', 18)} בתחתית המסך.</p></div></li>
        <li>${illus('addhome')}<div><b>3. "הוסף למסך הבית"</b><p>גוללים למטה ולוחצים "הוסף למסך הבית".</p></div></li>
        <li>${illus('add')}<div><b>4. "הוסף"</b><p>לוחצים "הוסף" בפינה. זהו — יש אייקון על מסך הבית.</p></div></li>
      </ol>
    </section>

    <section class="card form-section" id="sec-password">
      <h2>${icon('key')} שינוי סיסמה</h2>
      ${user?.email ? `<p class="muted">מחובר כ: <span dir="ltr">${esc(user.email)}</span></p>` : ''}
      <form class="pw-form" novalidate>
        <input type="text" name="username" autocomplete="username" value="${esc(user?.email || '')}" hidden>
        <label class="field"><span>סיסמה חדשה</span><input class="input" type="password" name="pw1" autocomplete="new-password" dir="ltr"></label>
        <label class="field"><span>שוב את הסיסמה החדשה</span><input class="input" type="password" name="pw2" autocomplete="new-password" dir="ltr"></label>
        <p class="error-text" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">${icon('lock')} שינוי סיסמה</button>
      </form>
    </section>

    <section class="card form-section">
      <h2>${icon('upload')} כלים</h2>
      <div class="btn-row">
        <a class="btn btn-secondary" href="./import.html">${icon('upload')} ייבוא מהמערכת הישנה</a>
        <button type="button" class="btn btn-danger-ghost" data-logout>${icon('logout')} יציאה מהמערכת</button>
      </div>
    </section>
    </div>`;

  // copy topic
  $('[data-copy]', root).onclick = async () => {
    try { await navigator.clipboard.writeText(topic); toast('שם הערוץ הועתק'); } catch { toast('לא ניתן להעתיק', 'err'); }
  };

  // test notification
  $('[data-test]', root).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const title = 'קצין בטיחות — התראת בדיקה';
    const body = 'אם ההודעה הזו הגיעה — ההתראות עובדות.';
    try {
      await ntfyPublish({ topic, title, body, tags: ['white_check_mark'], click: location.href.split('#')[0] + '#/home' });
      await sb.from('notification_log').insert({ kind: 'test', sent_on: todayISO(), status: 'sent', title, body, item_count: 0, priority: 'default' });
      toast('התראת בדיקה נשלחה');
    } catch (err) {
      await sb.from('notification_log').insert({ kind: 'test', sent_on: todayISO(), status: 'error', title, error: String(err.message || err) });
      toast(errText(err), 'err');
    }
    btn.disabled = false;
    drawLog();
  };

  // regenerate topic
  $('[data-regen]', root).onclick = async () => {
    if (!await confirmDialog('ליצור ערוץ התראות חדש? הטלפון יפסיק לקבל התראות עד שתצטרפו לערוץ החדש.', { ok: 'יצירת ערוץ חדש', danger: true })) return;
    try {
      const { data, error } = await sb.from('settings').update({ ntfy_topic: randomTopic() }).eq('id', 1).select().single();
      if (error) throw error;
      store.settings = data;
      toast('נוצר ערוץ חדש');
      render(root, _p, query);
    } catch (err) { toast(errText(err), 'err'); }
  };

  // lead times
  $('[data-save-lead]', root).onclick = async () => {
    const days = [...root.querySelectorAll('.lead-chips input:checked')].map((i) => Number(i.value)).sort((a, b) => b - a);
    const sd = parseInt(root.querySelector('[name=service_days]').value, 10);
    const sk = parseInt(root.querySelector('[name=service_km]').value, 10);
    if (!days.length) { toast('יש לבחור לפחות מועד התראה אחד', 'err'); return; }
    if (!Number.isFinite(sd) || sd < 0 || !Number.isFinite(sk) || sk < 0) { toast('ערכי טיפול הבא לא תקינים', 'err'); return; }
    try {
      const { data, error } = await sb.from('settings').update({ lead_days: days, service_days: sd, service_km: sk }).eq('id', 1).select().single();
      if (error) throw error;
      store.settings = data;
      toast('ההגדרות נשמרו');
    } catch (err) { toast(errText(err), 'err'); }
  };

  // log
  async function drawLog() {
    const box = $('.log-list', root);
    const { data, error } = await sb.from('notification_log').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) { box.innerHTML = `<p class="error-text">${esc(errText(error))}</p>`; return; }
    box.innerHTML = data?.length ? `<ul class="log">${data.map((l) => `
      <li class="log-${l.status}">
        <span class="log-icon">${icon(l.status === 'sent' ? 'check' : l.status === 'error' ? 'alert' : 'info', 18)}</span>
        <div>
          <b>${l.kind === 'test' ? 'בדיקה' : `${l.item_count} פריטים`}</b>
          <small>${fmtDate(l.created_at)} ${new Date(l.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}${l.status === 'error' ? ` · שגיאה: ${esc(l.error || '')}` : ''}</small>
        </div>
      </li>`).join('')}</ul>` : '<p class="muted">עדיין לא נשלחו התראות</p>';
  }
  drawLog();

  // password
  const pw = $('.pw-form', root);
  pw.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.error-text', pw);
    err.hidden = true;
    const p1 = pw.pw1.value, p2 = pw.pw2.value;
    if (p1.length < 8) { err.textContent = 'הסיסמה צריכה להכיל לפחות 8 תווים'; err.hidden = false; return; }
    if (p1 !== p2) { err.textContent = 'הסיסמאות לא זהות'; err.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { err.textContent = errText(error); err.hidden = false; return; }
    pw.reset();
    toast('הסיסמה שונתה');
  };

  $('[data-logout]', root).onclick = async () => {
    if (!await confirmDialog('לצאת מהמערכת?', { ok: 'יציאה' })) return;
    await sb.auth.signOut();
  };

  if (query.section) {
    const el = document.getElementById(`sec-${query.section}`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }
}

function fmtBytes(b) {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}
