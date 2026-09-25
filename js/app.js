// App shell: routing, top bar, tabs, search, sync, PWA.
import { store, loadTree, syncRemote, onChange, person, displayName, search, changed } from './data.js';
import { t, lang } from './i18n.js';
import { esc, icon, avatar, $, $$, toast, attachSearch } from './ui.js';
import { renderChart, redrawChart } from './chart.js';
import { renderFan } from './fan.js';
import { renderFocus, renderRelate, renderExplore, searchRow } from './views.js';
import { openPerson, closePerson, setPersonHooks, getMe, lastPerson, rememberPerson } from './person.js';
import { isEditing, enterEditor, editPerson, renderEditorPage, wantsEditor, updateBar } from './editor.js';
import { renderSettings, applyTheme, isDark, toggleTheme } from './settings.js';
import { resolveMedia } from './backend.js';
import { scheduleReminders } from './month.js';

const view = $('#view');
const TABS = [
  ['chart', 'tabChart', 'tree'], ['focus', 'tabFocus', 'family'], ['relate', 'tabRelate', 'link'],
  ['explore', 'tabExplore', 'compass'], ['settings', 'tabSettings', 'settings'],
];
let current = { name: null };

// ---------- routing ----------
function parse() {
  const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: name || 'chart', args };
}

function route() {
  const r = parse();
  const prev = current.name;
  if (r.name !== 'person') closePerson();
  switch (r.name) {
    case 'person': {
      const pid = r.args[0];
      if (!person(pid)) { location.hash = '#/chart'; return; }
      if (!prev || prev === 'editor' || prev === 'settings') { show('focus'); renderFocus(view, pid); }
      openPerson(pid);
      return; // keep the view underneath
    }
    case 'line': show('chart'); renderChart(view, { root: r.args[0], focusId: r.args[1], onOpen: openPerson, onRoot, onBranch }); break;
    case 'chart': show('chart'); renderChart(view, { focusId: r.args[0] || (!prev ? lastPersonIfSet() : undefined), onOpen: openPerson, onRoot, onBranch }); break;
    case 'branch': {
      if (!person(r.args[0])) { location.hash = '#/chart'; return; }
      show('chart'); rememberPerson(r.args[0]);
      renderChart(view, { branch: r.args[0], onOpen: openPerson, onRoot, onBranch });
      break;
    }
    case 'fan': {
      if (!person(r.args[0])) { location.hash = '#/chart'; return; }
      show('chart'); rememberPerson(r.args[0]);
      renderFan(view, r.args[0], { onOpen: openPerson, onBranch });
      break;
    }
    case 'focus': show('focus'); renderFocus(view, r.args[0] && person(r.args[0]) ? r.args[0] : lastPerson()); break;
    case 'relate': show('relate'); renderRelate(view, r.args[0], r.args[1]); break;
    case 'explore': show('explore'); renderExplore(view, r.args[0]); break;
    case 'gallery': location.replace('#/explore/photos'); return;
    case 'timeline': location.replace('#/explore/timeline'); return;
    case 'stats': location.replace('#/explore/stats'); return;
    case 'settings': show('settings'); renderSettings(view, route); break;
    case 'editor': show('settings'); renderEditorPage(view, route); break;
    default: location.hash = '#/chart'; return;
  }
  try { if (r.name !== 'editor') localStorage.setItem('ft.hash', location.hash); } catch (e) {}
  view.scrollTop = 0;
}
function onRoot(rootId, focusId) { location.hash = focusId ? `#/line/${rootId}/${focusId}` : `#/line/${rootId}`; }
function onBranch(pid) { location.hash = `#/branch/${pid}`; }
// On the very first chart of a returning visit, centre on the person they last looked at.
function lastPersonIfSet() { try { return localStorage.getItem('ft.last') || undefined; } catch (e) { return undefined; } }

