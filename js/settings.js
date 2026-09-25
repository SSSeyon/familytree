// Settings tab: me, language, appearance, install, exports, editing, about (version + hard refresh).
import { store, person, displayName, search } from './data.js';
import { t, lang, setLang, LANGS } from './i18n.js';
import { esc, icon, avatar, $, $$, toast, attachSearch, nameOf } from './ui.js';
import { getMe, setMe, openSuggest } from './person.js';
import { exportPng } from './chart.js';
import { downloadGedcom } from './export.js';
import { isEditing, enterEditor, exitEditor, hideEditor } from './editor.js';
import { isSignedIn } from './backend.js';
import { searchRow } from './views.js';

// ---------- theme ----------
export function applyTheme() {
  let pref = 'system';
  try { pref = localStorage.getItem('ft.theme') || 'system'; } catch (e) {}
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#0a3a29' : '#006343');
}
// Larger text for easier reading (per device).
export const bigText = () => { try { return localStorage.getItem('ft.big') === '1'; } catch (e) { return false; } };
export function applyTextSize() { document.documentElement.classList.toggle('big', bigText()); }
export function isDark() {
  const set = document.documentElement.dataset.theme;
  return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
export function toggleTheme() {
  try { localStorage.setItem('ft.theme', isDark() ? 'light' : 'dark'); } catch (e) {}
  applyTheme();
}

// Hard refresh: drop the offline copy and cached files, then load everything fresh.
// Personal choices (language, theme, "me") are kept.
export async function hardRefresh() {
  try { localStorage.removeItem('ft.cache'); } catch (e) {}
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch (e) {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
  location.reload();
}

// ---------- install (PWA) ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; window.dispatchEvent(new Event('ft:installable')); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; toast(t('installed')); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installBlock() {
  if (isStandalone()) return `<p class="small">${t('installed')}</p>`;
  if (deferredPrompt) return `<button class="btn primary" data-s="install">${icon('phone')}${t('installBtn')}</button>`;
  return `<p class="small muted">${t(isIos() ? 'installIos' : 'installOther')}</p>`;
}

// ---------- page ----------
export function renderSettings(view, rerender) {
  const me = getMe();
  let themePref = 'system';
  try { themePref = localStorage.getItem('ft.theme') || 'system'; } catch (e) {}
  const seg = (name, items, current) => `<div class="seg" role="radiogroup">${items.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;

  view.innerHTML = `<div class="page settings">
    <div class="page-head"><h1>${t('tabSettings')}</h1></div>

    <section class="card-box set-row">
      <div><h2>${t('chooseYourself')}</h2><p class="small muted">${t('meHint')}</p></div>
      ${me ? `<div class="picked">${avatar(person(me), 'sm')}<div>${nameOf(person(me))}</div><button class="btn sm" data-s="clear-me">${t('notMe')}</button></div>` : ''}
      <div class="picker"><input type="search" data-me placeholder="${esc(t('searchPh'))}" aria-label="${esc(t('chooseYourself'))}"><ul class="search-results" hidden></ul></div>
    </section>

    <section class="card-box set-row">
      <h2>${icon('globe')} ${t('language')}</h2>
      ${seg('lang', LANGS, lang())}
    </section>

    <section class="card-box set-row">
      <h2>${t('theme')}</h2>
      ${seg('theme', [['system', t('themeSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]], themePref)}    </section>

    <section class="card-box set-row">
      <h2>${icon('text')} ${t('textSize')}</h2>
      <label class="switch"><input type="checkbox" data-big ${bigText() ? 'checked' : ''}><span class="track"></span>${t('bigText')}</label>
      <p class="small muted">${t('bigTextHelp')}</p>
    </section>

    <section class="card-box set-row">
      <h2>${t('installTitle')}</h2>
      <div data-install>${installBlock()}</div>
    </section>

    <section class="card-box set-row">
      <h2>${t('exports')}</h2>
      <div class="row">
        <button class="btn" data-s="png">${icon('download')}${t('menuPng')}</button>
        <button class="btn" data-s="print">${icon('print')}${t('menuPrint')}</button>
        <button class="btn" data-s="ged">${icon('download')}${t('menuGed')}</button>
      </div>
    </section>

    <section class="card-box set-row">
      <h2>${t('suggest')}</h2>
      <p class="small muted">${t('helpIntro')}</p>
      <div><button class="btn" data-s="suggest">${icon('chat')}${t('menuSuggest')}</button></div>
    </section>

    <section class="card-box set-row">
      <h2>${icon('lock')} ${t('editorTitle')}</h2>
      <p class="small muted">${t('editorHelp')}</p>
      ${isSignedIn()
        ? `<label class="switch"><input type="checkbox" data-ed-toggle ${isEditing() ? 'checked' : ''}><span class="track"></span>${t('menuEditor')}</label>
          <div class="row">${isEditing() ? `<a class="btn" href="#/editor">${icon('edit')}${t('edTools')}</a>` : ''}<button class="btn ghost" data-s="editor-off">${icon('lock')}${t('signOutEditor')}</button></div>`
        : `<div class="row"><button class="btn" data-s="editor">${icon('lock')}${t('menuEditor')}</button></div>`}
    </section>

    <section class="card-box set-row">
      <h2>${t('menuAbout')}</h2>
      <p class="small">${esc(t('about'))}</p>
      <div class="version-row"><span class="version-tag">V${esc(self.APP_VERSION || '')}</span>
        <span class="small muted">${store.tree.meta?.updated ? esc(t('dataUpdated', { date: store.tree.meta.updated })) : ''}</span>
        <button class="btn sm" data-s="refresh">${icon('refresh')}${t('hardRefresh')}</button></div>
      <p class="small muted">${t('hardRefreshHelp')}</p>
    </section>
  </div>`;

  const inp = $('[data-me]', view);
  attachSearch(inp, inp.nextElementSibling, p => { setMe(p.id); toast(t('youAre', { name: displayName(p) })); }, { searchFn: q => search(q), render: searchRow });
  $$('input[name=lang]', view).forEach(r => r.onchange = () => { setLang(r.value); window.dispatchEvent(new Event('ft:lang')); });
  $$('input[name=theme]', view).forEach(r => r.onchange = () => { try { localStorage.setItem('ft.theme', r.value); } catch (e) {} applyTheme(); window.dispatchEvent(new Event('ft:theme')); });
  $('[data-big]', view).onchange = e => { try { e.target.checked ? localStorage.setItem('ft.big', '1') : localStorage.removeItem('ft.big'); } catch (er) {} applyTextSize(); };
  const tg = $('[data-ed-toggle]', view);
  if (tg) tg.onchange = () => tg.checked ? enterEditor(rerender) : hideEditor();
  view.onclick = async e => {
    const a = e.target.closest('[data-s]')?.dataset.s;
    if (a === 'clear-me') setMe(null);
    if (a === 'install' && deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('[data-install]', view).innerHTML = installBlock(); }
    if (a === 'png') { location.hash = '#/chart'; setTimeout(exportPng, 500); }
    if (a === 'print') { location.hash = '#/chart'; setTimeout(() => window.print(), 600); }
    if (a === 'ged') downloadGedcom();
    if (a === 'suggest') openSuggest(null);
    if (a === 'editor') enterEditor(rerender);
    if (a === 'editor-off') exitEditor();
    if (a === 'refresh') hardRefresh();
  };
  window.addEventListener('ft:installable', () => { const el = $('[data-install]', view); if (el) el.innerHTML = installBlock(); }, { once: true });
}
