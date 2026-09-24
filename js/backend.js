// Sync through Firebase (Firestore + Authentication), using the plain REST APIs.
// Reading is public. Writing needs the editor passphrase, which is the password of one
// Firebase user (config: firebase.editorEmail). The passphrase is never stored in this
// code; Firebase checks it and slows down repeated wrong guesses.
//
// Firestore layout:  site/tree      { json, rev, updated }   the whole family tree
//                    history/<rev>  { json, saved }          every earlier version
//                    media/<id>     { mime, data, parts }    uploaded photos / voice notes (+ <id>~1, <id>~2 … for big files)
//                    suggestions/*  { person, message, … }   "Suggest a change" messages
const FB = () => window.FT_CONFIG?.firebase || {};
export const hasBackend = () => !!(FB().apiKey && FB().projectId);

const docsUrl = () => `https://firestore.googleapis.com/v1/projects/${FB().projectId}/databases/(default)/documents`;
const keyQ = () => `key=${encodeURIComponent(FB().apiKey)}`;

// ---------- Firestore value helpers ----------
const S = v => ({ stringValue: String(v ?? '') });
const N = v => ({ integerValue: String(v | 0) });
const TS = () => ({ timestampValue: new Date().toISOString() });
const val = f => f == null ? undefined : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? +f.integerValue : f.timestampValue ?? f.booleanValue;
const fieldsOf = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, f]) => [k, val(f)]));

async function fsFetch(path, opts = {}, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await idToken()}`;
  const res = await fetch(`${docsUrl()}${path}${path.includes('?') ? '&' : '?'}${keyQ()}`, { ...opts, headers });
  if (res.status === 404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const st = j.error?.status;
    const err = new Error(st === 'PERMISSION_DENIED' ? 'not-allowed' : st === 'FAILED_PRECONDITION' ? 'conflict' : j.error?.message || `HTTP ${res.status}`);
    err.code = st;
    throw err;
  }
  return j;
}

// ---------- the tree ----------
async function readTreeDoc() {
  const doc = await fsFetch(`/site/tree?t=${Date.now()}`);
  if (!doc) return null;
  return { ...fieldsOf(doc), updateTime: doc.updateTime };
}

export async function fetchRemoteTree() {
  const d = await readTreeDoc();
  if (!d?.json) return null; // nothing saved yet
  const tree = JSON.parse(d.json);
  tree.meta = { ...(tree.meta || {}), rev: d.rev || 0 };
  return tree;
}

// Saves the tree unless someone saved a newer one since baseRev (then {conflict:true}).
export async function saveTree(tree, baseRev, force = false) {
  const cur = await readTreeDoc();
  const curRev = cur?.rev || 0;
  if (curRev > baseRev && !force) return { conflict: true, rev: curRev };
  const rev = curRev + 1;
  const updated = new Date().toISOString().slice(0, 10);
  tree = { ...tree, meta: { ...(tree.meta || {}), rev, updated } };
  const name = p => `projects/${FB().projectId}/databases/(default)/documents/${p}`;
  const writes = [{
    update: { name: name('site/tree'), fields: { json: S(JSON.stringify(tree)), rev: N(rev), updated: S(updated) } },
    // refuse if another save landed between our read and this write
    currentDocument: cur ? { updateTime: cur.updateTime } : { exists: false },
  }];
  if (cur?.json) writes.push({ update: { name: name(`history/${String(curRev).padStart(6, '0')}`), fields: { json: S(cur.json), saved: TS() } } });
  await fsFetch(':commit', { method: 'POST', body: JSON.stringify({ writes }) }, true);
  return { rev, updated };
}

// ---------- uploads ----------
const PART = 900_000; // Firestore documents hold up to ~1 MB
export async function uploadMedia(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const mime = head.slice(5).split(';')[0];
  const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const parts = Math.ceil(data.length / PART) || 1;
  for (let i = parts - 1; i >= 0; i--) {
    const fields = { data: S(data.slice(i * PART, (i + 1) * PART)) };
    if (i === 0) Object.assign(fields, { mime: S(mime), parts: N(parts), created: TS() });
    await fsFetch(`/media?documentId=${id}${i ? '~' + i : ''}`, { method: 'POST', body: JSON.stringify({ fields }) }, true);
  }
  return `fs:${id}`;
}

// "fs:<id>" → data: URL (cached for this visit; the service worker caches the downloads).
const mediaCache = new Map();
export function resolveMedia(src) {
  if (!src?.startsWith('fs:')) return Promise.resolve(src);
  if (!mediaCache.has(src)) {
    const id = src.slice(3);
    mediaCache.set(src, (async () => {
      const first = await fsFetch(`/media/${encodeURIComponent(id)}`);
      if (!first) throw new Error('missing file');
      const f = fieldsOf(first);
      let data = f.data;
      for (let i = 1; i < (f.parts || 1); i++) data += fieldsOf(await fsFetch(`/media/${encodeURIComponent(id)}~${i}`)).data;
      return `data:${f.mime};base64,${data}`;
    })().catch(e => { mediaCache.delete(src); throw e; }));
  }
  return mediaCache.get(src);
}

// ---------- suggestions ----------
export async function sendSuggestion(s) {
  const fields = { created: TS() };
  for (const k of ['person', 'personId', 'type', 'message', 'name', 'contact', 'link']) fields[k] = S(String(s[k] || '').slice(0, 3000));
  await fsFetch('/suggestions', { method: 'POST', body: JSON.stringify({ fields }) });
}
export async function listSuggestions() {
  const j = await fsFetch('/suggestions?pageSize=100&orderBy=created%20desc', {}, true);
  return (j?.documents || []).map(d => ({ id: d.name.split('/').pop(), ...fieldsOf(d) }));
}
export async function deleteSuggestion(id) {
  await fsFetch(`/suggestions/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
}

