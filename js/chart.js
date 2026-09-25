// Full descendant chart with pan/zoom, collapsible branches and branch colours.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { store, person, unionsOf, kidsOf, spouseIn, displayName, lifeSpan, initials, mainFounder, founderFor, descendants, parentsOf, spousesOf, search, contextLine } from './data.js';
import { t } from './i18n.js';
import { esc, icon, html, $, download, toast, srcAttr, attachSearch, avatar } from './ui.js';
import { getMe, setMe } from './person.js';
import { relWord } from './relate.js';

const W = 146, H = 60, SG = 22, HG = 18, VG = 62;
const CLIP = '<clipPath id="ph-clip" clipPathUnits="userSpaceOnUse"><circle cx="28" cy="30" r="19"/></clipPath>';
const PALETTE = ['--b1', '--b2', '--b3', '--b4', '--b5', '--b6', '--b7', '--b8'];
const SPOUSE_COLS = ['--b1', '--b2', '--b7', '--b5', '--b3']; // tell apart the families of someone with several partners
const GENS = ['--g0', '--g1', '--g2', '--g3', '--g4', '--g5'];

const CHART_CSS = `
.card{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.node{cursor:pointer}
.node:hover .card{stroke:var(--text-2)}
.node.hl .card{stroke:var(--accent);stroke-width:3}
.node.dup .card{stroke-dasharray:5 4;fill:var(--surface-2)}
.nm{font:600 12.5px Inter,system-ui,sans-serif;fill:var(--text)}
.sub{font:400 10.5px Inter,system-ui,sans-serif;fill:var(--text-2)}
.ini{font:600 13px Inter,system-ui,sans-serif;fill:var(--text-3)}
.phbg{fill:var(--surface-3)}
.link{fill:none;stroke:var(--line-strong);stroke-width:1.5}
.mline{stroke:var(--line-strong);stroke-width:2}
.mline.sep{stroke-dasharray:5 3}
.sepmark{stroke:var(--text-2);stroke-width:2;stroke-linecap:round}
.tog{cursor:pointer}
.tog circle{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.tog text{font:600 11px Inter,system-ui,sans-serif;fill:var(--text-2)}
.tog:hover circle{fill:var(--surface-2)}
.badge{cursor:pointer}
.badge rect{fill:var(--surface-2);stroke:var(--line-strong)}
.badge text{font:600 10px Inter,system-ui,sans-serif;fill:var(--text-2)}
.rtag rect{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1}
.rtag text{font:600 9.5px Inter,system-ui,sans-serif;fill:var(--text)}
.rtag.me rect{fill:var(--accent)}.rtag.me text{fill:var(--accent-ink)}
@keyframes ftpulse{0%,100%{stroke-width:3}50%{stroke-width:7}}
.node.pulse .card{animation:ftpulse .7s ease-in-out 3}
`;
const VARS = ['--surface', '--surface-2', '--surface-3', '--line-strong', '--text', '--text-2', '--text-3', '--accent', '--accent-soft', '--accent-ink', '--bg', ...PALETTE, '--b-other', ...GENS];

export const chartState = {
  root: null,
  colourBy: 'branch',
  collapsed: new Map(),   // root -> Set of collapsed person ids
  transforms: new Map(),  // root -> d3 zoom transform
};
try { chartState.colourBy = localStorage.getItem('ft.colour') || 'branch'; } catch (e) {}
try { chartState.showRel = localStorage.getItem('ft.relTags') !== '0'; } catch (e) { chartState.showRel = true; }

let ctx = null; // live render context
const meAsked = () => { try { return localStorage.getItem('ft.meAsked') === '1'; } catch (e) { return false; } };
// Redraw in place (e.g. after "I am…" changes), keeping the zoom.
export function redrawChart() { if (ctx?.wrap.isConnected) { $('.me-ask', ctx.wrap)?.remove(); draw(); } }

