// Built-in editor: edit people & links, upload photos/voice notes, save to Firebase.
import { store, person, union, parentsOf, unionsOf, spouseIn, kidsOf, displayName, isLiving, newId, changed, setTree, search, contextLine, allPeople, isNamed, childrenOf, parentIds, cacheTree } from './data.js';
import { t } from './i18n.js';
import { esc, icon, avatar, html, $, $$, toast, modal, confirmBox, attachSearch, download, nameOf, srcAttr } from './ui.js';
import { getMe, setMe, closePerson } from './person.js';
import { searchRow } from './views.js';
import { hasBackend, fetchRemoteTree, saveTree, uploadMedia, signIn, signOut, isSignedIn, checkSignIn, listSuggestions, deleteSuggestion } from './backend.js';

const CFG = window.FT_CONFIG || {};
const ED = { on: false, dirty: 0, baseRev: 0, uploads: new Map() };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isEditing = () => ED.on;

// ---------- draft ----------
function saveDraft() {
  try {
    const uploads = [...ED.uploads].filter(([, u]) => u.dataUrl.length < 1.5e6).map(([path, u]) => ({ path, dataUrl: u.dataUrl }));
    localStorage.setItem('ft.draft', JSON.stringify({ tree: store.tree, uploads, dirty: ED.dirty, baseRev: ED.baseRev }));
  } catch (e) { toast('Draft too large to keep in this browser — save soon.'); }
}
function clearDraft() { try { localStorage.removeItem('ft.draft'); } catch (e) {} }
function readDraft() { try { return JSON.parse(localStorage.getItem('ft.draft') || 'null'); } catch (e) { return null; } }

// ---------- mode ----------
export async function enterEditor(rerender) {
  ED.rerender = rerender;
  if (!hasBackend()) {
    modal({ title: t('menuEditor'), body: `<p>${esc(t('noBackend'))}</p>` });
    return;
  }
  if (!isSignedIn()) { openUnlock(() => enterEditor(rerender)); return; }
  try {
    await checkSignIn();
    // start from the freshest copy
    const remote = await fetchRemoteTree();
    if (remote && (remote.meta?.rev || 0) >= (store.tree.meta?.rev || 0)) { setTree(remote); cacheTree(); }
  } catch (e) {
    if (e.message === 'signed-out') { openUnlock(() => enterEditor(rerender)); return; }
    toast(t('genericError', { msg: e.message }), 5000); return;
  }
  ED.on = true;
  ED.baseRev = store.tree.meta?.rev || 0;
  try { localStorage.setItem('ft.editing', '1'); } catch (e) {}
  const draft = readDraft();
  if (draft?.dirty && await confirmBox(t('draftFound'), t('restore'))) {
    setTree(draft.tree); ED.dirty = draft.dirty; ED.baseRev = draft.baseRev ?? ED.baseRev;
    (draft.uploads || []).forEach(u => ED.uploads.set(u.path, { dataUrl: u.dataUrl }));
  } else if (draft) clearDraft();
  updateBar(); changed();
}

export function exitEditor() {
  if (ED.dirty && !confirm(t('edUnsaved', { n: ED.dirty }) + ' — ' + t('edDiscard') + '?')) return;
  try { localStorage.removeItem('ft.editing'); } catch (e) {}
  signOut();
  if (ED.dirty) { clearDraft(); location.reload(); return; }
  ED.on = false;
  updateBar(); changed();
}
// Hide the editor but stay signed in, so it can be switched back on from Settings.
export function hideEditor() {
  try { localStorage.removeItem('ft.editing'); } catch (e) {}
  ED.on = false;
  updateBar(); changed();
  toast(t('editorHidden'), 3500);
}

export const wantsEditor = () => { try { return localStorage.getItem('ft.editing') === '1' && isSignedIn(); } catch (e) { return false; } };

function commit() { ED.dirty++; saveDraft(); updateBar(); changed(); }

