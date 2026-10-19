// End-to-end smoke test with a fake Supabase backend (no network, no real data).
// Run:  node tests/smoke.mjs   (needs Playwright + Chromium installed)
// Screenshots are written to $SHOTS (default: tests/shots/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwPath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(pwPath);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://app.test/safety-officer/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const errors = [];
const browser = await chromium.launch();

async function newPage(viewport, ua) {
  const ctx = await browser.newContext({ viewport, userAgent: ua, reducedMotion: 'reduce', locale: 'he-IL', timezoneId: 'Asia/Jerusalem', hasTouch: viewport.width < 600 });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('supabase-js')) {
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'tests/fake-supabase.js')) });
    }
    if (url.hostname === 'ntfy.sh') return route.fulfill({ contentType: 'application/json', body: '{"id":"x"}', headers: { 'access-control-allow-origin': '*' } });
    if (url.hostname !== 'app.test') return route.fulfill({ status: 200, body: '' }); // fonts etc.
    let p = url.pathname.replace('/safety-officer/', '') || 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    if (p === 'config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL='https://fake.supabase.co'; export const SUPABASE_ANON_KEY='fake';" });
    }
    const file = path.join(ROOT, p);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return page;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
async function noHScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) errors.push(`horizontal scroll on ${label}: ${over}px`);
}
const step = (s) => console.log(`- ${s}`);
const pad = (n) => String(n).padStart(2, '0');
const isoIn = (days) => { const d = new Date(Date.now() + days * 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

let current = null;
async function fail(e) {
  console.error(String(e.message).split('\n')[0]);
  if (current) await current.screenshot({ path: path.join(SHOTS, 'FAIL.png'), fullPage: true }).catch(() => {});
  console.error(errors.join('\n'));
  process.exit(1);
}
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);

// ---------------- phone ----------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const page = await newPage({ width: 390, height: 844 }, IPHONE_UA);
current = page;
await page.goto(BASE);
await page.waitForSelector('.login-card');
step('login screen');
await shot(page, '01-login');
await page.fill('[name=email]', 'nissim@example.com');
await page.fill('[name=password]', 'wrong');
await page.click('.login-card button');
await page.waitForSelector('.login-card .error-text:not([hidden])');
await page.fill('[name=password]', 'secret123');
await page.click('.login-card button');
await page.waitForSelector('.hero');
step('dashboard (empty)');
await shot(page, '02-dashboard-empty');

// vehicle (bus)
await page.goto(`${BASE}#/vehicle/new`);
await page.waitForSelector('form [name=plate]');
await page.fill('[name=plate]', '1234567');
await page.selectOption('[name=vehicle_type]', 'bus');
if (await page.isHidden('.bus-section')) errors.push('bus section not shown for bus');
await page.fill('[name=manufacturer]', 'מרצדס');
await page.fill('[name=model]', 'Tourismo');
await page.fill('[name=year]', '2019');
await page.fill('[name=seats]', '50');
await page.fill('[name=current_km]', '120000');
await page.fill('[name=exp_vehicle_license]', isoIn(-3));
await page.fill('[name=exp_insurance_mandatory]', isoIn(10));
await page.fill('[name=exp_insurance_comprehensive]', isoIn(200));
await page.fill('[name=exp_bus_brakes]', isoIn(0));
await shot(page, '03-vehicle-form');
// unsaved changes guard
await page.evaluate(() => { location.hash = '#/drivers'; });
await page.waitForSelector('.sheet-wrap.open');
await page.click('.sheet [data-cancel]');
await page.waitForTimeout(300);
if (!(await page.evaluate(() => location.hash)).startsWith('#/vehicle')) errors.push('dirty guard did not keep page');
await page.click('.save-bar button');
await page.waitForSelector('.page-head h1:text("רכבים")');
step('vehicle saved');

// second vehicle — duplicate plate validation
await page.goto(`${BASE}#/vehicle/new`);
await page.waitForSelector('form [name=plate]');
await page.fill('[name=plate]', '12-345-67');
await page.click('.save-bar button');
await page.waitForSelector('.field-error');
await page.fill('[name=plate]', '76543210');
await page.selectOption('[name=vehicle_type]', 'van');
if (!(await page.isHidden('.bus-section'))) errors.push('bus section visible for van');
await page.click('.save-bar button');
await page.waitForSelector('.page-head h1:text("רכבים")');
await shot(page, '04-vehicles');
await noHScroll(page, 'vehicles');

// driver
await page.goto(`${BASE}#/driver/new`);
await page.waitForSelector('[name=full_name]');
await page.click('.save-bar button');
await page.waitForSelector('.field-error');
await page.fill('[name=full_name]', 'משה כהן');
await page.fill('[name=phone]', '050-1234567');
await page.fill('[name=exp_driving_license]', isoIn(5));
await page.click('.bt-yes');
// attach a document to the driving license slot (image → compressed)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('#row-driving_license input[type=file]', [{ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.png', mimeType: 'image/png', buffer: png }]);
await page.waitForSelector('#row-driving_license .doc-current');
// replace → history
await page.setInputFiles('#row-driving_license input[type=file]', [{ name: 'c.png', mimeType: 'image/png', buffer: png }]);
await page.waitForSelector('#row-driving_license .doc-history');
await shot(page, '05-driver-form');
await page.click('.save-bar button');
await page.waitForSelector('.page-head h1:text("נהגים")');
await shot(page, '06-drivers');
await noHScroll(page, 'drivers');
step('driver saved with documents');

// dashboard with items
await page.goto(`${BASE}#/home`);
await page.waitForSelector('.item-card');
const cards = await page.$$eval('.item-card h3', (els) => els.map((e) => e.textContent));
step(`dashboard cards: ${cards.join(' | ')}`);
if (!cards.includes('תוקף רישיון רכב')) errors.push('expired license not on dashboard');
await shot(page, '07-dashboard');
await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, '07b-dashboard-scrolled.png') });
await noHScroll(page, 'dashboard');
// "update" button goes to the exact row
await page.click('.item-card .btn >> nth=0');
await page.waitForSelector('.expiry-row.highlight');
step('update button focuses row');

