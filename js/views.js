// Family (focus) view, relationship finder, timeline, gallery and stats.
import { store, person, parentsOf, unionsOf, spouseIn, kidsOf, siblingsOf, displayName, lifeSpan, isLiving, fmtDate, search, contextLine, allPeople, founders, mainFounder, isNamed, descendants, childrenOf } from './data.js';
import { relSentence, relWord, relToYou, shortestPath } from './relate.js';
import { branchColour } from './chart.js';
import { getMe, openSuggest, datesLine } from './person.js';
import { t } from './i18n.js';
import { esc, icon, avatar, html, $, $$, attachSearch, nameOf } from './ui.js';

const searchRow = p => `${avatar(p, 'sm')}<span><div>${nameOf(p)}${p.nickname ? ` <span class="muted small">“${esc(p.nickname)}”</span>` : ''}</div><div class="small muted">${esc(contextLine(p.id))}</div></span>`;

// ---------- person mini card ----------
function pcard(pid, cls = '', { href, showRel = true } = {}) {
  const p = person(pid);
  if (!p) return '';
  const me = getMe();
  const rel = showRel && me && me !== pid ? relToYou(me, pid) : null;
  return `<a class="pcard ${cls}" href="${href || `#/focus/${esc(pid)}`}" style="--branch:${branchColour(pid)}">
    ${avatar(p)}
    <div class="nm">${nameOf(p)}</div>
    ${p.nickname ? `<div class="nk">“${esc(p.nickname)}”</div>` : ''}
    ${lifeSpan(p) ? `<div class="yr">${esc(lifeSpan(p))}</div>` : ''}
    ${rel ? `<div class="rel">${esc(rel)}</div>` : ''}
  </a>`;
}
const ghost = label => `<div class="pcard ghost sm"><div class="ph">?</div><div class="nm">${esc(label)}</div></div>`;

// ---------- Focus / Family view ----------
export function renderFocus(view, pid) {
  const p = person(pid);
  if (!p) { view.innerHTML = `<div class="empty">${t('noResults')}</div>`; return; }
  const pp = parentsOf(pid);
  const gp = side => { const q = side && parentsOf(side); return q ? [q.father, q.mother].filter(Boolean) : []; };
  const grand = pp ? [...gp(pp.father), ...gp(pp.mother)] : [];
  const unions = unionsOf(pid);
  const sib = siblingsOf(pid);

  view.innerHTML = `<div class="focus">
    ${grand.length ? `<div class="fam-label">${t('grandparents')}</div><div class="fam-row">${grand.map(g => pcard(g, 'sm')).join('')}</div><div class="fam-connector"></div>` : ''}
    ${pp ? `<div class="fam-label">${t('parents')}</div><div class="fam-row"><div class="couple">
      ${pp.father ? pcard(pp.father, 'sm') : ghost(t('father'))}<span class="amp">&</span>${pp.mother ? pcard(pp.mother, 'sm') : ghost(t('mother'))}
    </div></div><div class="fam-connector"></div>` : ''}
    <div class="center-block">
      ${pcard(pid, 'center', { href: `#/person/${esc(pid)}` })}
      ${unions.map(u => spouseIn(u, pid)).filter(Boolean).map(s => `<span class="amp muted">⚭</span>${pcard(s)}`).join('')}
    </div>
    <div class="focus-actions">
      <a class="btn sm" href="#/person/${esc(pid)}">${icon('info')}${t('details')}</a>
      <a class="btn sm" href="#/chart/${esc(pid)}">${icon('tree')}${t('viewInTree')}</a>
      <button class="btn sm" data-suggest>${icon('chat')}${t('suggest')}</button>
    </div>
    ${unions.some(u => kidsOf(u.id).length) ? `<div class="fam-connector"></div><div class="fam-label">${t('children')}</div>` : ''}
    ${unions.filter(u => kidsOf(u.id).length).map(u => {
      const sp = spouseIn(u, pid);
      return `<div class="kid-group">${unions.length > 1 || !sp ? `<h4>${esc(sp ? t('withSpouse', { name: displayName(person(sp)) }) : t('withUnknown'))}</h4>` : ''}
        <div class="fam-row">${kidsOf(u.id).map(k => pcard(k, 'sm')).join('')}</div></div>`;
    }).join('')}
    ${sib.full.length ? `<div class="fam-label">${t('siblings')}</div><div class="fam-row">${sib.full.map(s => pcard(s, 'sm')).join('')}</div>` : ''}
    ${sib.half.length ? `<div class="fam-label">${t('halfSiblings')}</div><div class="fam-row">${sib.half.map(s => pcard(s, 'sm')).join('')}</div>` : ''}
  </div>`;
  $('[data-suggest]', view).onclick = () => openSuggest(pid);
}

// ---------- Relationship finder ----------
export function renderRelate(view, a, b) {
  a = person(a) ? a : getMe() || '';
  b = person(b) ? b : '';
  const picker = (id, key, which) => id
    ? `<div class="picked">${avatar(person(id), 'sm')}<div><div>${nameOf(person(id))}</div><div class="small muted">${esc(contextLine(id))}</div></div><button class="icon-btn" data-clear="${which}" aria-label="${t('close')}">${icon('close')}</button></div>`
    : `<div class="picker"><input type="search" placeholder="${esc(t('searchPh'))}" data-pick="${which}" aria-label="${esc(t(key))}"><ul class="search-results" hidden></ul></div>`;
  let result = `<div class="empty">${t('relPick')}</div>`;
  if (a && b) {
    const path = shortestPath(a, b);
    const nm = id => displayName(person(id));
    result = `<div class="card-box relate-answer"><div class="big">${esc(relSentence(a, b, nm))}</div>
      ${relWord(b, a) && a !== b ? `<div class="muted" style="margin-top:.4rem">${esc(relSentence(b, a, nm))}</div>` : ''}</div>
      ${path && path.length > 1 ? `<div class="section-title">${t('relPath')}</div><div class="path">${path.map((s, i) => `
        ${i ? `<div class="arrow">${esc(relWord(path[i - 1].id, s.id) || '')}</div>` : ''}
        <a class="step" href="#/person/${esc(s.id)}">${avatar(person(s.id), 'sm')}${esc(nm(s.id))}</a>`).join('')}</div>` : ''}`;
  }
  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('relTitle')}</h1></div>
    <div class="relate-pickers">
      <label class="field"><span>${t('relPickA')}</span>${picker(a, 'relPickA', 'a')}</label>
      <button class="btn" data-swap ${a && b ? '' : 'disabled'}>⇄ ${t('relSwap')}</button>
      <label class="field"><span>${t('relPickB')}</span>${picker(b, 'relPickB', 'b')}</label>
    </div><div style="margin-top:1.2rem">${result}</div></div>`;
  const go = (na, nb) => { location.hash = `#/relate/${na || ''}/${nb || ''}`; };
  $$('[data-pick]', view).forEach(inp => attachSearch(inp, inp.nextElementSibling, p => inp.dataset.pick === 'a' ? go(p.id, b) : go(a, p.id), { searchFn: q => search(q), render: searchRow }));
  $$('[data-clear]', view).forEach(btn => btn.onclick = e => { e.preventDefault(); btn.dataset.clear === 'a' ? go('', b) : go(a, ''); });
  $('[data-swap]', view).onclick = () => go(b, a);
  if (!a || !b) setTimeout(() => $('[data-pick]', view)?.focus(), 50);
}