export function updateBar() {
  const bar = $('#edit-bar');
  bar.hidden = !ED.on;
  if (!ED.on) return;
  bar.innerHTML = `${icon('edit')}<strong>${t('edBar')}</strong>
    <span class="muted">${ED.dirty ? t('edUnsaved', { n: ED.dirty }) : t('edSaved')}</span><span class="spacer"></span>
    <button class="btn sm" data-e="new">${icon('plus')}${t('edNewPerson')}</button>
    <a class="btn sm" href="#/editor">${t('edTools')}</a>
    ${ED.dirty ? `<button class="btn sm" data-e="discard">${t('edDiscard')}</button><button class="btn sm primary" data-e="save">${icon('upload')}${t('edSaveGh')}</button>` : ''}
    <button class="btn sm ghost" data-e="hide" aria-label="${t('hideEditor')}" title="${t('hideEditor')}">${icon('close')}</button>`;
  bar.onclick = async e => {
    const a = e.target.closest('[data-e]')?.dataset.e;
    if (a === 'save') saveAll();
    if (a === 'discard' && await confirmBox(t('edDiscard') + '?', t('edDiscard'))) { clearDraft(); ED.dirty = 0; ED.uploads.clear(); location.reload(); }
    if (a === 'hide') hideEditor();
    if (a === 'new') { const id = createPerson({}); commit(); editPerson(id); }
  };
}

// Remove data that must not be published.
function sanitized(tree) {
  const out = JSON.parse(JSON.stringify(tree));
  for (const p of Object.values(out.people)) {
    if (!CFG.privacy?.keepLivingBirthYears && p.birth?.y && isLiving(p)) { delete p.birth.y; if (!p.birth.m && !p.birth.d) delete p.birth; }
    for (const k of Object.keys(p)) if (p[k] === '' || p[k] == null || (Array.isArray(p[k]) && !p[k].length)) delete p[k];
  }
  return out;
}

async function saveAll() {
  const btn = $('[data-e="save"]', $('#edit-bar'));
  if (btn) { btn.disabled = true; btn.textContent = t('edSaving'); }
  try {
    // 1. uploads (photos, voice notes) → Firestore "media"
    const done = new Map();
    for (const [, u] of ED.uploads) done.set(u.dataUrl, await uploadMedia(u.dataUrl));
    for (const p of Object.values(store.P)) {
      if (done.has(p.photo)) p.photo = done.get(p.photo);
      (p.media || []).forEach(m => { if (done.has(m.src)) m.src = done.get(m.src); });
    }
    ED.uploads.clear();
    // 2. the tree itself
    const clean = sanitized(store.tree);
    let r = await saveTree(clean, ED.baseRev);
    if (r.conflict) {
      if (!(await confirmBox(t('conflict'), t('save')))) throw new Error('cancelled');
      r = await saveTree(clean, ED.baseRev, true);
    }
    clean.meta = { ...(clean.meta || {}), rev: r.rev, updated: r.updated };
    setTree(clean); cacheTree();
    ED.baseRev = r.rev; ED.dirty = 0; clearDraft();
    toast(t('edSavedOk'), 4000);
  } catch (e) {
    const out = e.message === 'signed-out' || e.message === 'not-allowed';
    if (e.message !== 'cancelled') toast(out ? t('signedOut') : t('genericError', { msg: e.message }), 6000);
    saveDraft();
    if (out) { signOut(); openUnlock(() => {}); }
  }
  updateBar(); changed();
}