// "Who are you?" box on the tree (new visitors, or the relationships toggle with nobody picked).
function showMeAsk(wrap) {
  if ($('.me-ask', wrap)) return $('.me-ask [data-me]', wrap).focus();
  const box = html(`<div class="me-ask card-box">
    <div class="row"><strong>${t('whoAreYou')}</strong><button class="icon-btn" data-act="no-me" aria-label="${t('notNow')}" title="${t('notNow')}">${icon('close')}</button></div>
    <p class="small muted">${t('meHint')}</p>
    <div class="picker"><input type="search" data-me placeholder="${esc(t('searchPh'))}" aria-label="${esc(t('chooseYourself'))}"><ul class="search-results" hidden></ul></div>
  </div>`);
  $('#legend', wrap).after(box);
  const inp = $('[data-me]', box);
  attachSearch(inp, inp.nextElementSibling, p => { box.remove(); setMe(p.id); toast(t('youAre', { name: displayName(p) })); },
    { searchFn: q => search(q), render: p => `${avatar(p, 'sm')}<span><div>${esc(displayName(p))}</div><div class="small muted">${esc(contextLine(p.id))}</div></span>` });
}

// branch = a person tapped in the tree: show their forebears up to the top of the line,
// their siblings (full and half), spouses and descendants. Without it, the whole line from root is drawn.
export function renderChart(view, { root, focusId, branch, onOpen, onRoot, onBranch }) {
  const P = store.P;
  let mode = null, key;
  if (branch && P[branch]) {
    const chain = lineage(branch);
    root = chain[0];
    const next = new Map(chain.slice(0, -1).map((a, i) => [a, chain[i + 1]]));
    mode = { focus: branch, root, pu: P[branch].parents, next, parent: chain[chain.length - 2], depth: chain.length - 1 };
    key = 'f:' + branch;
    focusId = branch;
  } else {
    root = root && P[root] ? root : chartState.root && P[chartState.root] ? chartState.root : mainFounder();
    if (focusId && !descendants(root).has(focusId) && !spousesOf(focusId).some(s => descendants(root).has(s))) root = founderFor(focusId);
    chartState.root = root;
    key = root;
  }
  const fresh = !chartState.collapsed.has(key);
  if (fresh) chartState.collapsed.set(key, new Set());
  const collapsed = chartState.collapsed.get(key);
  if (fresh) defaultCollapse(mode ? branch : root, collapsed);
  if (focusId && !mode) expandTo(root, focusId, collapsed);

  view.innerHTML = '';
  const wrap = html(`<div class="chart-wrap">
    <div class="chart-toolbar">
      ${mode
        ? `<div class="tool-group"><button class="btn sm" data-act="whole">${icon('tree')}${t('wholeTree')}</button><button class="btn sm" data-act="details">${icon('info')}${t('details')}</button><button class="btn sm" data-act="fan">${icon('fan')}${t('fanChart')}</button></div>`
        : root !== mainFounder() ? `<div class="tool-group"><button class="btn sm" data-act="home">${icon('tree')}${esc(t('lineOf', { name: displayName(P[mainFounder()]) }))}</button></div>` : ''}
      <div class="tool-group"><label class="sr-only" for="colour-sel">${t('colourBy')}</label>
        <select id="colour-sel">${['branch', 'gen', 'sex', 'none'].map(c => `<option value="${c}" ${c === chartState.colourBy ? 'selected' : ''}>${t({ branch: 'cBranch', gen: 'cGen', sex: 'cSex', none: 'cNone' }[c])}</option>`).join('')}</select></div>
      <div class="tool-group">
        <button class="icon-btn" data-act="rel" aria-pressed="${chartState.showRel}" title="${t('showRel')}" aria-label="${t('showRel')}">${icon('tag')}</button>
        <button class="icon-btn" data-act="expand" title="${t('expandAll')}" aria-label="${t('expandAll')}">${icon('expand')}</button>
        <button class="icon-btn" data-act="collapse" title="${t('collapseAll')}" aria-label="${t('collapseAll')}">${icon('collapse')}</button>
        <button class="icon-btn" data-act="png" title="${t('exportPng')}" aria-label="${t('exportPng')}">${icon('download')}</button>
      </div>
    </div>
    <svg class="chart-svg" role="img" aria-label="${esc(t('tabChart'))}"><style>${CHART_CSS}</style>
      <defs>${CLIP}</defs>
      <g class="scene"></g></svg>
    <div class="legend" id="legend"></div>
    <div class="zoom-ctl tool-group">
      <button class="icon-btn" data-act="in" aria-label="${t('zoomIn')}" title="${t('zoomIn')}">${icon('plus')}</button>
      <button class="icon-btn" data-act="out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">${icon('minus')}</button>
      <button class="icon-btn" data-act="fit" aria-label="${t('fit')}" title="${t('fit')}">${icon('fit')}</button>
    </div>
  </div>`);
  view.append(wrap);

  const svg = d3.select(wrap).select('svg.chart-svg');
  const scene = svg.select('.scene');
  const zoom = d3.zoom().scaleExtent([0.02, 2.5]).on('zoom', e => {
    scene.attr('transform', e.transform);
    chartState.transforms.set(key, e.transform);
  });
  svg.call(zoom).on('dblclick.zoom', null);

  ctx = { wrap, svg, scene, zoom, root, mode, collapsed, onOpen, onRoot, onBranch, layout: null, highlight: mode ? branch : undefined };
  draw();

  const saved = chartState.transforms.get(key);
  if (mode && saved) svg.call(zoom.transform, saved);
  else if (mode) fitOrCenter(branch);
  else if (focusId) centerOn(focusId, false);
  else if (saved) svg.call(zoom.transform, saved);
  else initialView();

  if (!getMe() && !meAsked()) showMeAsk(wrap);
  $('#colour-sel', wrap).onchange =e => { chartState.colourBy = e.target.value; try { localStorage.setItem('ft.colour', e.target.value); } catch (er) {} draw(); };
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'in') svg.transition().duration(250).call(zoom.scaleBy, 1.4);
    if (act === 'out') svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4);
    if (act === 'fit') fit();
    if (act === 'expand') { collapsed.clear(); draw(); fit(); }
    if (act === 'collapse') { collapsed.clear(); defaultCollapse(mode ? branch : ctx.root, collapsed, 2); draw(); initialView(); }
    if (act === 'png') exportPng();
    if (act === 'home') onRoot(mainFounder());
    if (act === 'whole') location.hash = `#/chart/${branch}`;
    if (act === 'details') onOpen(branch);
    if (act === 'fan') location.hash = `#/fan/${branch}`;
    if (act === 'rel') {
      chartState.showRel = !chartState.showRel;
      try { localStorage.setItem('ft.relTags', chartState.showRel ? '1' : '0'); } catch (er) {}
      b.setAttribute('aria-pressed', chartState.showRel);
      if (chartState.showRel && !getMe()) showMeAsk(wrap);
      draw();
      toast(t(chartState.showRel ? 'relOn' : 'relOff'));
    }
    if (act === 'no-me') { b.closest('.me-ask').remove(); try { localStorage.setItem('ft.meAsked', '1'); } catch (er) {} }
  });
}