function show(name) {
  current.name = name;
  $$('.tabs a, .bottom-tabs a').forEach(a => a.getAttribute('data-tab') === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}

// ---------- shell ----------
function drawShell() {
  const title = store.tree?.meta?.title || 'Azandowanu Family';
  document.title = title;
  $('#site-title').textContent = title;
  const tabHtml = TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic)}<span>${t(l)}</span></a>`).join('');
  $('#tabs').innerHTML = tabHtml;
  $('#bottom-tabs').innerHTML = tabHtml;
  $('#search').placeholder = t('searchPh');
  const me = getMe();
  $('#me-btn').innerHTML = me
    ? `${avatar(person(me), 'sm')}<span class="me-name">${esc(displayName(person(me)))}</span>`
    : `${icon('user')}<span class="me-name">${t('chooseYourself')}</span>`;
  $('#me-btn').title = me ? t('youAre', { name: displayName(person(me)) }) : t('chooseYourself');
  $('#me-btn').classList.toggle('on', !!me);
  drawThemeBtn();
  if (current.name) show(current.name);
}

// Sun in dark mode, moon in light mode: tap to switch.
function drawThemeBtn() {
  const b = $('#theme-btn');
  b.innerHTML = icon(isDark() ? 'sun' : 'moon');
  b.title = t(isDark() ? 'themeLight' : 'themeDark');
  b.setAttribute('aria-label', b.title);
}

// Uploaded photos / voice notes ("fs:<id>", see srcAttr in ui.js) are fetched after render.
function hydrateMedia(root) {
  root.querySelectorAll?.('[data-fs]').forEach(el => {
    const src = el.dataset.fs, attr = el.dataset.fsAttr || 'src';
    el.removeAttribute('data-fs');
    resolveMedia(src).then(url => el.setAttribute(attr, url)).catch(() => {});
  });
}

function wire() {
  attachSearch($('#search'), $('#search-results'), p => {
    rememberPerson(p.id);
    if (current.name === 'chart') {
      const to = location.hash.startsWith('#/fan/') ? 'fan' : 'branch';
      const same = location.hash === `#/${to}/${p.id}`;
      location.hash = `#/${to}/${p.id}`;
      if (same) route();
    } else location.hash = `#/focus/${p.id}`;
  }, { searchFn: q => search(q), render: searchRow });
  $('#me-btn').onclick = () => { const me = getMe(); location.hash = me ? `#/person/${me}` : '#/settings'; };
  window.addEventListener('hashchange', route);
  window.addEventListener('ft:me', () => { drawShell(); if (current.name !== 'chart') route(); else redrawChart(); });
  window.addEventListener('ft:lang', () => { drawShell(); updateBar(); route(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); drawThemeBtn(); });
  $('#theme-btn').onclick = () => { toggleTheme(); drawThemeBtn(); if (current.name === 'settings') route(); };
  window.addEventListener('ft:theme', drawThemeBtn);
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && hydrateMedia(n.parentNode || n)))).observe(document.body, { childList: true, subtree: true });
  onChange(() => { drawShell(); route(); });
  setPersonHooks({ isEditing, edit: editPerson });
}

async function sync() {
  if (isEditing()) return;
  try { if (await syncRemote()) { changed(); toast(t('updated')); } }
  catch (e) { if (!navigator.onLine) toast(t('offline')); }
}

async function init() {
  document.documentElement.lang = lang() === 'gun' ? 'guw' : lang();
  applyTheme();
  try { await loadTree(); }
  catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  wire();
  drawShell();
  // new visitors start on the tree; returning visitors pick up where they left off
  if (!location.hash) { let h = null; try { h = localStorage.getItem('ft.hash'); } catch (e) {} if (h) history.replaceState(null, '', h); }
  route();
  if (wantsEditor()) enterEditor(route);
  sync();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
    navigator.serviceWorker?.register('sw.js').catch(() => {});
  }
  scheduleReminders();
}
init();