// ---------- Timeline ----------
let tlFilter = new Set(['b', 'd', 'm']);
export function renderTimeline(view) {
  const ev = [];
  for (const p of allPeople()) {
    if (p.birth?.y) ev.push({ k: 'b', y: p.birth.y, d: p.birth, pid: p.id });
    if (p.death?.y) ev.push({ k: 'd', y: p.death.y, d: p.death, pid: p.id });
  }
  for (const u of Object.values(store.U)) if (u.marriage?.y && u.husband) ev.push({ k: 'm', y: u.marriage.y, d: u.marriage, pid: u.husband, other: u.wife });
  const shown = ev.filter(e => tlFilter.has(e.k)).sort((a, b) => a.y - b.y || (a.d.m || 0) - (b.d.m || 0) || (a.d.d || 0) - (b.d.d || 0));
  const decades = new Map();
  shown.forEach(e => { const dc = Math.floor(e.y / 10) * 10; if (!decades.has(dc)) decades.set(dc, []); decades.get(dc).push(e); });
  const dot = { b: 'var(--b3)', d: 'var(--text-3)', m: 'var(--b1)' };
  const label = e => e.k === 'b' ? t('bornEv') : e.k === 'd' ? t('diedEv') : t('marriedEv', { name: displayName(person(e.other)) });
  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('tlTitle')}</h1><span class="small muted">${t('tlNote')}</span></div>
    <div class="filters">${[['b', 'births'], ['d', 'deaths'], ['m', 'marriages']].map(([k, l]) => `<button class="chip ${tlFilter.has(k) ? 'on' : ''}" data-f="${k}" aria-pressed="${tlFilter.has(k)}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dot[k]};margin-right:.35em"></span>${t(l)} (${ev.filter(e => e.k === k).length})</button>`).join('')}</div>
    ${shown.length ? [...decades].map(([dc, list]) => `<section class="tl-decade"><h2>${dc}s</h2><ul class="tl-list">${list.map(e => {
      const p = person(e.pid);
      return `<li class="tl-item" style="--dot:${dot[e.k]}"><span class="when">${esc(fmtDate(e.d))}</span><a href="#/person/${esc(e.pid)}">${avatar(p, 'sm')}<span><span class="nm">${nameOf(p)}</span> <span class="muted">${esc(label(e))}</span></span></a></li>`;
    }).join('')}</ul></section>`).join('') : `<div class="empty">${t('tlEmpty')}</div>`}
  </div>`;
  $$('[data-f]', view).forEach(b => b.onclick = () => { const k = b.dataset.f; tlFilter.has(k) ? tlFilter.delete(k) : tlFilter.add(k); renderTimeline(view); });
}

// ---------- Gallery ----------
let galFilter = 'with';
export function renderGallery(view, { isEditing, onAddPhoto } = {}) {
  const everyone = allPeople().filter(isNamed);
  const list = everyone.filter(p => galFilter === 'all' || (galFilter === 'with' ? p.photo : !p.photo)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('galTitle')}</h1></div>
    <div class="filters">${[['with', 'galWithPhoto', everyone.filter(p => p.photo).length], ['without', 'galNoPhoto', everyone.filter(p => !p.photo).length], ['all', 'galAll', everyone.length]].map(([k, l, n]) =>
      `<button class="chip ${galFilter === k ? 'on' : ''}" data-g="${k}" aria-pressed="${galFilter === k}">${t(l)} (${n})</button>`).join('')}</div>
    <div class="gallery">${list.map(p => `<a href="#/person/${esc(p.id)}" style="--branch:${branchColour(p.id)}"><div class="tile">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : esc((p.given || '?')[0])}</div>${nameOf(p)}${p.nickname ? `<div class="small muted">“${esc(p.nickname)}”</div>` : ''}</a>`).join('')}</div></div>`;
  $$('[data-g]', view).forEach(b => b.onclick = () => { galFilter = b.dataset.g; renderGallery(view, { isEditing, onAddPhoto }); });
}