// ---------- layout (contour packing: subtrees slide together as far as their outlines allow) ----------
// "b" = breadth axis (x), depth = y.
const dims = () => ({ B: W, SGB: SG, GAP: HG, STEP: H + VG });

// Forebears of pid, top first, following the parent who belongs to the main family line.
function lineage(pid) {
  const main = descendants(mainFounder());
  const chain = [pid];
  for (let cur = pid, g = 0; g < 80; g++) {
    const pp = parentsOf(cur);
    const cands = [pp?.father, pp?.mother].filter(Boolean);
    const up = cands.find(x => main.has(x)) || cands.find(x => person(x)?.parents) || cands[0];
    if (!up || chain.includes(up)) break;
    chain.unshift(up); cur = up;
  }
  return chain;
}

function build(pid, depth, seen, collapsed) {
  const dup = seen.has(pid);
  seen.add(pid);
  let unions = dup ? [] : unionsOf(pid);
  const m = ctx.mode;
  let only = null, lock = false;
  if (m) {
    const nx = m.next.get(pid);
    lock = !!nx;
    if (nx && pid !== m.parent) { unions = unions.filter(u => kidsOf(u.id).includes(nx)); only = nx; } // forebears: just the line
    else if (depth === m.depth && pid !== m.focus) unions = [];                                        // siblings: just the person
  }
  const node = { pid, depth, dup, lock, spouses: [], groups: [], hasKids: false, collapsed: !lock && collapsed.has(pid) };
  for (const u of unions) {
    const sp = spouseIn(u, pid);
    const si = sp ? node.spouses.push({ pid: sp, uid: u.id, sep: !!u.separated }) - 1 : -1;
    const kids = only ? [only] : kidsOf(u.id);
    if (kids.length) node.hasKids = true;
    if (kids.length && !node.collapsed) node.groups.push({ uid: u.id, si, kids: kids.map(k => build(k, depth + 1, seen, collapsed)) });
  }
  // the focus's other parent may have children with someone else: they are siblings too
  if (m && pid === m.parent && m.pu) {
    const u0 = store.U[m.pu], op = u0 && spouseIn(u0, pid), si = node.spouses.findIndex(s => s.pid === op);
    if (si >= 0) for (const u of unionsOf(op)) {
      const kids = u.id === m.pu ? [] : kidsOf(u.id).filter(k => !seen.has(k));
      if (kids.length) node.groups.push({ uid: u.id, si, viaSp: true, kids: kids.map(k => build(k, depth + 1, seen, collapsed)) });
    }
  }
  node.kidCount = only ? 1 : unions.reduce((n, u) => n + kidsOf(u.id).length, 0);
  const { B, SGB } = dims();
  node.blockB = B + node.spouses.length * (B + SGB);
  layoutKids(node);
  return node;
}

