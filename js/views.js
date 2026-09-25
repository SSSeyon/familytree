// Family (focus) view, relationship finder, timeline, gallery and stats.
import { store, person, parentsOf, unionsOf, spouseIn, kidsOf, siblingsOf, displayName, lifeSpan, isLiving, fmtDate, search, contextLine, allPeople, founders, mainFounder, isNamed, descendants, childrenOf } from './data.js';
import { relSentence, relWord, relToYou, relationPath } from './relate.js';
import { branchColour } from './chart.js';
import { getMe, openSuggest, datesLine, rememberPerson, descLine } from './person.js';
import { openAddFamily } from './family.js';
import { t } from './i18n.js';
import { esc, icon, avatar, html, $, $$, attachSearch, nameOf, srcAttr } from './ui.js';
import { renderMonth } from './month.js';
import { renderNews, hasUnseenNews } from './news.js';

const searchRow = p => {
  const me = getMe(), rel = me && me !== p.id ? relToYou(me, p.id) : null;
  return `${avatar(p, 'sm')}<span><div>${nameOf(p)}${p.nickname ? ` <span class="muted small">“${esc(p.nickname)}”</span>` : ''}</div><div class="small muted">${rel ? `<span class="rel-inline">${esc(rel)}</span> · ` : ''}${esc(contextLine(p.id))}</div></span>`;
};

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
  rememberPerson(pid);
  const pp = parentsOf(pid);
  const gp = side => { const q = side && parentsOf(side); return q ? [q.father, q.mother].filter(Boolean) : []; };
  const grand = pp ? [...gp(pp.father), ...gp(pp.mother)] : [];
  const unions = unionsOf(pid);
  const sib = siblingsOf(pid), sibs = [...sib.full, ...sib.half];

  view.innerHTML = `<div class="focus">
    ${grand.length ? `<div class="fam-label">${t('grandparents')}</div><div class="fam-row">${grand.map(g => pcard(g, 'sm')).join('')}</div><div class="fam-connector"></div>` : ''}
    ${pp ? `<div class="fam-label">${t('parents')}</div><div class="fam-row"><div class="couple">
      ${pp.father ? pcard(pp.father, 'sm') : ghost(t('father'))}<span class="amp">&</span>${pp.mother ? pcard(pp.mother, 'sm') : ghost(t('mother'))}
    </div></div><div class="fam-connector"></div>` : ''}
    <div class="center-block">
      ${pcard(pid, 'center', { href: `#/person/${esc(pid)}` })}
      ${unions.filter(u => spouseIn(u, pid)).map(u => `<span class="amp muted" title="${u.separated ? esc(t('separated')) : ''}">${u.separated ? '⚮' : '⚭'}</span>${pcard(spouseIn(u, pid), u.separated ? 'sep' : '')}`).join('')}
    </div>
    ${descLine(pid)}
    <div class="focus-actions">
      <a class="btn sm" href="#/person/${esc(pid)}">${icon('info')}${t('details')}</a>
      <a class="btn sm" href="#/chart/${esc(pid)}">${icon('tree')}${t('viewInTree')}</a>
      <button class="btn sm" data-addfam>${icon('plus')}${t('afButton')}</button>
      <button class="btn sm" data-suggest>${icon('chat')}${t('suggest')}</button>
    </div>
    ${unions.some(u => kidsOf(u.id).length) ? `<div class="fam-connector"></div><div class="fam-label">${t('children')}</div>` : ''}
    ${unions.filter(u => kidsOf(u.id).length).map(u => {
      const sp = spouseIn(u, pid);
      return `<div class="kid-group">${unions.length > 1 || !sp ? `<h4>${esc(sp ? t('withSpouse', { name: displayName(person(sp)) }) : t('withUnknown'))}</h4>` : ''}
        <div class="fam-row">${kidsOf(u.id).map(k => pcard(k, 'sm')).join('')}</div></div>`;
    }).join('')}
    ${sibs.length ? `<div class="fam-label">${t('siblings')}</div><div class="fam-row">${sibs.map(s => pcard(s, 'sm')).join('')}</div>` : ''}
  </div>`;
  $('[data-suggest]', view).onclick = () => openSuggest(pid);
  $('[data-addfam]', view).onclick = () => openAddFamily(pid);
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
    const path = relationPath(a, b);
    const nm = id => displayName(person(id));
    result = `<div class="card-box relate-answer"><div class="big">${esc(relSentence(a, b, nm))}</div>
      ${relWord(b, a) && a !== b ? `<div class="muted" style="margin-top:.4rem">${esc(relSentence(b, a, nm))}</div>` : ''}</div>
      ${path && path.length > 1 ? `<div class="section-title">${t('relPath')}</div>${pathDiagram(path, a, b)}` : ''}`;
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


// ---------- relationship path as a mini family tree ----------
// Going up to a parent stacks the card above; coming back down moves one column
// right; a marriage sits side by side. Connectors are drawn like a family tree.
function pathDiagram(path, a, b) {
  const CW = 150, CH = 124, LH = 176, PAD = 12;
  const nodes = [];
  let col = 0, lvl = 0, last = null;
  path.forEach((s, i) => {
    const e = s.edge;
    if (e === 'eParent') { if (last === 'eChild') col++; lvl--; }
    if (e === 'eChild') { if (last === 'eParent') col++; lvl++; }
    if (e === 'eSpouse') col++;
    nodes.push({ id: s.id, edge: e, col, lvl, x: 0 });
    if (e) last = e === 'eSpouse' ? last : e;
  });
  // a peak (up then down) sits centred between its two columns
  nodes.forEach((n, i) => {
    n.x = n.col;
    const pv = nodes[i + 1];
    if (n.edge === 'eParent' && pv?.edge === 'eChild') n.x = n.col + 0.5, n.peak = true;
  });
  const minL = Math.min(...nodes.map(n => n.lvl));
  nodes.forEach(n => { n.px = PAD + n.x * CW; n.py = PAD + (n.lvl - minL) * LH; });
  const width = PAD * 2 + (Math.max(...nodes.map(n => n.x)) + 1) * CW - (CW - 130);
  const height = PAD * 2 + (Math.max(...nodes.map(n => n.lvl)) - minL) * LH + CH;
  const cx = n => n.px + 65;
  let lines = '';
  nodes.forEach((n, i) => {
    if (!i) return;
    const p = nodes[i - 1];
    if (n.edge === 'eSpouse') {
      const y = n.py + 34, x1 = Math.min(p.px, n.px) + 130, x2 = Math.max(p.px, n.px);
      const sep = unionsOf(p.id).some(u => spouseIn(u, p.id) === n.id && u.separated);
      lines += `<path class="pl marr${sep ? ' sep' : ''}" d="M${x1},${y - 3}H${x2}M${x1},${y + 3}H${x2}"/>`;
      return;
    }
    const [top, bot] = n.edge === 'eParent' ? [n, p] : [p, n];
    // a child of a couple hangs from the middle of the marriage line
    const couple = n.edge === 'eChild' && p.edge === 'eSpouse' ? nodes[i - 2] : null;
    let x0 = cx(top), y0 = top.py + CH;
    if (couple) { x0 = (Math.min(couple.px, p.px) + 130 + Math.max(couple.px, p.px)) / 2; y0 = p.py + 37; }
    const midY = bot.py - (LH - CH) / 2;
    lines += `<path class="pl" d="M${x0},${y0}V${midY}H${cx(bot)}V${bot.py}"/>`;
  });
  const nm = id => displayName(person(id));
  const cards = nodes.map((n, i) => {
    const p = person(n.id);
    const rel = n.id === a ? null : relWord(a, n.id);
    const cls = n.id === a || n.id === b ? ' end' : n.peak ? ' peak' : '';
    // both children descend from the same couple → name the other common ancestor too
    const other = n.peak && (() => {
      const x = parentsOf(nodes[i - 1].id), y = parentsOf(nodes[i + 1].id);
      return x && y && x.union.id === y.union.id ? [x.father, x.mother].find(id => id && id !== n.id) : null;
    })();
    return `<a class="pnode${cls}" href="#/person/${esc(n.id)}" style="left:${n.px}px;top:${n.py}px;--branch:${branchColour(n.id)}">
      ${avatar(p, 'sm')}<div class="nm">${esc(nm(n.id))}</div>
      ${rel ? `<div class="rl">${esc(t('relOf', { a: nm(a), rel }))}</div>` : `<div class="rl">${esc(t('relStart'))}</div>`}
      ${n.peak ? `<div class="pk">${esc(t('commonAncestor'))}${other ? ` & ${esc(nm(other))}` : ''}</div>` : ''}
    </a>`;
  }).join('');
  return `<div class="pathtree-wrap"><div class="pathtree" style="width:${width}px;height:${height}px">
    <svg width="${width}" height="${height}" aria-hidden="true">${lines}</svg>${cards}</div></div>
    <p class="small muted">${esc(t('relPathHint'))}</p>`;
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
    <div class="gallery">${list.map(p => `<a href="#/person/${esc(p.id)}" style="--branch:${branchColour(p.id)}"><div class="tile">${p.photo ? `<img ${srcAttr(p.photo)} alt="" loading="lazy">` : esc((p.given || '?')[0])}</div>${nameOf(p)}${p.nickname ? `<div class="small muted">“${esc(p.nickname)}”</div>` : ''}</a>`).join('')}</div></div>`;
  $$('[data-g]', view).forEach(b => b.onclick = () => { galFilter = b.dataset.g; renderGallery(view, { isEditing, onAddPhoto }); });
}