// ---------- Stats ----------
function daysUntil(m, d) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 864e5);
}
const whenLabel = n => n === 0 ? t('today') : n === 1 ? t('tomorrow') : t('inDays', { n });

export function maxGenerations(root) {
  const memo = new Map();
  const depth = (pid, seen) => {
    if (memo.has(pid)) return memo.get(pid);
    if (seen.has(pid)) return 0; seen.add(pid);
    const d = 1 + Math.max(0, ...childrenOf(pid).map(c => depth(c, seen)));
    memo.set(pid, d); return d;
  };
  return depth(root, new Set());
}

export function renderStats(view) {
  const people = allPeople();
  const named = people.filter(isNamed);
  const photos = people.filter(p => p.photo).length;
  const today = new Date();
  const bdays = people.filter(p => isLiving(p) && p.birth?.m && p.birth?.d).map(p => ({ p, n: daysUntil(p.birth.m, p.birth.d) })).filter(x => x.n <= 60).sort((a, b) => a.n - b.n);
  const remember = people.filter(p => p.death?.m && p.death?.d).map(p => ({ p, n: daysUntil(p.death.m, p.death.d) })).sort((a, b) => a.n - b.n);
  const onDay = people.filter(p => (p.birth?.m === today.getMonth() + 1 && p.birth?.d === today.getDate()) || (p.death?.m === today.getMonth() + 1 && p.death?.d === today.getDate()));
  const fams = Object.values(store.U).map(u => ({ u, n: kidsOf(u.id).length })).sort((a, b) => b.n - a.n).slice(0, 6);
  const unnamed = people.filter(p => !isNamed(p));
  const noDates = named.filter(p => !p.birth && !p.death).length;
  const gens = maxGenerations(mainFounder());
  const tile = (n, l) => `<div class="tile-stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`;
  const row = (p, right) => `<li>${avatar(p, 'sm')}<a href="#/person/${esc(p.id)}">${nameOf(p)}</a><span class="right">${right}</span></li>`;
  const maxKids = fams[0]?.n || 1;

  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('statsTitle')}</h1></div>
    <div class="tiles">${tile(people.length, t('sPeople'))}${tile(named.length, t('sNamed'))}${tile(Object.keys(store.U).length, t('sFamilies'))}${tile(gens, t('sGens'))}${tile(photos, t('sPhotos'))}${tile(founders().length, t('sLines'))}</div>
    <div class="two-col">
      <section class="card-box"><h2>${t('upcoming')}</h2>
        ${onDay.length ? `<p><strong>${t('onThisDay')}:</strong> ${onDay.map(p => `<a href="#/person/${esc(p.id)}">${nameOf(p)}</a>`).join(', ')}</p>` : ''}
        ${bdays.length ? `<ul class="list-plain">${bdays.map(({ p, n }) => row(p, `${esc(fmtDate({ m: p.birth.m, d: p.birth.d }))}<br>${esc(whenLabel(n))}`)).join('')}</ul>` : `<p class="muted">${t('noneSoon')}</p>`}
        ${remember.length ? `<h3 style="margin-top:1.2rem">${t('remembrance')}</h3><ul class="list-plain">${remember.slice(0, 6).map(({ p, n }) => row(p, `${esc(fmtDate(p.death))}<br>${esc(whenLabel(n))}`)).join('')}</ul>` : ''}
      </section>
      <section class="card-box"><h2>${t('biggestFamilies')}</h2>
        <ul class="list-plain">${fams.map(({ u, n }) => {
          const h = person(u.husband), w = person(u.wife);
          return `<li style="display:grid;grid-template-columns:1fr auto;gap:.2rem .6rem"><span><a href="#/focus/${esc(u.husband || u.wife)}">${esc(displayName(h))}</a> & ${esc(displayName(w))}</span><span class="right">${n} ${t('children').toLowerCase()}</span>
            <div class="bar" style="width:${Math.max(4, (n / maxKids) * 100)}%;grid-column:1/-1;background:${branchColour(u.husband || u.wife)}"></div></li>`;
        }).join('')}</ul>
      </section>
    </div>
    <section class="card-box" style="margin-top:1rem"><h2>${t('helpTitle')}</h2><p class="muted">${t('helpIntro')}</p>
      <p class="small">${named.length - named.filter(p => p.photo).length} ${t('noPhoto')} · ${noDates} ${t('noDates')}</p>
      ${unnamed.length ? `<h3>${t('unnamed')} (${unnamed.length})</h3><ul class="list-plain">${unnamed.map(p => `<li>${avatar(p, 'sm')}<a href="#/person/${esc(p.id)}">${esc(contextLine(p.id) || t('unknown'))}</a><span class="right"><button class="btn sm" data-sg="${esc(p.id)}">${t('suggest')}</button></span></li>`).join('')}</ul>` : ''}
    </section></div>`;
  $$('[data-sg]', view).forEach(b => b.onclick = () => openSuggest(b.dataset.sg));
}

export { searchRow };