// Positions children relative to the parent's block (start edge = 0) and builds the outline.
function layoutKids(node) {
  const { B, SGB, GAP } = dims();
  const kids = node.groups.flatMap((g, gi) => g.kids.map((k, i) => ({ k, gap: i === 0 && gi > 0 ? GAP * 2 : GAP })));
  node.contour = { l: [0], r: [node.blockB] };
  if (!kids.length) return;
  const acc = { l: [], r: [] };
  const pos = [];
  kids.forEach(({ k, gap }, i) => {
    let x = 0;
    if (i > 0) {
      x = -Infinity;
      const n = Math.min(acc.r.length, k.contour.l.length);
      for (let d = 0; d < n; d++) x = Math.max(x, acc.r[d] - k.contour.l[d] + gap);
    }
    pos.push(x);
    k.contour.l.forEach((v, d) => { acc.l[d] = Math.min(acc.l[d] ?? Infinity, x + v); acc.r[d] = Math.max(acc.r[d] ?? -Infinity, x + k.contour.r[d]); });
  });
  // centre the couple's connector over the children
  const mid = (pos[0] + pos[pos.length - 1] + B) / 2;
  const anchor = node.spouses.length ? B + SGB / 2 : B / 2;
  const start = mid - anchor;
  kids.forEach(({ k }, i) => { k.offset = pos[i] - start; });
  acc.l.forEach((v, d) => { node.contour.l[d + 1] = v - start; node.contour.r[d + 1] = acc.r[d] - start; });
}

function place(node, b, d, out) {
  const { B, SGB, STEP } = dims();
  node.px = b; node.py = d;
  node.spouses.forEach((s, i) => { s.x = b + (i + 1) * (B + SGB); s.y = d; });
  node.bw = node.blockB; node.bh = H;
  out.push(node);
  for (const g of node.groups) for (const k of g.kids) place(k, b + k.offset, d + STEP, out);
}