// ---------- Stats ----------

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
  const unnamed = people.filter(p => !isNamed(p));
  const noDates = named.filter(p => !p.birth && !p.death).length;
  const gens = maxGenerations(mainFounder());
  const tile = (n, l) => `<div class="tile-stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`;
  const row = (p, right) => `<li>${avatar(p, 'sm')}<a href="#/person/${esc(p.id)}">${nameOf(p)}</a><span class="right">${right}</span></li>`;

  view.innerHTML = `<div class="page"><div class="page-head"><h1>${t('statsTitle')}</h1></div>
    <div class="tiles">${tile(people.length, t('sPeople'))}${tile(named.length, t('sNamed'))}${tile(Object.keys(store.U).length, t('sFamilies'))}${tile(gens, t('sGens'))}${tile(photos, t('sPhotos'))}${tile(founders().length, t('sLines'))}</div>
    <section class="card-box" style="margin-top:1rem"><h2>${t('helpTitle')}</h2><p class="muted">${t('helpIntro')}</p>
      <p class="small">${named.length - named.filter(p => p.photo).length} ${t('noPhoto')} · ${noDates} ${t('noDates')}</p>
      ${unnamed.length ? `<h3>${t('unnamed')} (${unnamed.length})</h3><ul class="list-plain">${unnamed.map(p => `<li>${avatar(p, 'sm')}<a href="#/person/${esc(p.id)}">${esc(contextLine(p.id) || t('unknown'))}</a><span class="right"><button class="btn sm" data-sg="${esc(p.id)}">${t('suggest')}</button></span></li>`).join('')}</ul>` : ''}
    </section></div>`;
  $$('[data-sg]', view).forEach(b => b.onclick = () => openSuggest(b.dataset.sg));
}

