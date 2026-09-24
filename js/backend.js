// Talks to the Google Apps Script backend (see backend/Code.gs).
const url = () => (window.FT_CONFIG?.backend?.url || '').trim();
export const hasBackend = () => /^https:\/\//.test(url());

export async function fetchRemoteTree() {
  const res = await fetch(`${url()}?action=get&t=${Date.now()}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'backend error');
  return j.tree; // null until the first save
}

// POST as text/plain so the browser sends it without a CORS preflight.
export async function post(body) {
  const res = await fetch(url(), { method: 'POST', body: JSON.stringify(body) });
  const j = await res.json();
  return j;
}

// Voice notes are stored in Drive as "drive:<id>"; turn them into playable URLs.
const mediaCache = new Map();
export async function resolveMedia(src) {
  if (!src?.startsWith('drive:')) return src;
  if (mediaCache.has(src)) return mediaCache.get(src);
  const res = await fetch(`${url()}?action=media&id=${encodeURIComponent(src.slice(6))}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'media error');
  const bytes = Uint8Array.from(atob(j.data), c => c.charCodeAt(0));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: j.mime }));
  mediaCache.set(src, blobUrl);
  return blobUrl;
}
