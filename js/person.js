// Person drawer, "This is me", sharing and "Suggest a change".
import { store, person, parentsOf, unionsOf, spouseIn, kidsOf, siblingsOf, displayName, isLiving, fmtDate, contextLine } from './data.js';
import { relToYou } from './relate.js';
import { t } from './i18n.js';
import { esc, icon, avatar, html, $, toast, modal, nameOf, srcAttr } from './ui.js';
import { hasBackend, sendSuggestion, resolveMedia } from './backend.js';

const CFG = window.FT_CONFIG || {};

// ---------- me ----------
export function getMe() { try { const id = localStorage.getItem('ft.me'); return id && store.P[id] ? id : null; } catch (e) { return null; } }
export function setMe(id) { try { id ? localStorage.setItem('ft.me', id) : localStorage.removeItem('ft.me'); } catch (e) {} window.dispatchEvent(new Event('ft:me')); }

// Last person looked at — new visits pick up from here.
export function rememberPerson(pid) { try { localStorage.setItem('ft.last', pid); } catch (e) {} }
export function lastPerson() {
  let id = null;
  try { id = localStorage.getItem('ft.last'); } catch (e) {}
  if (id && store.P[id]) return id;
  const start = store.tree.meta?.focusId || CFG.startPerson;
  return store.P[start] ? start : Object.keys(store.P)[0];
}

// ---------- share ----------
export async function sharePerson(pid) {
  const url = `${location.origin}${location.pathname}#/person/${encodeURIComponent(pid)}`;
  const title = `${displayName(person(pid))} — ${store.tree.meta?.title || ''}`;
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch (e) { prompt('', url); }
}

// ---------- drawer ----------
let hooks = {};
export function setPersonHooks(h) { hooks = h; }

function relRow(pid, role) {
  const p = person(pid);
  if (!p) return '';
  return `<li><a href="#/person/${esc(pid)}" data-pid="${esc(pid)}">${avatar(p, 'sm')}<span>${nameOf(p)}${p.nickname ? ` <span class="muted small">“${esc(p.nickname)}”</span>` : ''}</span><span class="role">${esc(role || '')}</span></a></li>`;
}

export function datesLine(p) {
  const out = [];
  if (p.birth) {
    if (isLiving(p)) { if (p.birth.m) out.push(`${t('birthday')}: ${fmtDate({ m: p.birth.m, d: p.birth.d })}`); }
    else out.push(`${t('born')} ${fmtDate(p.birth)}`);
  }
  if (p.death) out.push(`${t('died')} ${fmtDate(p.death)}`);
  else if (p.deceased) out.push(t('deceased'));
  return out.join(' · ');
}

