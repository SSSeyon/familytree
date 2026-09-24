// Full descendant chart with pan/zoom, collapsible branches and branch colours.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { store, person, unionsOf, kidsOf, spouseIn, displayName, lifeSpan, initials, founders, mainFounder, founderFor, descendants, parentsOf, spousesOf } from './data.js';
import { t } from './i18n.js';
import { esc, icon, html, $, download, toast } from './ui.js';

const W = 168, H = 64, SG = 12, HG = 22, VG = 70;
const PALETTE = ['--b1', '--b2', '--b3', '--b4', '--b5', '--b6', '--b7', '--b8'];
const GENS = ['--g0', '--g1', '--g2', '--g3', '--g4', '--g5'];

const CHART_CSS = `
.card{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.node{cursor:pointer}
.node:hover .card{stroke:var(--text-2)}
.node.hl .card{stroke:var(--accent);stroke-width:3}
.node.dup .card{stroke-dasharray:5 4;fill:var(--surface-2)}
.nm{font:600 13px Inter,system-ui,sans-serif;fill:var(--text)}
.sub{font:400 11px Inter,system-ui,sans-serif;fill:var(--text-2)}
.ini{font:600 14px Inter,system-ui,sans-serif;fill:var(--text-3)}
.phbg{fill:var(--surface-3)}
.link{fill:none;stroke:var(--line-strong);stroke-width:1.5}
.mline{stroke:var(--line-strong);stroke-width:2}
.tog{cursor:pointer}
.tog circle{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.tog text{font:600 11px Inter,system-ui,sans-serif;fill:var(--text-2)}
.tog:hover circle{fill:var(--surface-2)}
.badge{cursor:pointer}
.badge rect{fill:var(--surface-2);stroke:var(--line-strong)}
.badge text{font:600 10px Inter,system-ui,sans-serif;fill:var(--text-2)}
@keyframes ftpulse{0%,100%{stroke-width:3}50%{stroke-width:7}}
.node.pulse .card{animation:ftpulse .7s ease-in-out 3}
`;
const VARS = ['--surface', '--surface-2', '--surface-3', '--line-strong', '--text', '--text-2', '--text-3', '--accent', '--bg', ...PALETTE, '--b-other', ...GENS];

export const chartState = {
  root: null,
  colourBy: 'branch',
  orient: 'tb',        // tb = top-down, lr = sideways
  collapsed: new Map(),   // root -> Set of collapsed person ids
  transforms: new Map(),  // root -> d3 zoom transform
};
try { chartState.colourBy = localStorage.getItem('ft.colour') || 'branch'; chartState.orient = localStorage.getItem('ft.orient') || (innerWidth < 760 ? 'lr' : 'tb'); } catch (e) {}

let ctx = null; // live render context