// ---------- unlock ----------
export function openUnlock(after) {
  const body = html(`<form style="display:grid;gap:.8rem">
    <p class="small muted">${t('passHelp')}</p>
    <label class="field"><span>${t('passphrase')}</span><input type="password" name="pass" autocomplete="current-password" required></label>
    <label class="row small"><input type="checkbox" name="remember"> ${t('rememberDevice')}</label>
  </form>`);
  const m = modal({ title: t('menuEditor'), body, foot: `<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-go>${icon('lock')}${t('unlock')}</button>` });
  const goBtn = $('[data-go]', m.el);
  const go = async () => {
    const d = new FormData(body);
    if (!d.get('pass')) return;
    goBtn.disabled = true;
    try {
      await signIn(d.get('pass'), !!d.get('remember'));
    } catch (e) {
      goBtn.disabled = false;
      toast(e.message === 'wrong-passphrase' ? t('wrongPass') : e.message === 'too-many' ? t('tooMany') : t('genericError', { msg: e.message }), 4000);
      body.pass.select();
      return;
    }
    try { localStorage.setItem('ft.editing', '1'); } catch (e) {}
    m.close(); after?.();
  };
  goBtn.onclick = go;
  body.onsubmit = e => { e.preventDefault(); go(); };
  setTimeout(() => body.pass.focus(), 50);
}

// ---------- mutations ----------
function createPerson(fields) {
  const id = newId('p');
  store.P[id] = { id, sex: 'U', ...fields };
  return id;
}
function createUnion(husband, wife) {
  const id = newId('u');
  const u = { id };
  if (husband) { u.husband = husband; u.hOrder = unionsOf(husband).length; }
  if (wife) { u.wife = wife; u.wOrder = unionsOf(wife).length; }
  store.U[id] = u;
  return id;
}
function roleFor(pid, u) {
  const sex = person(pid)?.sex;
  if (sex === 'F') return u.wife ? null : 'wife';
  if (sex === 'M') return u.husband ? null : 'husband';
  return !u.husband ? 'husband' : !u.wife ? 'wife' : null;
}
function setParent(childId, parentId) {
  const c = person(childId);
  let u = c.parents && union(c.parents);
  if (!u) { const uid = createUnion(); u = store.U[uid]; c.parents = uid; c.order = 0; }
  const role = roleFor(parentId, u);
  if (!role) { toast('Both parents are already set.'); return false; }
  u[role] = parentId; u[role === 'husband' ? 'hOrder' : 'wOrder'] = unionsOf(parentId).length;
  return true;
}
function marry(a, b) {
  const pa = person(a), pb = person(b);
  const [h, w] = pa.sex === 'F' || pb.sex === 'M' ? [b, a] : [a, b];
  return createUnion(h, w);
}
async function chooseUnion(pid, forKids) {
  const us = unionsOf(pid);
  if (!us.length) return createUnion(person(pid).sex === 'F' ? null : pid, person(pid).sex === 'F' ? pid : null);
  if (us.length === 1) return us[0].id;
  return new Promise(res => {
    const body = `<div style="display:grid;gap:.5rem">${us.map(u => { const sp = spouseIn(u, pid); return `<button class="btn" data-u="${esc(u.id)}">${sp ? esc(t('withSpouse', { name: displayName(person(sp)) })) : esc(t('unknownPartner'))}</button>`; }).join('')}</div>`;
    const m = modal({ title: t('childWith'), body, onClose: () => res(null) });
    $$('[data-u]', m.el).forEach(b => b.onclick = () => { res(b.dataset.u); m.close(); });
  });
}
function deletePerson(pid) {
  for (const u of unionsOf(pid)) {
    if (u.husband === pid) { delete u.husband; delete u.hOrder; }
    if (u.wife === pid) { delete u.wife; delete u.wOrder; }
    if (!u.husband && !u.wife && !kidsOf(u.id).length) delete store.U[u.id];
  }
  const pu = person(pid).parents;
  delete store.P[pid];
  if (pu && store.U[pu] && !store.U[pu].husband && !store.U[pu].wife && !Object.values(store.P).some(p => p.parents === pu)) delete store.U[pu];
  if (getMe() === pid) setMe(null);
}
function removeMarriage(uid) {
  const u = union(uid);
  if (!kidsOf(uid).length) delete store.U[uid];
  else toast('This couple has children — edit the children’s parents instead.');
}