export { searchRow };

// ---------- Explore: photos / timeline / stats in one tab ----------
export function renderExplore(view, sub) {
  sub = ['month', 'news', 'photos', 'timeline', 'stats'].includes(sub) ? sub : (() => { try { return localStorage.getItem('ft.explore') || 'month'; } catch (e) { return 'month'; } })();
  try { localStorage.setItem('ft.explore', sub); } catch (e) {}
  view.innerHTML = `<nav class="subnav" aria-label="${esc(t('tabExplore'))}">${[['month', 'thisMonth', 'cake'], ['news', 'whatsNew', 'spark'], ['photos', 'tabGallery', 'photo'], ['timeline', 'tabTimeline', 'clock'], ['stats', 'tabStats', 'chart']]
    .map(([k, l, ic]) => `<a href="#/explore/${k}" ${k === sub ? 'aria-current="page"' : ''}>${icon(ic)}${t(l)}${k === 'news' && hasUnseenNews() ? '<i class="new-dot"></i>' : ''}</a>`).join('')}</nav><div class="explore-body"></div>`;
  const body = $('.explore-body', view);
  if (sub === 'month') renderMonth(body);
  if (sub === 'news') renderNews(body);
  if (sub === 'photos') renderGallery(body);
  if (sub === 'timeline') renderTimeline(body);
  if (sub === 'stats') renderStats(body);
}