function flatten(root) {
  const seen = new Set();
  const tree = build(root, 0, seen, ctx.collapsed);
  const nodes = [];
  place(tree, -Math.min(...tree.contour.l), 0, nodes);
  return { tree, nodes };
}

// ---------- colours ----------
function branchInfo(root) {
  // walk down while there is a single child; the children at the first split define branches
  let cur = root, trunk = new Set([root]);
  for (let guard = 0; guard < 50; guard++) {
    const kids = unionsOf(cur).flatMap(u => kidsOf(u.id));
    if (kids.length !== 1) break;
    cur = kids[0]; trunk.add(cur);
  }
  const heads = unionsOf(cur).flatMap(u => kidsOf(u.id));
  const map = new Map();
  heads.forEach((h, i) => descendants(h).forEach(d => { if (!map.has(d)) map.set(d, i); }));
  return { trunk, heads, map };
}

// Branch colour for HTML views (relative to the main family line).
export function branchColour(pid) {
  const bi = branchInfo(mainFounder());
  if (!bi.map.has(pid)) return bi.trunk.has(pid) ? 'var(--text-2)' : 'var(--line-strong)';
  const i = bi.map.get(pid);
  return i < PALETTE.length ? `var(${PALETTE[i]})` : 'var(--b-other)';
}

function colourFor(pid, depth, isSpouse, bi) {
  const by = chartState.colourBy;
  if (by === 'none') return 'var(--line-strong)';
  if (by === 'sex') { const s = person(pid)?.sex; return s === 'M' ? 'var(--b1)' : s === 'F' ? 'var(--b2)' : 'var(--b-other)'; }
  if (by === 'gen') return `var(${GENS[Math.min(depth, GENS.length - 1)]})`;
  if (isSpouse || !bi.map.has(pid)) return bi.trunk.has(pid) ? 'var(--text-2)' : 'var(--b-other)';
  const i = bi.map.get(pid);
  return i < PALETTE.length ? `var(${PALETTE[i]})` : 'var(--b-other)';
}

// Key box for sex / generation colouring. Branch colouring has no key box.
function drawLegend(maxDepth) {
  const el = $('#legend', ctx.wrap);
  const by = chartState.colourBy;
  let items = [];
  if (by === 'sex') items = [['var(--b1)', t('male')], ['var(--b2)', t('female')], ['var(--b-other)', t('unknownSex')]];
  else if (by === 'gen') items = GENS.slice(0, Math.min(maxDepth + 1, GENS.length)).map((g, i) => [`var(${g})`, t('generation', { n: i + 1 }) + (i === GENS.length - 1 ? '+' : '')]);
  el.hidden = !items.length;
  el.innerHTML = `<strong>${t('colourBy')}</strong><ul>${items.map(([c, l]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('')}</ul>`;
}