// ---------- images ----------
async function fileToSquareJpeg(file, size = 360) {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}
async function fileToScaledJpeg(file, max = 1400) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

// ---------- person form ----------
const dateInputs = (prefix, d = {}) => `<div class="grid-3">
  <input type="number" name="${prefix}d" min="1" max="31" placeholder="${t('day')}" value="${d?.d || ''}" aria-label="${t('day')}">
  <select name="${prefix}m" aria-label="${t('month')}"><option value="">${t('month')}</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${d?.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
  <input type="number" name="${prefix}y" min="1000" max="2100" placeholder="${t('year')}" value="${d?.y || ''}" aria-label="${t('year')}">
</div>`;
function readDate(fd, prefix) {
  const d = {};
  const y = +fd.get(prefix + 'y'), m = +fd.get(prefix + 'm'), day = +fd.get(prefix + 'd');
  if (y) d.y = y; if (m) d.m = m; if (day) d.d = day;
  return Object.keys(d).length ? d : null;
}

export function editPerson(pid) {
  const p = person(pid);
  if (!p) return;
  closePerson();
  const unions = unionsOf(pid);
  const media = [...(p.media || [])];
  let photo = p.photo || '';
  let recorder = null;

  const body = html(`<form style="display:grid;gap:.9rem">
    <div class="row">
      <div data-photo>${avatar({ ...p, photo }, 'lg')}</div>
      <div class="row">
        <label class="btn sm">${icon('photo')}${t('changePhoto')}<input type="file" accept="image/*" data-photo-in hidden></label>
        ${photo ? `<button type="button" class="btn sm ghost" data-photo-rm>${t('removePhoto')}</button>` : ''}
      </div>
    </div>
    <div class="grid-2">
      <label class="field"><span>${t('given')}</span><input type="text" name="given" value="${esc(p.given || '')}"></label>
      <label class="field"><span>${t('surname')}</span><input type="text" name="surname" value="${esc(p.surname || '')}"></label>
      <label class="field"><span>${t('nickname')}</span><input type="text" name="nickname" value="${esc(p.nickname || '')}" placeholder="Baba …, Iya …"></label>
      <div class="field"><span>${t('sex')}</span><div class="seg">${[['M', t('male')], ['F', t('female')], ['U', t('unknownSex')]].map(([v, l]) => `<label><input type="radio" name="sex" value="${v}" ${p.sex === v ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    </div>
    <fieldset><legend>${t('birth')}</legend>${dateInputs('b', p.birth)}
      <input type="text" name="birthPlace" placeholder="${t('birthPlace')}" value="${esc(p.birthPlace || '')}">
      <div class="small muted">${t('livingNote')}</div></fieldset>
    <fieldset><legend>${t('death')}</legend>
      <label class="row small"><input type="checkbox" name="deceased" ${p.deceased || p.death ? 'checked' : ''}> ${t('isDeceased')}</label>
      ${dateInputs('d', p.death)}
      <input type="text" name="burialPlace" placeholder="${t('burialPlace')}" value="${esc(p.burialPlace || '')}"></fieldset>
    <div class="grid-2">
      <label class="field"><span>${t('residence')}</span><input type="text" name="residence" value="${esc(p.residence || '')}"></label>
      <label class="field"><span>${t('occupation')}</span><input type="text" name="occupation" value="${esc(p.occupation || '')}"></label>
    </div>
    <label class="field"><span>${t('oriki')}</span><textarea name="oriki" rows="3">${esc(p.oriki || '')}</textarea></label>
    <label class="field"><span>${t('story')}</span><textarea name="bio" rows="4">${esc(p.bio || '')}</textarea></label>
    <label class="field"><span>${t('notes')}</span><textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></label>
    ${p.parents ? `<label class="field"><span>${t('order')}</span><input type="number" name="order" min="0" value="${(p.order ?? 0) + 1}"></label>` : ''}
    <fieldset><legend>${t('media')}</legend><div data-media></div>
      <div class="row">
        <label class="btn sm">${icon('plus')}${t('addMedia')}<input type="file" accept="image/*,audio/*" data-media-in hidden></label>
        <button type="button" class="btn sm" data-rec>${icon('mic')}${t('recordVoice')}</button>
        <button type="button" class="btn sm" data-link>${icon('link')}${t('addLink')}</button>
      </div></fieldset>
    ${unions.length ? `<fieldset><legend>${t('married')}</legend>${unions.map(u => {
      const sp = spouseIn(u, pid);
      return `<div style="display:grid;gap:.4rem"><div class="row"><strong>${sp ? nameOf(person(sp)) : t('unknownPartner')}</strong><button type="button" class="btn sm ghost danger" data-unmarry="${esc(u.id)}">${t('removeSpouse')}</button></div>
        ${dateInputs('m_' + u.id + '_', u.marriage)}<input type="text" name="mp_${esc(u.id)}" placeholder="${t('marriagePlace')}" value="${esc(u.place || '')}">
        <label class="row small"><input type="checkbox" name="sep_${esc(u.id)}" ${u.separated ? 'checked' : ''}> ${t('separated')}</label></div>`;
    }).join('<hr style="border:0;border-top:1px solid var(--line)">')}</fieldset>` : ''}
    <fieldset><legend>${t('relatives')}</legend>
      <div class="row">
        ${!parentsOf(pid)?.father ? `<button type="button" class="btn sm" data-add="father">${icon('plus')}${t('addFather')}</button>` : ''}
        ${!parentsOf(pid)?.mother ? `<button type="button" class="btn sm" data-add="mother">${icon('plus')}${t('addMother')}</button>` : ''}
        <button type="button" class="btn sm" data-add="spouse">${icon('plus')}${t('addSpouse')}</button>
        <button type="button" class="btn sm" data-add="child">${icon('plus')}${t('addChild')}</button>
        <button type="button" class="btn sm" data-add="sibling">${icon('plus')}${t('addSibling')}</button>
        ${p.parents ? `<button type="button" class="btn sm ghost danger" data-unparent>${t('removeFromParents')}</button>` : ''}
      </div>
      <div class="small muted">${t('linkExisting')}</div>
      <div class="row" style="align-items:stretch">
        <div class="picker" style="flex:1 1 200px"><input type="search" data-link-search placeholder="${esc(t('searchPh'))}"><ul class="search-results" hidden></ul></div>
        <select data-link-role style="width:auto"><option value="spouse">${t('asSpouse')}</option><option value="child">${t('asChild')}</option><option value="parent">${t('asParent')}</option></select>
      </div>
    </fieldset>
  </form>`);

  const foot = html(`<div style="display:contents"><button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash')}${t('deletePerson')}</button>
    <button type="button" class="btn" data-close>${t('cancel')}</button><button type="button" class="btn primary" data-apply>${t('save')}</button></div>`);
  const m = modal({ title: isNamed(p) ? displayName(p) : t('edNewPerson'), body, foot, wide: true });

  const drawMedia = () => {
    $('[data-media]', body).innerHTML = media.map((x, i) => `<div class="row small" style="margin-bottom:.4rem">
      ${x.type === 'audio' ? `<audio controls ${srcAttr(x.src)} style="max-width:220px"></audio>` : x.type === 'image' ? `<img ${srcAttr(x.src)} alt="" style="height:48px;border-radius:6px">` : `<a href="${esc(x.src)}" target="_blank" rel="noopener">${esc(x.src.slice(0, 40))}</a>`}
      <input type="text" data-cap="${i}" value="${esc(x.caption || '')}" placeholder="${t('caption')}" style="flex:1;min-width:120px">
      <button type="button" class="icon-btn" data-mrm="${i}" aria-label="${t('delete')}">${icon('trash')}</button></div>`).join('');
  };
  drawMedia();
  body.addEventListener('input', e => { if (e.target.dataset.cap) media[+e.target.dataset.cap].caption = e.target.value; });

  // apply form fields to the person (without closing)
  const apply = () => {
    const fd = new FormData(body);
    const s = k => (fd.get(k) || '').toString().trim();
    Object.assign(p, { given: s('given'), surname: s('surname'), nickname: s('nickname'), sex: fd.get('sex') || 'U', birthPlace: s('birthPlace'), burialPlace: s('burialPlace'), residence: s('residence'), occupation: s('occupation'), oriki: s('oriki'), bio: s('bio'), notes: s('notes') });
    const b = readDate(fd, 'b'), d = readDate(fd, 'd');
    b ? (p.birth = b) : delete p.birth;
    d ? (p.death = d) : delete p.death;
    fd.get('deceased') || d ? (p.deceased = true) : delete p.deceased;
    if (p.parents && fd.get('order')) p.order = Math.max(0, +fd.get('order') - 1);
    photo ? (p.photo = photo) : delete p.photo;
    p.media = media.filter(x => x.src);
    for (const u of unionsOf(pid)) {
      const md = readDate(fd, 'm_' + u.id + '_');
      md ? (u.marriage = md) : delete u.marriage;
      const pl = s('mp_' + u.id); pl ? (u.place = pl) : delete u.place;
      fd.get('sep_' + u.id) ? (u.separated = true) : delete u.separated;
    }
    for (const k of Object.keys(p)) if (p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) delete p[k];
  };
  const reopen = id => { m.close(); commit(); editPerson(id); };

  $('[data-apply]', m.el).onclick = () => { apply(); m.close(); commit(); };
  $('[data-del]', m.el).onclick = async () => {
    if (!(await confirmBox(t('confirmDelete', { name: displayName(p) }), t('delete')))) return;
    deletePerson(pid); m.close(); commit(); location.hash = '#/chart';
  };
  $('[data-photo-in]', body).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    photo = await fileToSquareJpeg(f);
    ED.uploads.set(`photos/${pid}.jpg`, { dataUrl: photo });
    $('[data-photo]', body).innerHTML = avatar({ ...p, photo }, 'lg');
  };
  $('[data-photo-rm]', body)?.addEventListener('click', () => { photo = ''; $('[data-photo]', body).innerHTML = avatar({ ...p, photo: '' }, 'lg'); });
  $('[data-media-in]', body).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const isImg = f.type.startsWith('image/');
    if (!isImg && f.size > 20e6) { toast('File too large (max 20 MB).'); return; }
    const dataUrl = isImg ? await fileToScaledJpeg(f) : await blobToDataUrl(f);
    const ext = isImg ? 'jpg' : (f.name.split('.').pop() || 'mp3').toLowerCase();
    ED.uploads.set(`media/${pid}-${Date.now().toString(36)}.${ext}`, { dataUrl });
    media.push({ type: isImg ? 'image' : 'audio', src: dataUrl, caption: f.name.replace(/\.[^.]+$/, '') });
    drawMedia();
  };
  $('[data-rec]', body).onclick = async e => {
    const btn = e.currentTarget;
    if (recorder) { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = ev => chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const ext = recorder.mimeType.includes('mp4') ? 'm4a' : recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
        const dataUrl = await blobToDataUrl(blob);
        ED.uploads.set(`media/${pid}-${Date.now().toString(36)}.${ext}`, { dataUrl });
        media.push({ type: 'audio', src: dataUrl, caption: new Date().toLocaleDateString() });
        recorder = null; btn.innerHTML = `${icon('mic')}${t('recordVoice')}`; drawMedia();
      };
      recorder.start();
      btn.innerHTML = `${icon('mic')}${t('stopRec')}`;
    } catch (err) { toast(t('genericError', { msg: err.message })); }
  };
  $('[data-link]', body).onclick = () => {
    const url = prompt('URL (YouTube, Google Drive, …)');
    if (url && /^https?:\/\//.test(url)) { media.push({ type: 'link', src: url, caption: '' }); drawMedia(); }
  };
  body.addEventListener('click', async e => {
    const rm = e.target.closest('[data-mrm]');
    if (rm) { media.splice(+rm.dataset.mrm, 1); drawMedia(); return; }
    const un = e.target.closest('[data-unmarry]');
    if (un) { apply(); removeMarriage(un.dataset.unmarry); reopen(pid); return; }
    if (e.target.closest('[data-unparent]')) { apply(); delete p.parents; delete p.order; reopen(pid); return; }
    const add = e.target.closest('[data-add]')?.dataset.add;
    if (!add) return;
    apply();
    if (add === 'father' || add === 'mother') {
      const nid = createPerson({ sex: add === 'father' ? 'M' : 'F' });
      if (!setParent(pid, nid)) { delete store.P[nid]; return; }
      reopen(nid);
    } else if (add === 'spouse') {
      const nid = createPerson({ sex: p.sex === 'M' ? 'F' : p.sex === 'F' ? 'M' : 'U' });
      marry(pid, nid); reopen(nid);
    } else if (add === 'child') {
      const uid = await chooseUnion(pid);
      if (!uid) return;
      const nid = createPerson({ parents: uid, order: kidsOf(uid).length });
      reopen(nid);
    } else if (add === 'sibling') {
      if (!p.parents) { p.parents = createUnion(); p.order = 0; }
      const nid = createPerson({ parents: p.parents, order: kidsOf(p.parents).length + 1 });
      reopen(nid);
    }
  });
  attachSearch($('[data-link-search]', body), $('[data-link-search]', body).nextElementSibling, async other => {
    if (other.id === pid) return;
    apply();
    const role = $('[data-link-role]', body).value;
    if (role === 'spouse') marry(pid, other.id);
    if (role === 'parent' && !setParent(pid, other.id)) return;
    if (role === 'child') { const uid = await chooseUnion(pid); if (!uid) return; other.parents = uid; other.order = kidsOf(uid).length; }
    reopen(pid);
  }, { searchFn: q => search(q), render: searchRow });
}

// ---------- tools page ----------
export function findIssues() {
  const out = [];
  const nowY = new Date().getFullYear();
  for (const p of allPeople()) {
    const add = msg => out.push({ pid: p.id, msg });
    if (p.birth?.y && p.death?.y && p.death.y < p.birth.y) add(t('issueDeathBeforeBirth'));
    if ((p.birth?.y || 0) > nowY || (p.death?.y || 0) > nowY) add(t('issueFuture'));
    if (isNamed(p) && p.sex === 'U') add(t('issueNoSex'));
    if (!p.parents && !unionsOf(p.id).length) add(t('issueIsolated'));
    if (p.birth?.y) for (const par of parentIds(p.id)) {
      const q = person(par);
      if (q?.birth?.y && p.birth.y < q.birth.y + 12) add(t('issueChildBeforeParent', { name: displayName(q) }));
      if (q?.birth?.y && p.birth.y > q.birth.y + 75) add(t('issueTooOld', { name: displayName(q) }));
    }
  }
  return out;
}

export function renderEditorPage(view, rerender) {
  if (!ED.on) { view.innerHTML = `<div class="page"><div class="empty"><p>${t('menuEditor')}</p><button class="btn primary" data-on>${icon('edit')}${t('menuEditor')}</button></div></div>`; $('[data-on]', view).onclick = () => enterEditor(rerender); return; }
  const issues = findIssues();
  const unnamed = allPeople().filter(p => !isNamed(p));
  const meta = store.tree.meta || (store.tree.meta = {});
  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('edTools')}</h1></div>
    <div class="two-col">
      <section class="card-box"><h2>${t('siteSettings')}</h2>
        <label class="field"><span>${t('siteTitle')}</span><input type="text" data-title value="${esc(meta.title || '')}"></label>
        <label class="field" style="margin-top:.8rem"><span>${t('defaultPerson')}: <strong>${esc(displayName(person(meta.focusId)))}</strong></span>
          <div class="picker"><input type="search" data-focus-search placeholder="${esc(t('searchPh'))}"><ul class="search-results" hidden></ul></div></label>
        <div class="row" style="margin-top:1rem"><button class="btn sm" data-json>${icon('download')}${t('menuJson')}</button></div>
      </section>
      <section class="card-box"><h2>${t('backend')}</h2>
        <p class="small">${t('backendOk')} · rev ${store.tree.meta?.rev || 0} · ${esc(store.tree.meta?.updated || '')}</p>
        <p class="small muted">${t('backendHelp')}</p>
      </section>
    </div>
    <section class="card-box" style="margin-top:1rem"><h2>${t('suggestions')}</h2><div data-sugg class="small muted">…</div></section>
    <section class="card-box" style="margin-top:1rem"><h2>${t('needsAttention')}</h2>
      <h3>${t('issues')} (${issues.length})</h3>
      <ul class="list-plain">${issues.map(i => `<li>${avatar(person(i.pid), 'sm')}<a href="#/person/${esc(i.pid)}">${nameOf(person(i.pid))}</a><span class="muted small">${esc(i.msg)}</span><span class="right"><button class="btn sm" data-edit="${esc(i.pid)}">${t('edit')}</button></span></li>`).join('') || '<li class="muted">✓</li>'}</ul>
      <h3 style="margin-top:1rem">${t('unnamed')} (${unnamed.length})</h3>
      <ul class="list-plain">${unnamed.map(p => `<li>${avatar(p, 'sm')}<span>${esc(contextLine(p.id) || t('unknown'))}</span><span class="right"><button class="btn sm" data-edit="${esc(p.id)}">${t('edit')}</button></span></li>`).join('')}</ul>
    </section></div>`;
  $('[data-title]', view).onchange = e => { meta.title = e.target.value.trim(); commit(); };
  $('[data-json]', view).onclick = () => download('tree.json', JSON.stringify(sanitized(store.tree), null, 1), 'application/json');
  $$('[data-edit]', view).forEach(b => b.onclick = () => editPerson(b.dataset.edit));
  const fs = $('[data-focus-search]', view);
  attachSearch(fs, fs.nextElementSibling, p => { meta.focusId = p.id; commit(); }, { searchFn: q => search(q), render: searchRow });
  loadSuggestions($('[data-sugg]', view));
}

// Messages sent with "Suggest a change" (read-only for everyone but editors).
async function loadSuggestions(box) {
  try {
    const list = await listSuggestions();
    if (!list.length) { box.textContent = t('noSuggestions'); return; }
    box.classList.remove('muted');
    box.innerHTML = list.map(s => `<div class="sugg">
      <div><strong>${esc(s.person || '')}</strong> · <span class="muted">${esc(s.type || '')} · ${esc((s.created || '').slice(0, 10))}</span></div>
      <div style="white-space:pre-wrap">${esc(s.message || '')}</div>
      <div class="muted">${esc([s.name, s.contact].filter(Boolean).join(' · '))}</div>
      <div class="row">${s.personId && person(s.personId) ? `<button class="btn sm" data-edit="${esc(s.personId)}">${t('edit')}</button>` : ''}<button class="btn sm ghost" data-done="${esc(s.id)}">${icon('check')}${t('sgDone')}</button></div>
    </div>`).join('');
    $$('[data-edit]', box).forEach(b => b.onclick = () => editPerson(b.dataset.edit));
    $$('[data-done]', box).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await deleteSuggestion(b.dataset.done); b.closest('.sugg').remove(); if (!box.children.length) box.textContent = t('noSuggestions'); }
      catch (e) { b.disabled = false; toast(t('genericError', { msg: e.message })); }
    });
  } catch (e) { box.textContent = t('genericError', { msg: e.message }); }
}