// tachograph
const vid = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-supabase-db')).vehicles.find((v) => v.vehicle_type === 'bus').id);
await page.goto(`${BASE}#/tacho/${vid}`);
await page.waitForSelector('.tacho-grid');
const today = new Date().getDate();
if (today > 1) {
  await page.click(`.row-check button[data-day="1"]`);
  await page.waitForSelector('.row-check td.on');
}
await page.click(`.row-check button[data-day="${today}"]`);
const futureDisabled = today < 28 ? await page.isDisabled(`.row-check button[data-day="${today + 1}"]`) : true;
if (!futureDisabled) errors.push('future tacho day not disabled');
await page.click(`.row-driver button[data-day="${today}"]`);
await page.waitForSelector('.pick-list');
await page.click('.pick-list .pick >> nth=1');
await page.waitForTimeout(200);
await page.click(`.row-note button[data-day="${today}"]`);
await page.fill('.sheet textarea', 'החלפת דיסק');
await page.click('.sheet [data-ok]');
await page.waitForSelector('.note-dot');
await noHScroll(page, 'tacho');
// signature
await page.evaluate(() => document.querySelector('.sig-pad').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(300);
const box = await page.locator('.sig-pad').boundingBox();
await page.mouse.move(box.x + 30, box.y + 60);
await page.mouse.down();
for (let i = 0; i < 12; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + 60 + Math.sin(i) * 40);
await page.mouse.up();
await page.click('[data-sign]');
await page.waitForSelector('[data-unsign]');
if (!(await page.isDisabled(`.row-check button[data-day="1"]`))) errors.push('signed month not read-only');
await shot(page, '08-tacho');
await page.emulateMedia({ media: 'print' });
await page.setViewportSize({ width: 1123, height: 794 });
await page.screenshot({ path: path.join(SHOTS, '09-tacho-print.png') });
await page.emulateMedia({ media: 'screen' });
await page.setViewportSize({ width: 390, height: 844 });
step('tachograph signed');

// service
await page.goto(`${BASE}#/service/new?vehicle=${vid}`);
await page.waitForSelector('[name=service_date]');
await page.fill('[name=km]', '125000');
await page.fill('[name=cost]', '1450');
await page.fill('[name=garage]', 'מוסך הצפון');
await page.fill('[name=next_km]', '125600');
await page.click('.save-bar button');
await page.waitForSelector('.vehicle-summary');
const km = await page.evaluate((id) => JSON.parse(localStorage.getItem('fake-supabase-db')).vehicles.find((v) => v.id === id).current_km, vid);
if (km !== 125000) errors.push(`vehicle km not updated (${km})`);
const nsk = await page.evaluate((id) => JSON.parse(localStorage.getItem('fake-supabase-db')).vehicles.find((v) => v.id === id).next_service_km, vid);
if (nsk !== 125600) errors.push(`vehicle next_service_km not synced from service (${nsk})`);
if (!(await page.$('.vehicle-summary .stat-warn'))) errors.push('next service (600 km left) not flagged as due');
await shot(page, '10-services');
await noHScroll(page, 'services');
step('service saved, km updated');

// documents
await page.goto(`${BASE}#/documents`);
await page.waitForSelector('.doc-card');
await page.check('[name=history]', { force: true });
await shot(page, '11-documents');
await noHScroll(page, 'documents');

// settings
await page.goto(`${BASE}#/settings`);
await page.waitForSelector('.qr svg');
await page.click('[data-test]');
await page.waitForSelector('.log li');
await shot(page, '12-settings');
await noHScroll(page, 'settings');
step('settings + test notification');

// delete with history → deactivate
await page.goto(`${BASE}#/vehicle/${vid}`);
await page.waitForSelector('[data-delete]');
await page.click('[data-delete]');
await page.waitForSelector('.sheet [data-ok]');
await page.click('.sheet [data-ok]');
await page.waitForSelector('.page-head h1:text("רכבים")');
const active = await page.evaluate((id) => JSON.parse(localStorage.getItem('fake-supabase-db')).vehicles.find((v) => v.id === id)?.active, vid);
if (active !== false) errors.push('vehicle with history was not deactivated');
step('vehicle with history deactivated');

// import page
await page.goto(`${BASE}import.html`);
await page.waitForSelector('.import-card');
const csv = 'id,car_number,type,make,model,license_exp\n7,8887766,אוטובוס,Volvo,B12,15/03/2027\n';
await page.setInputFiles('[data-t=vehicles] input[type=file]', { name: 'vehicles.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await page.waitForSelector('[data-t=vehicles] .preview');
const ins = 'id,vehicle_id,type,end_date\n1,7,חובה,2027-01-01\n2,7,מקיף,2027-02-01\n';
await page.setInputFiles('[data-t=insurance] input[type=file]', { name: 'insurance.csv', mimeType: 'text/csv', buffer: Buffer.from(ins) });
await page.waitForSelector('[data-t=insurance] .preview');
await shot(page, '13-import');
await page.click('[data-run]');
await page.waitForSelector('.import-log li');
await page.waitForFunction(() => !document.querySelector('[data-run] .spinner'));
const imported = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('fake-supabase-db'));
  const v = d.vehicles.find((x) => x.plate === '88-877-66');
  return v && d.expiry_items.filter((e) => e.owner_id === v.id).map((e) => `${e.item_key}=${e.expiry_date}`).sort().join(',');
});
if (imported !== 'insurance_comprehensive=2027-02-01,insurance_mandatory=2027-01-01,vehicle_license=2027-03-15') errors.push(`import mismatch: ${imported}`);
step(`import: ${imported}`);

// iOS banner shows (not standalone)
await page.goto(`${BASE}#/home`);
await page.waitForSelector('.hero');
if (!(await page.$('.ios-banner'))) errors.push('iOS install banner missing');

// ---------------- desktop ----------------
const desk = await newPage({ width: 1280, height: 860 });
current = desk;
await desk.goto(BASE);
await desk.waitForSelector('.login-card');
await desk.fill('[name=email]', 'nissim@example.com');
await desk.fill('[name=password]', 'x');
await desk.click('.login-card button');
await desk.waitForSelector('.hero');
await shot(desk, '20-desktop-dashboard');
await desk.goto(`${BASE}#/settings`);
await desk.waitForSelector('.qr svg');
await shot(desk, '21-desktop-settings');
await noHScroll(desk, 'desktop settings');

await browser.close();
if (errors.length) {
  console.error('\nFAILURES:\n' + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
