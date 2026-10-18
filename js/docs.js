// Document attachments: upload (with image compression), versions/history, viewer.
import { sb, store, BUCKET, load, docsOf, pagesOf } from './db.js';
import { icon } from './icons.js';
import { esc, toast, sheet, confirmDialog, uuid, errText, $ } from './ui.js';
import { fmtDate, labelOf } from './items.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 2000;

// ---------- compression ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא ניתן לקרוא את התמונה')); };
    img.src = url;
  });
}

export async function compressImage(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) throw new Error('דחיסת התמונה נכשלה');
  return blob;
}

async function prepareFiles(files) {
  const out = [];
  for (const f of files) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
    if (!isPdf && !isImg) throw new Error(`הקובץ "${f.name}" אינו תמונה או PDF`);
    let blob = f, ext = 'pdf', mime = 'application/pdf';
    if (isImg) {
      try {
        blob = await compressImage(f);
        ext = 'jpg'; mime = 'image/jpeg';
      } catch {
        // Browser can't decode (rare) — upload original
        blob = f; mime = f.type || 'image/jpeg'; ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      }
    }
    if (blob.size > MAX_BYTES) throw new Error(`הקובץ "${f.name}" גדול מ-10MB`);
    out.push({ blob, ext, mime });
  }
  return out;
}

// ---------- upload ----------
/**
 * Uploads files as ONE document (multiple pages) into a slot.
 * The previous current document of the slot becomes history.
 */
