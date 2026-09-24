// Settings tab: me, language, appearance, layout, install, exports, editing, about.
import { store, person, displayName, search } from './data.js';
import { t, lang, setLang, LANGS } from './i18n.js';
import { esc, icon, avatar, $, $$, toast, attachSearch, nameOf } from './ui.js';
import { getMe, setMe, openSuggest } from './person.js';
import { chartState, exportPng } from './chart.js';
import { downloadGedcom } from './export.js';
import { isEditing, enterEditor, exitEditor } from './editor.js';
import { searchRow } from './views.js';

// ---------- theme ----------
export function applyTheme() {
  let pref = 'system';
  try { pref = localStorage.getItem('ft.theme') || 'system'; } catch (e) {}
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d1c19' : '#105e48');
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
      ${seg('theme', [['system', t('themeSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]], themePref)}
      <h2 style="margin-top:1rem">${t('layout')}</h2>
      ${seg('layout', [['tb', t('layoutTb')], ['lr', t('layoutLr')]], chartState.orient)}
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
      <div class="row">${isEditing()
        ? `<a class="btn" href="#/editor">${icon('edit')}${t('edTools')}</a><button class="btn" data-s="editor-off">${t('menuEditorOff')}</button>`
        : `<button class="btn" data-s="editor">${icon('lock')}${t('menuEditor')}</button>`}</div>
    </section>

    <section class="card-box set-row">
      <h2>${t('menuAbout')}</h2>
      <p class="small">${esc(t('about'))}</p>
      <p class="small muted">${store.tree.meta?.updated ? 'Updated ' + esc(store.tree.meta.updated) : ''} · rev ${store.tree.meta?.rev || 0}</p>
    </section>
  </div>`;

  const inp = $('[data-me]', view);
  attachSearch(inp, inp.nextElementSibling, p => { setMe(p.id); toast(t('youAre', { name: displayName(p) })); }, { searchFn: q => search(q), render: searchRow });
  $$('input[name=lang]', view).forEach(r => r.onchange = () => { setLang(r.value); window.dispatchEvent(new Event('ft:lang')); });
  $$('input[name=theme]', view).forEach(r => r.onchange = () => { try { localStorage.setItem('ft.theme', r.value); } catch (e) {} applyTheme(); });
  $$('input[name=layout]', view).forEach(r => r.onchange = () => { chartState.orient = r.value; chartState.transforms.clear(); try { localStorage.setItem('ft.orient', r.value); } catch (e) {} });
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
  };
  window.addEventListener('ft:installable', () => { const el = $('[data-install]', view); if (el) el.innerHTML = installBlock(); }, { once: true });
}
