// Small DOM helpers, icons, toast and modal.
import { initials, displayName } from './data.js';
import { t } from './i18n.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function html(str) { const tpl = document.createElement('template'); tpl.innerHTML = str.trim(); return tpl.content.firstElementChild; }

const I = {
  tree: '<path d="M12 3v6M12 9H6v4M12 9h6v4M6 13v2M18 13v2"/><rect x="9" y="1.5" width="6" height="4" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  family: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M13.5 14.5c.9-.6 2-1 3.5-1 2.8 0 4.5 2.3 4.5 5.5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  menu: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  expand: '<path d="m7 9 5 5 5-5"/>', collapse: '<path d="m7 15 5-5 5 5"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1c-1-.5-2.5-2-3-3l1-1-1-2L9 8.5Z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  cake: '<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M5 16c1.5 1 2.5 1 3.5 0s2.5-1 3.5 0 2.5 1 3.5 0 2.5-1 3.5 0M12 12V8M12 5.5c-.8-.8-.8-1.7 0-2.5.8.8.8 1.7 0 2.5Z"/>',
  fan: '<path d="M2.5 18a9.5 9.5 0 0 1 19 0Z"/><path d="M12 18V8.5M12 18l-6.7-6.7M12 18l6.7-6.7"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  text: '<path d="M4 7V5h10v2M9 5v14M7 19h4M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>',
};
export const icon = (name, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[name] || ''}</svg>`;

// Photos and voice notes uploaded in the editor live in Firestore as "fs:<id>"; the app
// fills them in after render (see hydrateMedia in app.js). Everything else is a plain URL.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
export const srcAttr = (src, attr = 'src', placeholder = BLANK) => src?.startsWith('fs:')
  ? `${attr}="${placeholder}" data-fs="${esc(src)}" data-fs-attr="${attr}"`
  : `${attr}="${esc(src)}"`;

export function avatar(p, cls = '') {
  if (p?.photo) return `<div class="ph ${cls}"><img ${srcAttr(p.photo)} alt="" loading="lazy"></div>`;
  return `<div class="ph ${cls}" aria-hidden="true">${esc(initials(p))}</div>`;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

// Generic modal. Returns {el, close}. `onClose` runs once.
export function modal({ title, body, foot = '', wide = false, onClose }) {
  const back = html(`<div class="modal-back" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal ${wide ? 'wide' : ''}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${t('close')}">${icon('close')}</button></div>
      <div class="modal-body"></div>
      ${foot ? `<div class="modal-foot"></div>` : ''}
    </div></div>`);
  const bodyEl = $('.modal-body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
  if (foot) { const f = $('.modal-foot', back); if (typeof foot === 'string') f.innerHTML = foot; else f.append(foot); }
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape' && back === [...document.querySelectorAll('.modal-back')].pop()) close(); };
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  setTimeout(() => $('input,select,textarea,button:not([data-close])', bodyEl)?.focus(), 30);
  return { el: back, close };
}

export function confirmBox(message, okLabel = 'OK') {
  return new Promise(res => {
    const m = modal({ title: '', body: `<p>${esc(message)}</p>`, foot: `<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${esc(okLabel)}</button>`, onClose: () => res(false) });
    $('[data-ok]', m.el).onclick = () => { res(true); m.close(); };
  });
}

export function download(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Person search box with dropdown. onPick(person).
export function attachSearch(input, list, onPick, { searchFn, render }) {
  let items = [], sel = -1;
  const draw = () => {
    if (!items.length) { list.innerHTML = input.value.trim() ? `<li class="muted">${t('noResults')}</li>` : ''; list.hidden = !input.value.trim(); return; }
    list.innerHTML = items.map((p, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">${render(p)}</li>`).join('');
    list.hidden = false;
  };
  input.addEventListener('input', () => { items = searchFn(input.value); sel = items.length ? 0 : -1; draw(); });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[sel]) { pick(items[sel]); e.preventDefault(); }
    else if (e.key === 'Escape') { list.hidden = true; }
  });
  list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 150));
  function pick(p) { list.hidden = true; input.value = ''; items = []; onPick(p); input.blur(); }
}

export const nameOf = p => esc(displayName(p));