// ---------- drawing ----------
function draw() {
  const { scene, root } = ctx;
  const { nodes } = flatten(root);
  ctx.layout = nodes;
  const bi = branchInfo(ctx.mode ? mainFounder() : root);
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  drawLegend(maxDepth);
  const hl = ctx.highlight;
  // "I am…": label everyone with how they are related to the viewer
  const me = getMe();
  const tagOf = pid => {
    if (!me || !chartState.showRel) return null;
    if (pid === me) return { me: true, text: t('you') };
    const w = relWord(me, pid);
    return w && { text: w[0].toUpperCase() + w.slice(1) };
  };

  let links = '', cards = '';
  const hasParents = pid => !!person(pid)?.parents;
  for (const n of nodes) {
    // marriage lines
    const multi = n.spouses.length > 1;
    const col = si => multi && si >= 0 ? ` style="stroke:var(${SPOUSE_COLS[si % SPOUSE_COLS.length]})"` : '';
    n.spouses.forEach((s, si) => {
      const y = n.py + H / 2;
      links += `<line class="mline${s.sep ? ' sep' : ''}"${col(si)} x1="${n.px + W}" y1="${y}" x2="${s.x}" y2="${y}"/>`;
      // "no longer together": a double slash across the visible part of the line
      if (s.sep) { const mx = s.x - SG / 2 - (si === 0 ? 5 : 0); links += `<path class="sepmark" d="M${mx - 5},${y + 7}L${mx - 1},${y - 7}M${mx + 1},${y + 7}L${mx + 5},${y - 7}"/>`; }
    });
    // child connectors
    n.groups.forEach((g, gi) => {
      const fromSp = g.si > 0 || g.viaSp;
      const ox = g.si < 0 ? n.px + W / 2 : fromSp ? n.spouses[g.si].x + W / 2 : n.px + W + SG / 2;
      const oy = g.si === 0 && !fromSp ? n.py + H / 2 : n.py + H;
      const busY = n.py + H + VG / 2 - Math.min(gi, 3) * 6; // stagger so separate families don't merge
      const xs = g.kids.map(k => k.px + W / 2);
      links += `<path class="link"${col(g.si)} d="M${ox},${oy}V${busY}M${Math.min(ox, ...xs)},${busY}H${Math.max(ox, ...xs)}${xs.map(x => `M${x},${busY}V${n.py + H + VG}`).join('')}"/>`;
    });
    cards += card(n.pid, n.px, n.py, { depth: n.depth, dup: n.dup, bi, hl, tag: tagOf(n.pid), toggle: n.hasKids && !n.lock ? (n.collapsed ? '+' + n.kidCount : '−') : null });
    n.spouses.forEach(s => { cards += card(s.pid, s.x, s.y, { depth: n.depth, spouse: true, bi, hl, tag: tagOf(s.pid), badge: !ctx.mode && hasParents(s.pid) && !descendants(root).has(s.pid) }); });
  }
  scene.html(`<g class="links">${links}</g><g class="cards">${cards}</g>`);

  scene.selectAll('.node').on('click', function (e) {
    const pid = this.dataset.pid;
    if (e.target.closest('.tog')) {
      const set = ctx.collapsed;
      set.has(pid) ? set.delete(pid) : set.add(pid);
      const before = nodePos(pid);
      draw();
      keepPosition(pid, before);
      return;
    }
    if (e.target.closest('.badge')) { ctx.onRoot(founderFor(parentsOf(pid)?.father || parentsOf(pid)?.mother || pid), pid); return; }
    // tap someone: show their own family; tap the person already in focus: open their card
    if (ctx.mode?.focus === pid || !ctx.onBranch) ctx.onOpen(pid); else ctx.onBranch(pid);
  });
}

function card(pid, x, y, { depth, dup, spouse, bi, hl, toggle, badge, tag }) {
  const p = person(pid) || {};
  const name = displayName(p);
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  // first name on one row, surname on the row below
  const rows = (p.given && p.surname ? [p.given, p.surname] : [name]).map(r => cut(r, 14));
  const sub = cut([p.nickname ? `“${p.nickname}”` : '', lifeSpan(p)].filter(Boolean).join(' · '), 17);
  const ys = rows.length === 2 ? (sub ? [20, 34, 48] : [27, 41]) : (sub ? [27, 42] : [34]);
  const col = colourFor(pid, depth, spouse, bi);
  let tagSvg = '';
  if (tag) { // pill on the top edge, clear of the "↑" badge
    const maxW = badge ? W - 46 : W - 20, s = cut(tag.text, Math.floor((maxW - 12) / 5.5)), tw = Math.min(maxW, s.length * 5.5 + 12);
    tagSvg = `<g class="rtag${tag.me ? ' me' : ''}" transform="translate(10,-8)"><rect width="${tw}" height="15" rx="7.5"/><text x="${tw / 2}" y="10.8" text-anchor="middle">${esc(s)}</text></g>`;
  }
  const photo = p.photo
    ? `<circle class="phbg" cx="28" cy="30" r="19"/><image ${srcAttr(p.photo, 'href')} x="9" y="11" width="38" height="38" clip-path="url(#ph-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle class="phbg" cx="28" cy="30" r="19"/><text class="ini" x="28" y="34.5" text-anchor="middle">${esc(initials(p))}</text>`;
  return `<g class="node${dup ? ' dup' : ''}${hl === pid ? ' hl' : ''}" data-pid="${esc(pid)}" transform="translate(${x},${y})">
    <title>${esc(name)}${p.nickname ? ` (${esc(p.nickname)})` : ''}</title>
    <rect class="card" width="${W}" height="${H}" rx="12"/>
    <rect x="3" y="8" width="4" height="${H - 16}" rx="2.5" fill="${col}"/>
    ${photo}
    ${rows.map((r, i) => `<text class="nm" x="54" y="${ys[i]}">${esc(r)}</text>`).join('')}
    ${sub ? `<text class="sub" x="54" y="${ys[rows.length]}">${esc(sub)}</text>` : ''}
    ${toggle ? `<g class="tog" transform="translate(${W / 2},${H})"><circle r="${toggle.length > 1 ? 13 : 10}"/><text y="4" text-anchor="middle">${toggle}</text></g>` : ''}
    ${tagSvg}
    ${badge ? `<g class="badge" transform="translate(${W - 34},-9)"><title>${esc(t('showFamily'))}</title><rect width="28" height="18" rx="9"/><text x="14" y="13" text-anchor="middle">↑</text></g>` : ''}
  </g>`;
}