export async function uploadDocument({ ownerType, ownerId, slotKey, files, expiryAtUpload = null, title = null }) {
  const prepared = await prepareFiles(files);
  const docId = uuid();
  const uploaded = [];
  try {
    for (const p of prepared) {
      const path = `${ownerType}/${ownerId}/${slotKey}/${uuid()}.${p.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, p.blob, { contentType: p.mime, upsert: false });
      if (error) throw error;
      uploaded.push({ path, mime: p.mime, size: p.blob.size });
    }
  } catch (e) {
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
    throw e;
  }

  const prev = docsOf(ownerType, ownerId, slotKey).filter((d) => d.is_current);
  try {
    if (prev.length) {
      const { error } = await sb.from('documents')
        .update({ is_current: false, replaced_at: new Date().toISOString() })
        .in('id', prev.map((d) => d.id));
      if (error) throw error;
    }
    const { error: e1 } = await sb.from('documents').insert({
      id: docId, owner_type: ownerType, owner_id: ownerId, slot_key: slotKey,
      is_current: true, expiry_at_upload: expiryAtUpload || null, title,
    });
    if (e1) throw e1;
    const { error: e2 } = await sb.from('document_pages').insert(uploaded.map((u, i) => ({
      document_id: docId, storage_path: u.path, page_no: i + 1, mime: u.mime, size_bytes: u.size,
    })));
    if (e2) throw e2;
  } catch (e) {
    // roll back
    await sb.from('documents').delete().eq('id', docId);
    if (prev.length) await sb.from('documents').update({ is_current: true, replaced_at: null }).in('id', prev.map((d) => d.id));
    await sb.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
    throw e;
  }
  await load('documents', 'pages');
  return docId;
}

export async function deleteDocument(docId) {
  const paths = pagesOf(docId).map((p) => p.storage_path);
  if (paths.length) {
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }
  const { error } = await sb.from('documents').delete().eq('id', docId);
  if (error) throw error;
  await load('documents', 'pages');
}

/** Removes every document + file of an owner (used before hard-deleting a vehicle/driver/service). */
export async function deleteOwnerDocuments(ownerType, ownerId) {
  for (const d of docsOf(ownerType, ownerId)) await deleteDocument(d.id);
}

// ---------- signed URLs ----------
export async function signedUrls(paths) {
  if (!paths.length) return [];
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 60);
  if (error) throw error;
  return data.map((d) => d.signedUrl);
}

// ---------- viewer ----------
export function openDocument(doc, { onChange } = {}) {
  const pages = pagesOf(doc.id);
  return sheet({
    title: labelOf(doc.slot_key),
    wide: true,
    async render(body, close) {
      body.innerHTML = `
        <p class="muted">הועלה ${fmtDate(doc.created_at)}${doc.expiry_at_upload ? ` · תוקף בעת ההעלאה: ${fmtDate(doc.expiry_at_upload)}` : ''}${doc.is_current ? '' : ` · <b>היסטוריה</b>${doc.replaced_at ? ` (הוחלף ${fmtDate(doc.replaced_at)})` : ''}`}</p>
        <div class="viewer"><div class="loading"><span class="spinner"></span></div></div>
        <div class="btn-row">
          <button class="btn btn-danger-ghost" data-del>${icon('trash')} מחיקת המסמך</button>
        </div>`;
      $('[data-del]', body).onclick = async () => {
        if (!await confirmDialog('למחוק את המסמך לצמיתות?', { ok: 'מחיקה', danger: true })) return;
        try {
          await deleteDocument(doc.id);
          toast('המסמך נמחק');
          close(true);
          onChange?.();
        } catch (e) { toast(errText(e), 'err'); }
      };
      try {
        const urls = await signedUrls(pages.map((p) => p.storage_path));
        const stamp = Date.now();
        $('.viewer', body).innerHTML = pages.map((p, i) => (p.mime === 'application/pdf'
          ? `<a class="btn btn-secondary pdf-link" data-path="${esc(p.storage_path)}" href="${esc(urls[i])}" target="_blank" rel="noopener">${icon('file')} פתיחת PDF${pages.length > 1 ? ` (עמוד ${i + 1})` : ''}</a>`
          : `<a href="${esc(urls[i])}" target="_blank" rel="noopener" class="viewer-img" data-path="${esc(p.storage_path)}"><img src="${esc(urls[i])}" alt="עמוד ${i + 1}" loading="lazy"></a>`)).join('')
          || '<p class="muted">אין קבצים במסמך</p>';
        // Signed URLs live 60s — refresh on click if stale (open window synchronously for iOS)
        body.querySelectorAll('a[data-path]').forEach((a) => {
          a.addEventListener('click', async (ev) => {
            if (Date.now() - stamp < 50000) return;
            ev.preventDefault();
            const w = window.open('', '_blank');
            const [u] = await signedUrls([a.dataset.path]);
            if (w) w.location = u; else location.href = u;
          });
        });
      } catch (e) {
        $('.viewer', body).innerHTML = `<p class="error-text">${esc(errText(e))}</p>`;
      }
    },
  });
}

// ---------- slot widget ----------
/**
 * Renders the attach/view/history controls for one document slot.
 * opts: { ownerType, slotKey, getOwnerId: async () => id|null, getExpiry: () => iso|null, compact }
 */
export function docSlot(opts) {
  const el = document.createElement('div');
  el.className = 'doc-slot';
  let busy = false;

  const render = () => {
    const ownerId = opts.ownerId?.();
    const all = ownerId ? docsOf(opts.ownerType, ownerId, opts.slotKey) : [];
    const current = all.find((d) => d.is_current);
    const history = all.filter((d) => !d.is_current)
      .sort((a, b) => (b.replaced_at || '').localeCompare(a.replaced_at || ''));
    el.innerHTML = `
      <div class="doc-actions">
        ${current ? `
          <button type="button" class="doc-btn doc-current" data-open="${current.id}">
            ${icon(pagesOf(current.id)[0]?.mime === 'application/pdf' ? 'file' : 'image', 20)}
            <span>מסמך · ${fmtDate(current.created_at)}${pagesOf(current.id).length > 1 ? ` · ${pagesOf(current.id).length} עמ'` : ''}</span>
          </button>` : ''}
        <label class="doc-btn doc-upload ${busy ? 'busy' : ''}">
          ${busy ? '<span class="spinner spinner-sm"></span><span>מעלה…</span>'
            : `${icon(current ? 'refresh' : 'camera', 20)}<span>${current ? 'החלפה' : 'צירוף מסמך'}</span>`}
          <input type="file" accept="image/*,application/pdf" multiple ${busy ? 'disabled' : ''} hidden>
        </label>
      </div>
      ${history.length ? `
        <details class="doc-history">
          <summary>${icon('history', 18)} גרסאות קודמות (${history.length})</summary>
          <ul>${history.map((d) => `
            <li><button type="button" class="link-btn" data-open="${d.id}">
              הועלה ${fmtDate(d.created_at)}${d.expiry_at_upload ? ` · תוקף אז ${fmtDate(d.expiry_at_upload)}` : ''}
            </button></li>`).join('')}
          </ul>
        </details>` : ''}`;

    el.querySelectorAll('[data-open]').forEach((b) => {
      b.onclick = () => {
        const doc = store.documents.find((d) => d.id === b.dataset.open);
        if (doc) openDocument(doc, { onChange: render });
      };
    });
    const input = el.querySelector('input[type=file]');
    input.onchange = async () => {
      const files = [...input.files];
      input.value = '';
      if (!files.length) return;
      busy = true; render();
      try {
        const id = await opts.getOwnerId();
        if (!id) { busy = false; render(); return; }
        await uploadDocument({
          ownerType: opts.ownerType, ownerId: id, slotKey: opts.slotKey, files,
          expiryAtUpload: opts.getExpiry?.() || null,
        });
        toast(current ? 'המסמך הוחלף. הקודם נשמר בהיסטוריה' : 'המסמך נשמר');
      } catch (e) {
        toast(errText(e), 'err');
      }
      busy = false; render();
    };
  };
  render();
  el.refresh = render;
  return el;
}