export function openPerson(pid) {
  const p = person(pid);
  if (!p) return;
  rememberPerson(pid);
  const me = getMe();
  const rel = me && me !== pid ? relToYou(me, pid) : null;
  const pp = parentsOf(pid);
  const sib = siblingsOf(pid), sibs = [...sib.full, ...sib.half];
  const unions = unionsOf(pid);
  const facts = [
    ['birthPlace', p.birthPlace], ['residence', p.residence], ['occupation', p.occupation], ['burialPlace', p.burialPlace],
    ...unions.filter(u => u.marriage || u.place).map(u => ['married', [fmtDate(u.marriage), u.place, spouseIn(u, pid) && `(${displayName(person(spouseIn(u, pid)))})`].filter(Boolean).join(' ')]),
  ].filter(f => f[1]);

  const parentsHtml = pp ? [pp.father && relRow(pp.father, t('father')), pp.mother && relRow(pp.mother, t('mother'))].join('') : '';
  const spousesHtml = unions.filter(u => spouseIn(u, pid)).map(u => relRow(spouseIn(u, pid), u.separated ? t('separated') : '')).join('');
  const kidsHtml = unions.map(u => {
    const kids = kidsOf(u.id);
    if (!kids.length) return '';
    const sp = spouseIn(u, pid);
    return kids.map(k => relRow(k, unions.length > 1 ? (sp ? t('withSpouse', { name: displayName(person(sp)) }) : '') : '')).join('');
  }).join('');
  const media = (p.media || []).map(m => {
    const cap = m.caption ? `<div class="small muted">${esc(m.caption)}</div>` : '';
    if (m.type === 'audio' && m.src.startsWith('fs:')) return `<div><button class="btn sm" data-play="${esc(m.src)}">${icon('mic')}▶ ${esc(m.caption || t('play'))}</button></div>`;
    if (m.type === 'audio') return `<div><audio controls preload="none" src="${esc(m.src)}"></audio>${cap}</div>`;
    if (m.type === 'image' && m.src.startsWith('fs:')) return `<div><img ${srcAttr(m.src)} alt="${esc(m.caption || '')}" loading="lazy">${cap}</div>`;
    if (m.type === 'image') return `<div><a href="${esc(m.src)}" target="_blank" rel="noopener"><img src="${esc(m.src)}" alt="${esc(m.caption || '')}" loading="lazy"></a>${cap}</div>`;
    return `<div><a href="${esc(m.src)}" target="_blank" rel="noopener">${esc(m.caption || m.src)}</a></div>`;
  }).join('');

  const ov = $('#overlay');
  ov.innerHTML = '';
  const drawer = html(`<aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(displayName(p))}">
    <div class="drawer-head">
      <button class="icon-btn" data-a="share" title="${t('share')}" aria-label="${t('share')}">${icon('share')}</button>
      ${hooks.isEditing?.() ? `<button class="icon-btn" data-a="edit" title="${t('edit')}" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}
      <button class="icon-btn" data-a="close" aria-label="${t('close')}">${icon('close')}</button>
    </div>
    <div class="drawer-body">
      <div class="hero">
        ${avatar(p, 'xl')}
        <h2>${nameOf(p)}</h2>
        ${p.nickname ? `<div class="nick">“${esc(p.nickname)}”</div>` : ''}
        <div class="dates small">${esc(datesLine(p))}</div>
        ${!p.given && !p.surname ? `<div class="small muted">${esc(contextLine(pid))}</div>` : ''}
        ${rel ? `<div class="rel-me">${esc(rel)}</div>` : ''}
      </div>
      ${p.oriki ? `<div class="section-title">${t('oriki')}</div><blockquote class="oriki">${esc(p.oriki)}</blockquote>` : ''}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${t(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${p.bio ? `<div class="section-title">${t('story')}</div><div class="bio">${esc(p.bio)}</div>` : ''}
      ${p.notes ? `<div class="section-title">${t('notes')}</div><div class="bio">${esc(p.notes)}</div>` : ''}
      ${media ? `<div class="section-title">${t('media')}</div><div class="media-list">${media}</div>` : ''}
      ${parentsHtml ? `<div class="section-title">${t('parents')}</div><ul class="rel-list">${parentsHtml}</ul>` : ''}
      ${spousesHtml ? `<div class="section-title">${t('spouses')}</div><ul class="rel-list">${spousesHtml}</ul>` : ''}
      ${kidsHtml ? `<div class="section-title">${t('children')} (${unions.reduce((n, u) => n + kidsOf(u.id).length, 0)})</div><ul class="rel-list">${kidsHtml}</ul>` : ''}
      ${sibs.length ? `<div class="section-title">${t('siblings')}</div><ul class="rel-list">${sibs.map(s => relRow(s)).join('')}</ul>` : ''}
      <div class="actions">
        <a class="btn" href="#/chart/${esc(pid)}">${icon('tree')}${t('viewInTree')}</a>
        <a class="btn" href="#/focus/${esc(pid)}">${icon('family')}${t('focusHere')}</a>
        ${parentsOf(pid) ? `<a class="btn" href="#/fan/${esc(pid)}">${icon('fan')}${t('fanChart')}</a>` : ''}
        <a class="btn" href="#/relate/${esc(me && me !== pid ? me : '')}/${esc(pid)}">${icon('link')}${t('relateTo')}</a>
        <button class="btn" data-a="me">${icon('user')}${me === pid ? t('notMe') : t('thisIsMe')}</button>
        <button class="btn primary" data-a="suggest">${icon('chat')}${t('suggest')}</button>
      </div>
    </div></aside>`);
  ov.append(drawer);
  ov.hidden = false;
  const close = () => { ov.hidden = true; ov.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) close(); };
  document.addEventListener('keydown', onKey);
  ov.onclick = e => {
    if (e.target === ov) return close();
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (e.target.closest('a[href]')) { close(); return; }
    if (a === 'close') close();
    if (a === 'share') sharePerson(pid);
    if (a === 'edit') { close(); hooks.edit?.(pid); }
    if (a === 'me') { setMe(me === pid ? null : pid); openPerson(pid); }
    if (a === 'suggest') openSuggest(pid);
    const play = e.target.closest('[data-play]');
    if (play) {
      play.disabled = true;
      resolveMedia(play.dataset.play).then(src => { play.outerHTML = `<audio controls autoplay src="${esc(src)}"></audio>`; })
        .catch(err => { play.disabled = false; toast(t('genericError', { msg: err.message })); });
    }
  };
  $('[data-a="close"]', drawer).focus();
}

export function closePerson() { const ov = $('#overlay'); ov.hidden = true; ov.innerHTML = ''; }

// ---------- suggest ----------
export function openSuggest(pid) {
  const p = pid ? person(pid) : null;
  const about = p ? `${displayName(p)}${contextLine(pid) ? ` (${contextLine(pid)})` : ''}` : t('sgGeneral');
  const hasForm = hasBackend();
  const body = html(`<form class="modal-body" style="padding:0">
    <div class="small muted">${t('sgAbout')}: <strong>${esc(about)}</strong></div>
    <fieldset><legend>${t('sgType')}</legend><div class="row">
      ${['sgFix', 'sgAdd', 'sgPhoto', 'sgOther'].map((k, i) => `<label class="chip"><input type="radio" name="type" value="${t(k)}" ${i === 0 ? 'checked' : ''}> ${t(k)}</label>`).join('')}
    </div></fieldset>
    <label class="field"><span>${t('sgMsg')}</span><textarea name="message" required placeholder="${esc(t('sgMsgPh'))}"></textarea></label>
    <div class="grid-2">
      <label class="field"><span>${t('sgName')}</span><input type="text" name="name" autocomplete="name"></label>
      <label class="field"><span>${t('sgContact')}</span><input type="text" name="contact"></label>
    </div>
  </form>`);
  const foot = html(`<div style="display:contents">
    <button class="btn" type="button" data-wa>${icon('whatsapp')}${t('sgViaWa')}</button>
    ${hasForm ? `<button class="btn primary" type="button" data-gf>${icon('chat')}${t('sgViaForm')}</button>` : ''}
  </div>`);
  const m = modal({ title: t('sgTitle'), body, foot });
  const read = () => Object.fromEntries(new FormData(body));
  const valid = d => { if (!d.message.trim()) { toast(t('sgNeedMsg')); body.message.focus(); return false; } return true; };
  $('[data-wa]', m.el).onclick = () => {
    const d = read(); if (!valid(d)) return;
    const text = `*${t('sgTitle')}* — ${about}\n${pid ? `${location.origin}${location.pathname}#/person/${pid}\n` : ''}(${d.type})\n\n${d.message}${d.name ? `\n\n— ${d.name}` : ''}${d.contact ? ` (${d.contact})` : ''}`;
    window.open(`https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    m.close();
  };
  const gfBtn = $('[data-gf]', m.el);
  if (gfBtn) gfBtn.onclick = async () => {
    const d = read(); if (!valid(d)) return;
    gfBtn.disabled = true;
    try {
      await sendSuggestion({ person: about, personId: pid || '', type: d.type, message: d.message, name: d.name, contact: d.contact, link: pid ? `${location.origin}${location.pathname}#/person/${pid}` : location.href });
      toast(t('sgThanks'), 4000); m.close();
    } catch (e) { toast(t('genericError', { msg: e.message })); gfBtn.disabled = false; }
  };
}