// ---------- navigation helpers ----------
function nodePos(pid) {
  for (const n of ctx.layout || []) {
    if (n.pid === pid) return { x: n.px, y: n.py };
    const s = n.spouses.find(s => s.pid === pid);
    if (s) return { x: s.x, y: s.y };
  }
  return null;
}
function keepPosition(pid, before) {
  const after = nodePos(pid);
  if (!before || !after) return;
  const tr = d3.zoomTransform(ctx.svg.node());
  ctx.svg.call(ctx.zoom.transform, tr.translate(before.x - after.x, before.y - after.y));
}

function viewport() { const r = ctx.svg.node().getBoundingClientRect(); return { w: r.width, h: r.height }; }
const extents = () => ({ maxX: Math.max(...ctx.layout.map(n => n.px + n.bw)), maxY: Math.max(...ctx.layout.map(n => n.py + n.bh)) });

function initialView() {
  const pos = nodePos(ctx.root) || { x: 0, y: 0 };
  const { w, h } = viewport();
  const k = 0.85;
  const tr = d3.zoomIdentity.translate(w / 2 - (pos.x + W / 2) * k, 90).scale(k);
  ctx.svg.call(ctx.zoom.transform, tr);
}

export function fit() {
  if (!ctx) return;
  const { maxX, maxY } = extents();
  const { w, h } = viewport();
  const k = Math.max(0.02, Math.min(1.2, (w - 40) / (maxX + 20), (h - 120) / (maxY + 20)));
  ctx.svg.transition().duration(400).call(ctx.zoom.transform, d3.zoomIdentity.translate((w - maxX * k) / 2, 70).scale(k));
}

