// ntfy publishing — shared by the browser (test message) and scripts/daily.mjs (Node 20).
export const NTFY_SERVER = 'https://ntfy.sh';

// HTTP headers must be ASCII; ntfy decodes RFC 2047 encoded-words for Hebrew text.
export function encodeHeader(text) {
  const s = String(text);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export function topicUrl(topic) {
  return `${NTFY_SERVER}/${encodeURIComponent(topic)}`;
}

export async function ntfyPublish({ topic, title, body, priority = 'default', tags = [], click = '' }) {
  const headers = {
    Title: encodeHeader(title),
    Priority: priority,
  };
  if (tags.length) headers.Tags = tags.join(',');
  if (click) headers.Click = click;
  const res = await fetch(topicUrl(topic), { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json().catch(() => ({}));
}