// ---------- passphrase sign-in ----------
// Only Firebase's refresh token is kept (this tab, or this device if "remember" is ticked),
// never the passphrase itself.
const AUTH = { token: null, exp: 0 };
function stored() { try { return sessionStorage.getItem('ft.auth') || localStorage.getItem('ft.auth') || ''; } catch (e) { return ''; } }
function store(refresh, remember) {
  try {
    sessionStorage.removeItem('ft.auth'); localStorage.removeItem('ft.auth');
    if (refresh) (remember ? localStorage : sessionStorage).setItem('ft.auth', refresh);
  } catch (e) {}
}
const remembered = () => { try { return !!localStorage.getItem('ft.auth'); } catch (e) { return false; } };
export const isSignedIn = () => !!stored();
export function signOut() { AUTH.token = null; AUTH.exp = 0; store(''); }

export async function signIn(pass, remember) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?${keyQ()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FB().editorEmail, password: pass, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!res.ok) {
    const m = j.error?.message || '';
    throw new Error(/PASSWORD|CREDENTIAL|EMAIL_NOT_FOUND/.test(m) ? 'wrong-passphrase' : /TOO_MANY/.test(m) ? 'too-many' : m || 'sign-in failed');
  }
  AUTH.token = j.idToken; AUTH.exp = Date.now() + (+j.expiresIn - 60) * 1000;
  store(j.refreshToken, remember);
}

async function idToken() {
  if (AUTH.token && Date.now() < AUTH.exp) return AUTH.token;
  const refresh = stored();
  if (!refresh) throw new Error('signed-out');
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?${keyQ()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh)}`,
  });
  const j = await res.json();
  if (!res.ok) { signOut(); throw new Error('signed-out'); }
  AUTH.token = j.id_token; AUTH.exp = Date.now() + (+j.expires_in - 60) * 1000;
  store(j.refresh_token, remembered());
  return AUTH.token;
}
export const checkSignIn = () => idToken().then(() => true);
