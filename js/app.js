// App shell: routing, top bar, search, menu, theme, language.
import { store, loadTree, onChange, person, displayName, search, contextLine, mainFounder } from './data.js';
import { t, lang, setLang } from './i18n.js';
import { esc, icon, avatar, $, $$, toast, modal, attachSearch, nameOf } from './ui.js';
import { renderChart, centerOn, exportPng, chartState } from './chart.js';
import { renderFocus, renderRelate, renderTimeline, renderGallery, renderStats, searchRow } from './views.js';
import { openPerson, closePerson, setPersonHooks, getMe, setMe, openSuggest } from './person.js';
import { downloadGedcom, downloadJson } from './export.js';
import { isEditing, enterEditor, exitEditor, editPerson, renderEditorPage, wantsEditor, updateBar } from './editor.js';

const view = $('#view');
const TABS = [
  ['chart', 'tabChart', 'tree'], ['focus', 'tabFocus', 'family'], ['relate', 'tabRelate', 'link'],
  ['timeline', 'tabTimeline', 'clock'], ['gallery', 'tabGallery', 'photo'], ['stats', 'tabStats', 'chart'],
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
      if (!prev || prev === 'editor') { show('focus'); renderFocus(view, pid); }
      openPerson(pid);
      return; // keep underlying view
    }
    case 'line': show('chart'); renderChart(view, { root: r.args[0], focusId: r.args[1], onOpen: openPerson, onRoot }); break;
    case 'chart': show('chart'); renderChart(view, { focusId: r.args[0], onOpen: openPerson, onRoot }); break;
    case 'focus': show('focus'); renderFocus(view, r.args[0] && person(r.args[0]) ? r.args[0] : defaultPerson()); break;
    case 'relate': show('relate'); renderRelate(view, r.args[0], r.args[1]); break;
    case 'timeline': show('timeline'); renderTimeline(view); break;
    case 'gallery': show('gallery'); renderGallery(view); break;
    case 'stats': show('stats'); renderStats(view); break;
    case 'editor': show('editor'); renderEditorPage(view, route); break;
    default: location.hash = '#/chart'; return;
  }
  view.scrollTop = 0;
}
function onRoot(rootId, focusId) { location.hash = focusId ? `#/line/${rootId}/${focusId}` : `#/line/${rootId}`; }
function defaultPerson() { return getMe() || (person(store.tree.meta?.focusId) ? store.tree.meta.focusId : mainFounder()); }

function show(name) {
  current.name = name;
  const tab = name === 'line' ? 'chart' : name;
  $$('.tabs a, .bottom-tabs a').forEach(a => a.getAttribute('data-tab') === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}

// ---------- shell ----------
function drawShell() {
  const title = store.tree?.meta?.title || 'Family Tree';
  document.title = title;
  $('#site-title').textContent = title;
  const tabHtml = TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic)}<span>${t(l)}</span></a>`).join('');
  $('#tabs').innerHTML = tabHtml;
  $('#bottom-tabs').innerHTML = TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic)}<span>${t(l)}</span></a>`).join('');
  $('#search').placeholder = t('searchPh');
  $('#lang-btn').textContent = lang() === 'en' ? 'YO' : 'EN';
  $('#lang-btn').title = lang() === 'en' ? 'Yorùbá' : 'English';
  const dark = isDark();
  $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#theme-btn').title = dark ? t('themeLight') : t('themeDark');
  $('#menu-btn').innerHTML = icon('menu');
  const me = getMe();
  $('#me-chip').textContent = me ? t('youAre', { name: displayName(person(me)) }) : t('pickMe');
  $('#me-chip').classList.toggle('on', !!me);
  show(current.name || parse().name);
}

const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

function openMenu() {
  const menu = $('#menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = `
    <button data-m="print">${icon('print')}${t('menuPrint')}</button>
    <button data-m="png">${icon('download')}${t('menuPng')}</button>
    <button data-m="ged">${icon('download')}${t('menuGed')}</button>
    <hr>
    <button data-m="suggest">${icon('chat')}${t('menuSuggest')}</button>
    <button data-m="about">${icon('info')}${t('menuAbout')}</button>
    <hr>
    <button data-m="editor">${icon('lock')}${isEditing() ? t('menuEditorOff') : t('menuEditor')}</button>`;
  menu.hidden = false;
  const off = e => { if (!menu.contains(e.target) && !e.target.closest('#menu-btn')) { menu.hidden = true; document.removeEventListener('click', off, true); } };
  document.addEventListener('click', off, true);
  menu.onclick = e => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    menu.hidden = true;
    if (m === 'print') window.print();
    if (m === 'png') { if (current.name !== 'chart') location.hash = '#/chart'; setTimeout(exportPng, current.name === 'chart' ? 0 : 400); }
    if (m === 'ged') downloadGedcom();
    if (m === 'suggest') openSuggest(null);
    if (m === 'about') modal({ title: store.tree.meta?.title || 'Family Tree', body: `<p>${esc(t('about'))}</p><p class="small muted">${esc(store.tree.meta?.updated ? 'Updated ' + store.tree.meta.updated : '')}</p>` });
    if (m === 'editor') isEditing() ? exitEditor() : enterEditor(route);
  };
}

function openMePicker() {
  const me = getMe();
  const m = modal({
    title: t('whoAreYou'),
    body: `<p class="muted small">${t('meHint')}</p>
      ${me ? `<div class="picked">${avatar(person(me), 'sm')}<div>${nameOf(person(me))}</div><button class="btn sm" data-clear>${t('notMe')}</button></div>` : ''}
      <div class="picker"><input type="search" data-me placeholder="${esc(t('searchPh'))}"><ul class="search-results" hidden></ul></div>`,
  });
  const inp = $('[data-me]', m.el);
  attachSearch(inp, inp.nextElementSibling, p => { setMe(p.id); m.close(); toast(t('youAre', { name: displayName(p) })); }, { searchFn: q => search(q), render: searchRow });
  $('[data-clear]', m.el)?.addEventListener('click', () => { setMe(null); m.close(); });
}

function wire() {
  attachSearch($('#search'), $('#search-results'), p => {
    if (current.name === 'chart') {
      const same = location.hash === `#/chart/${p.id}`;
      location.hash = `#/chart/${p.id}`;
      if (same) route();
    }
    else location.hash = `#/focus/${p.id}`;
  }, { searchFn: q => search(q), render: searchRow });
  $('#menu-btn').onclick = openMenu;
  $('#me-chip').onclick = openMePicker;
  $('#theme-btn').onclick = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ft.theme', next); } catch (e) {}
    drawShell(); if (current.name === 'chart') route();
  };
  $('#lang-btn').onclick = () => { setLang(lang() === 'en' ? 'yo' : 'en'); drawShell(); updateBar(); route(); };
  window.addEventListener('hashchange', route);
  window.addEventListener('ft:me', () => { drawShell(); if (current.name !== 'chart') route(); });
  onChange(() => { drawShell(); route(); });
  setPersonHooks({ isEditing, edit: editPerson });
}

async function init() {
  document.documentElement.lang = lang();
  try { await loadTree(); }
  catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  wire();
  drawShell();
  route();
  if (wantsEditor()) enterEditor(route);
}
init();