// Show the whole (small) family if it fits at a readable size, else centre on the person.
function fitOrCenter(pid) {
  const { maxX, maxY } = extents();
  const { w, h } = viewport();
  let k = Math.min(1, (w - 40) / (maxX + 20), (h - 140) / (maxY + 20));
  ctx.highlight = pid;
  ctx.scene.selectAll('.node').classed('hl', function () { return this.dataset.pid === pid; });
  if (k >= 0.45) return ctx.svg.call(ctx.zoom.transform, d3.zoomIdentity.translate((w - maxX * k) / 2, 80).scale(k));
  // too big to read at once: frame the person and the top of their line
  const pos = nodePos(pid), xs = [pid, ...(ctx.mode?.next.keys() || [])].map(nodePos).filter(Boolean).map(p => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + W;
  k = Math.max(0.35, Math.min(0.8, (w - 32) / (x1 - x0), (h - 190) / (pos.y + H)));
  ctx.svg.call(ctx.zoom.transform, d3.zoomIdentity.translate(w / 2 - (x0 + x1) / 2 * k, 80).scale(k));
}

export function centerOn(pid, animate = true) {
  if (!ctx) return;
  const pos = nodePos(pid);
  if (!pos) return;
  ctx.highlight = pid;
  ctx.scene.selectAll('.node').classed('hl', function () { return this.dataset.pid === pid; }).classed('pulse', function () { return this.dataset.pid === pid; });
  const { w, h } = viewport();
  const k = Math.max(0.8, d3.zoomTransform(ctx.svg.node()).k);
  const tr = d3.zoomIdentity.translate(w / 2 - (pos.x + W / 2) * k, h / 2 - (pos.y + H / 2) * k).scale(k);
  (animate ? ctx.svg.transition().duration(600) : ctx.svg).call(ctx.zoom.transform, tr);
}

// Uncollapse every ancestor between root and pid.
function expandTo(root, pid, collapsed) {
  const d = descendants(root);
  let cur = d.has(pid) ? pid : spousesOf(pid).find(s => d.has(s));
  let guard = 0;
  while (cur && cur !== root && guard++ < 60) {
    const pp = parentsOf(cur);
    const par = [pp?.father, pp?.mother].find(x => x && d.has(x));
    if (!par) break;
    collapsed.delete(par);
    cur = par;
  }
}

// Start with only the first few generations open; bigger lines start more folded.
function defaultCollapse(root, set, depth) {
  if (depth == null) depth = descendants(root).size > 60 ? 3 : 6;
  const walk = (pid, dpt, seen) => {
    if (seen.has(pid)) return; seen.add(pid);
    const kids = unionsOf(pid).flatMap(u => kidsOf(u.id));
    if (!kids.length) return;
    if (dpt >= depth) { set.add(pid); return; }
    kids.forEach(k => walk(k, dpt + 1, seen));
  };
  walk(root, 0, new Set());
}

// ---------- PNG export ----------
export async function exportPng() {
  if (!ctx) return;
  toast('…');
  const nodes = ctx.layout;
  const pad = 30;
  const ext = extents(), maxX = ext.maxX + pad * 2, maxY = ext.maxY + pad * 2 + 40;
  const cs = getComputedStyle(document.documentElement);
  const vars = VARS.map(v => `${v}:${cs.getPropertyValue(v).trim()}`).join(';');
  const clone = ctx.scene.node().cloneNode(true);
  clone.setAttribute('transform', `translate(${pad},${pad + 40})`);
  clone.querySelectorAll('.pulse,.hl').forEach(n => n.classList.remove('pulse', 'hl'));
  // inline photos
  const imgs = [...clone.querySelectorAll('image')];
  await Promise.all(imgs.map(async im => {
    try {
      const blob = await (await fetch(im.getAttribute('href'))).blob();
      im.setAttribute('href', await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }));
    } catch (e) { im.remove(); }
  }));
  const title = `${store.tree.meta?.title || ''} — ${t('lineOf', { name: displayName(person(ctx.root)) })}`;
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}" style="${vars}">
    <style>${CHART_CSS}</style><defs>${CLIP}</defs>
    <rect width="100%" height="100%" fill="${cs.getPropertyValue('--bg').trim()}"/>
    <text x="${pad}" y="${pad + 8}" style="font:650 22px Fraunces,Georgia,serif;fill:${cs.getPropertyValue('--text').trim()}">${esc(title)}</text>
    ${new XMLSerializer().serializeToString(clone)}</svg>`;
  const scale = Math.min(2, 16000 / maxX, 16000 / maxY, Math.sqrt(2.4e8 / (maxX * maxY)));
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(maxX * scale); canvas.height = Math.round(maxY * scale);
  const c2 = canvas.getContext('2d');
  c2.scale(scale, scale);
  c2.drawImage(img, 0, 0);
  canvas.toBlob(b => download(`family-tree-${displayName(person(ctx.root)).replace(/\W+/g, '-')}.png`, b), 'image/png');
}