export function renderChart(view, { root, focusId, onOpen, onRoot }) {
  const P = store.P;
  root = root && P[root] ? root : chartState.root && P[chartState.root] ? chartState.root : mainFounder();
  if (focusId && !descendants(root).has(focusId) && !spousesOf(focusId).some(s => descendants(root).has(s))) root = founderFor(focusId);
  chartState.root = root;
  const fresh = !chartState.collapsed.has(root);
  if (fresh) chartState.collapsed.set(root, new Set());
  const collapsed = chartState.collapsed.get(root);
  if (fresh) defaultCollapse(root, collapsed);
  if (focusId) expandTo(root, focusId, collapsed);

  const fs = founders();
  view.innerHTML = '';
  const wrap = html(`<div class="chart-wrap">
    <div class="chart-toolbar">
      <div class="tool-group"><label class="sr-only" for="root-sel">${t('family')}</label>
        <select id="root-sel">${fs.map(f => `<option value="${f.id}" ${f.id === root ? 'selected' : ''}>${esc(t('lineOf', { name: displayName(P[f.id]) }))} · ${f.size}</option>`).join('')}
        ${fs.some(f => f.id === root) ? '' : `<option value="${root}" selected>${esc(t('lineOf', { name: displayName(P[root]) }))}</option>`}</select></div>
      <div class="tool-group"><label class="sr-only" for="colour-sel">${t('colourBy')}</label>
        <select id="colour-sel">${['branch', 'gen', 'sex', 'none'].map(c => `<option value="${c}" ${c === chartState.colourBy ? 'selected' : ''}>${t({ branch: 'cBranch', gen: 'cGen', sex: 'cSex', none: 'cNone' }[c])}</option>`).join('')}</select></div>
      <div class="tool-group">
        <button class="icon-btn" data-act="orient" title="${t('orient')}" aria-label="${t('orient')}">${icon(chartState.orient === 'lr' ? 'tree' : 'sideways')}</button>
        <button class="icon-btn" data-act="expand" title="${t('expandAll')}" aria-label="${t('expandAll')}">${icon('expand')}</button>
        <button class="icon-btn" data-act="collapse" title="${t('collapseAll')}" aria-label="${t('collapseAll')}">${icon('collapse')}</button>
        <button class="icon-btn" data-act="png" title="${t('exportPng')}" aria-label="${t('exportPng')}">${icon('download')}</button>
      </div>
    </div>
    <svg class="chart-svg" role="img" aria-label="${esc(t('tabChart'))}"><style>${CHART_CSS}</style>
      <defs><clipPath id="ph-clip" clipPathUnits="userSpaceOnUse"><circle cx="34" cy="32" r="22"/></clipPath></defs>
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
    chartState.transforms.set(root, e.transform);
  });
  svg.call(zoom).on('dblclick.zoom', null);

  ctx = { wrap, svg, scene, zoom, root, collapsed, onOpen, onRoot, layout: null };
  draw();

  const saved = chartState.transforms.get(root);
  if (focusId) centerOn(focusId, false);
  else if (saved) svg.call(zoom.transform, saved);
  else initialView();

  $('#root-sel', wrap).onchange = e => onRoot(e.target.value);
  $('#colour-sel', wrap).onchange = e => { chartState.colourBy = e.target.value; try { localStorage.setItem('ft.colour', e.target.value); } catch (er) {} draw(); };
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'in') svg.transition().duration(250).call(zoom.scaleBy, 1.4);
    if (act === 'out') svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4);
    if (act === 'fit') fit();
    if (act === 'expand') { collapsed.clear(); draw(); fit(); }
    if (act === 'collapse') { collapsed.clear(); defaultCollapse(ctx.root, collapsed, 2); draw(); initialView(); }
    if (act === 'png') exportPng();
    if (act === 'orient') {
      chartState.orient = chartState.orient === 'lr' ? 'tb' : 'lr';
      try { localStorage.setItem('ft.orient', chartState.orient); } catch (er) {}
      chartState.transforms.clear();
      b.innerHTML = icon(chartState.orient === 'lr' ? 'tree' : 'sideways');
      draw(); initialView();
    }
  });
}

// ---------- layout (contour packing: subtrees slide together as far as their outlines allow) ----------
// "b" = breadth axis (x when top-down, y when sideways); depth is the other axis.
const dims = () => chartState.orient === 'lr'
  ? { B: H, SGB: 10, GAP: 14, STEP: W + 64 }
  : { B: W, SGB: SG, GAP: HG, STEP: H + VG };

function build(pid, depth, seen, collapsed) {
  const dup = seen.has(pid);
  seen.add(pid);
  const unions = dup ? [] : unionsOf(pid);
  const node = { pid, depth, dup, spouses: [], groups: [], hasKids: false, collapsed: collapsed.has(pid) };
  for (const u of unions) {
    const sp = spouseIn(u, pid);
    const si = sp ? node.spouses.push({ pid: sp, uid: u.id }) - 1 : -1;
    const kids = kidsOf(u.id);
    if (kids.length) node.hasKids = true;
    if (kids.length && !node.collapsed) node.groups.push({ uid: u.id, si, kids: kids.map(k => build(k, depth + 1, seen, collapsed)) });
  }
  node.kidCount = unions.reduce((n, u) => n + kidsOf(u.id).length, 0);
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
  const lr = chartState.orient === 'lr';
  node.px = lr ? d : b; node.py = lr ? b : d;
  node.spouses.forEach((s, i) => { const sb = b + (i + 1) * (B + SGB); s.x = lr ? d : sb; s.y = lr ? sb : d; });
  node.bw = lr ? W : node.blockB; node.bh = lr ? node.blockB : H;
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

function drawLegend(bi, maxDepth) {
  const el = $('#legend', ctx.wrap);
  const by = chartState.colourBy;
  let items = [];
  if (by === 'branch') {
    items = bi.heads.slice(0, PALETTE.length).map((h, i) => [`var(${PALETTE[i]})`, displayName(person(h))]);
    if (bi.heads.length > PALETTE.length) items.push(['var(--b-other)', t('other')]);
    items.push(['var(--b-other)', t('inLaw')]);
  } else if (by === 'sex') items = [['var(--b1)', t('male')], ['var(--b2)', t('female')], ['var(--b-other)', t('unknownSex')]];
  else if (by === 'gen') items = GENS.slice(0, Math.min(maxDepth + 1, GENS.length)).map((g, i) => [`var(${g})`, t('generation', { n: i + 1 }) + (i === GENS.length - 1 ? '+' : '')]);
  el.hidden = !items.length;
  el.innerHTML = `<strong>${by === 'branch' ? t('branches') : t('colourBy')}</strong><ul>${items.map(([c, l]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('')}</ul>`;
}

// ---------- drawing ----------
function draw() {
  const { scene, root } = ctx;
  const { nodes } = flatten(root);
  ctx.layout = nodes;
  const bi = branchInfo(root);
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  drawLegend(bi, maxDepth);
  const hl = ctx.highlight;

  let links = '', cards = '';
  const hasParents = pid => !!person(pid)?.parents;
  const lr = chartState.orient === 'lr';
  for (const n of nodes) {
    // marriage lines
    n.spouses.forEach(s => {
      links += lr
        ? `<line class="mline" x1="${n.px + 26}" y1="${n.py + H}" x2="${s.x + 26}" y2="${s.y}"/>`
        : `<line class="mline" x1="${n.px + W}" y1="${n.py + H / 2}" x2="${s.x}" y2="${s.y + H / 2}"/>`;
    });
    // child connectors
    for (const g of n.groups) {
      if (lr) {
        const oy = g.si < 0 ? n.py + H / 2 : g.si === 0 ? n.py + H + 5 : n.spouses[g.si].y + H / 2;
        const ox = g.si > 0 ? n.spouses[g.si].x + W : n.px + W;
        const busX = n.px + W + 32;
        const ys = g.kids.map(k => k.py + H / 2);
        links += `<path class="link" d="M${ox},${oy}H${busX}M${busX},${Math.min(oy, ...ys)}V${Math.max(oy, ...ys)}${ys.map(y => `M${busX},${y}H${busX + 32}`).join('')}"/>`;
      } else {
        const ox = g.si < 0 ? n.px + W / 2 : g.si === 0 ? n.px + W + SG / 2 : n.spouses[g.si].x + W / 2;
        const oy = g.si === 0 ? n.py + H / 2 : n.py + H;
        const busY = n.py + H + VG / 2;
        const xs = g.kids.map(k => k.px + W / 2);
        links += `<path class="link" d="M${ox},${oy}V${busY}M${Math.min(ox, ...xs)},${busY}H${Math.max(ox, ...xs)}${xs.map(x => `M${x},${busY}V${busY + VG / 2}`).join('')}"/>`;
      }
    }
    cards += card(n.pid, n.px, n.py, { depth: n.depth, dup: n.dup, bi, hl, lr, toggle: n.hasKids ? (n.collapsed ? '+' + n.kidCount : '−') : null });
    n.spouses.forEach(s => { cards += card(s.pid, s.x, s.y, { depth: n.depth, spouse: true, bi, hl, badge: hasParents(s.pid) && !descendants(root).has(s.pid) }); });
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
    ctx.onOpen(pid);
  });
}

function card(pid, x, y, { depth, dup, spouse, bi, hl, lr, toggle, badge }) {
  const p = person(pid) || {};
  const name = displayName(p);
  const nm = name.length > 17 ? name.slice(0, 16) + '…' : name;
  const sub = [p.nickname ? `“${p.nickname}”` : '', lifeSpan(p)].filter(Boolean).join(' · ');
  const subT = sub.length > 24 ? sub.slice(0, 23) + '…' : sub;
  const col = colourFor(pid, depth, spouse, bi);
  const photo = p.photo
    ? `<circle class="phbg" cx="34" cy="32" r="22"/><image href="${esc(p.photo)}" x="12" y="10" width="44" height="44" clip-path="url(#ph-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle class="phbg" cx="34" cy="32" r="22"/><text class="ini" x="34" y="37" text-anchor="middle">${esc(initials(p))}</text>`;
  return `<g class="node${dup ? ' dup' : ''}${hl === pid ? ' hl' : ''}" data-pid="${esc(pid)}" transform="translate(${x},${y})">
    <title>${esc(name)}${p.nickname ? ` (${esc(p.nickname)})` : ''}</title>
    <rect class="card" width="${W}" height="${H}" rx="12"/>
    <rect x="3" y="9" width="5" height="${H - 18}" rx="2.5" fill="${col}"/>
    ${photo}
    <text class="nm" x="64" y="${sub ? 28 : 37}">${esc(nm)}</text>
    ${sub ? `<text class="sub" x="64" y="45">${esc(subT)}</text>` : ''}
    ${toggle ? `<g class="tog" transform="translate(${lr ? W : W / 2},${lr ? H / 2 : H})"><circle r="${toggle.length > 1 ? 13 : 10}"/><text y="4" text-anchor="middle">${toggle}</text></g>` : ''}
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
  const tr = chartState.orient === 'lr'
    ? d3.zoomIdentity.translate(24, h / 2 - (pos.y + H / 2) * k).scale(k)
    : d3.zoomIdentity.translate(w / 2 - (pos.x + W / 2) * k, 90).scale(k);
  ctx.svg.call(ctx.zoom.transform, tr);
}

export function fit() {
  if (!ctx) return;
  const { maxX, maxY } = extents();
  const { w, h } = viewport();
  const k = Math.max(0.02, Math.min(1.2, (w - 40) / (maxX + 20), (h - 120) / (maxY + 20)));
  ctx.svg.transition().duration(400).call(ctx.zoom.transform, d3.zoomIdentity.translate((w - maxX * k) / 2, 70).scale(k));
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
    <style>${CHART_CSS}</style><defs><clipPath id="ph-clip" clipPathUnits="userSpaceOnUse"><circle cx="34" cy="32" r="22"/></clipPath></defs>
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
