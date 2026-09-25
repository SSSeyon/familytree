// Fan chart: a person in the middle and their forebears in rings around them.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { person, parentsOf, displayName, lifeSpan, initials } from './data.js';
import { t } from './i18n.js';
import { esc, icon, html, $, srcAttr } from './ui.js';

const R0 = 64;                                  // centre
const RING = [0, 64, 64, 86, 86, 80, 74];       // ring width per generation
const MAXG = RING.length - 1;
// one colour per grandparent's line: father's side blue/green, mother's side orange/pink
const QUAD = ['--b1', '--b3', '--b2', '--b5'];

const FAN_CSS = `
.seg{stroke:var(--bg);stroke-width:2;cursor:pointer}
.seg:hover{stroke:var(--accent)}
.seg.empty{fill:var(--surface-2);stroke:var(--line);stroke-dasharray:3 3;cursor:default}
.seg.empty:hover{stroke:var(--line)}
.ft{font-family:Inter,system-ui,sans-serif;fill:var(--text);pointer-events:none}
.ft .n{font-weight:600}.ft .s{fill:var(--text-2);font-weight:400}
.ft.q{fill:var(--text-3);font-weight:600}
.ctr{cursor:pointer}.ctr .bg{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2}
.ctr .ini{font:600 18px Inter,system-ui,sans-serif;fill:var(--text-2)}
`;

const inner = g => R0 + RING.slice(1, g).reduce((a, b) => a + b, 0);
const outer = g => inner(g) + RING[g];

// slots[g][i]: person id or null. Father of slot i is at 2i, mother at 2i+1.
function pedigree(pid) {
  const slots = [[pid]];
  for (let g = 1; g <= MAXG; g++) {
    slots[g] = slots[g - 1].flatMap(c => { const pp = c && parentsOf(c); return [pp?.father || null, pp?.mother || null]; });
    if (!slots[g].some(Boolean)) { slots.length = g; break; }
  }
  return slots;
}

export function renderFan(view, pid, { onOpen, onBranch }) {
  const p = person(pid);
  const slots = pedigree(pid);
  const gens = Math.max(2, slots.length - 1);
  while (slots.length <= gens) slots.push(slots[slots.length - 1].flatMap(() => [null, null]));
  const R = outer(gens);

  view.innerHTML = '';
  const wrap = html(`<div class="chart-wrap fan-wrap">
    <div class="chart-toolbar">
      <div class="tool-group fan-title"><strong>${esc(displayName(p))}</strong></div>
      <div class="tool-group"><button class="btn sm" data-act="tree">${icon('tree')}${t('viewInTree')}</button><button class="btn sm" data-act="details">${icon('info')}${t('details')}</button></div>
    </div>
    <svg class="chart-svg" role="img" aria-label="${esc(t('fanChart') + ': ' + displayName(p))}"><style>${FAN_CSS}</style><g class="scene"></g></svg>
    <div class="legend"><div class="small muted">${t('fanHint')}</div><ul></ul></div>
    <div class="zoom-ctl tool-group">
      <button class="icon-btn" data-act="in" aria-label="${t('zoomIn')}" title="${t('zoomIn')}">${icon('plus')}</button>
      <button class="icon-btn" data-act="out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">${icon('minus')}</button>
      <button class="icon-btn" data-act="fit" aria-label="${t('fit')}" title="${t('fit')}">${icon('fit')}</button>
    </div>
  </div>`);
  view.append(wrap);

  const svg = d3.select(wrap).select('svg.chart-svg');
  const scene = svg.select('.scene');
  const { width: w, height: h } = svg.node().getBoundingClientRect();
  // tall screens (phones): open the fan to the right, so it can use the height
  const tall = h > w * 1.15;
  const A0 = tall ? Math.PI / 2 : Math.PI;       // start angle; father's side comes first
  const pt = (r, a) => `${(r * Math.cos(a)).toFixed(1)},${(-r * Math.sin(a)).toFixed(1)}`;
  const deg = a => a * 180 / Math.PI;
  const upright = r => (r > 90 ? r - 180 : r <= -90 ? r + 180 : r);   // keep text readable

  let out = '';
  for (let g = 1; g <= gens; g++) {
    const n = 2 ** g, span = Math.PI / n, r1 = inner(g), r2 = outer(g), rm = (r1 + r2) / 2;
    slots[g].forEach((id, i) => {
      const a1 = A0 - i * span, a2 = a1 - span, am = a1 - span / 2;
      const d = `M${pt(r2, a1)}A${r2},${r2} 0 0 1 ${pt(r2, a2)}L${pt(r1, a2)}A${r1},${r1} 0 0 0 ${pt(r1, a1)}Z`;
      const [x, y] = pt(rm, am).split(',');
      // tangential text in the wide inner rings, along the radius further out
      const radial = g >= 3;
      const rot = upright(radial ? -deg(am) : 90 - deg(am));
      if (!id) {
        out += `<path class="seg empty" d="${d}"/>`;
        if (g <= 4) out += `<text class="ft q" transform="translate(${x},${y}) rotate(${rot.toFixed(1)})" text-anchor="middle" dy="4" font-size="12">?</text>`;
        return;
      }
      const q = g === 1 ? i * 2 : i >> (g - 2);
      const fill = `color-mix(in srgb, var(${QUAD[q]}) ${Math.max(14, 44 - g * 5)}%, var(--surface))`;
      const q2 = person(id) || {};
      const room = radial ? RING[g] - 10 : rm * span - 12;           // along the text
      const across = radial ? r1 * span - 4 : RING[g] - 8;          // lines that fit
      const fs = g <= 2 ? 11.5 : g <= 4 ? 10.5 : g === 5 ? 9.5 : 8.5;
      const cut = s => { const m = Math.floor(room / (fs * 0.56)); return s.length > m ? s.slice(0, Math.max(1, m - 1)) + '…' : s; };
      let lines = (q2.given && q2.surname ? [q2.given, q2.surname] : [displayName(q2)]).map(s => ['n', cut(s)]);
      if (lifeSpan(q2)) lines.push(['s', cut(lifeSpan(q2))]);
      lines = lines.slice(0, Math.max(1, Math.floor(across / (fs + 2))));
      const lh = fs + 2, top = -((lines.length - 1) * lh) / 2 + fs * 0.35;
      out += `<path class="seg" data-pid="${esc(id)}" d="${d}" fill="${fill}"><title>${esc(displayName(q2))}${lifeSpan(q2) ? ' · ' + esc(lifeSpan(q2)) : ''}</title></path>
        <text class="ft" font-size="${fs}" transform="translate(${x},${y}) rotate(${rot.toFixed(1)})" text-anchor="middle">${lines.map(([c, s], k) => `<tspan class="${c}" x="0" y="${(top + k * lh).toFixed(1)}">${esc(s)}</tspan>`).join('')}</text>`;
    });
  }
  // centre: half disc with the person's photo
  const cx = 36 * Math.cos(A0 - Math.PI / 2), cy = -36 * Math.sin(A0 - Math.PI / 2);
  out += `<g class="ctr" data-center><title>${esc(displayName(p))}</title>
    <path class="bg" d="M${pt(R0, A0)}A${R0},${R0} 0 0 1 ${pt(R0, A0 - Math.PI)}Z"/>
    <clipPath id="fan-clip"><circle cx="${cx}" cy="${cy}" r="25"/></clipPath>
    ${p.photo ? `<image ${srcAttr(p.photo, 'href')} x="${cx - 25}" y="${cy - 25}" width="50" height="50" clip-path="url(#fan-clip)" preserveAspectRatio="xMidYMid slice"/>`
              : `<text class="ini" x="${cx}" y="${cy + 6}" text-anchor="middle">${esc(initials(p))}</text>`}
  </g>`;
  scene.html(out);

  // legend: the four grandparents' lines
  const gp = slots[2];
  $('.legend ul', wrap).innerHTML = gp.map((id, i) => id ? `<li><i style="background:var(${QUAD[i]})"></i>${esc(t('lineOf', { name: displayName(person(id)) }))}</li>` : '').join('');

  const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', e => scene.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);
  const fit = (animate) => {
    const top = 64, bottom = 70, pad = 12;
    const bw = tall ? R : 2 * R, bh = tall ? 2 * R : R;
    const k = Math.min(2, (w - pad * 2) / bw, (h - top - bottom) / bh);
    const tx = tall ? pad + (w - pad * 2 - R * k) / 2 : w / 2;
    const ty = tall ? top + (h - top - bottom) / 2 : top + (h - top - bottom + R * k) / 2;
    (animate ? svg.transition().duration(350) : svg).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  };
  fit(false);

  scene.on('click', e => {
    if (e.target.closest('[data-center]')) return onOpen(pid);
    const id = e.target.closest('[data-pid]')?.dataset.pid;
    if (id) location.hash = `#/fan/${id}`;
  });
  wrap.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'in') svg.transition().duration(250).call(zoom.scaleBy, 1.4);
    if (act === 'out') svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4);
    if (act === 'fit') fit(true);
    if (act === 'tree') onBranch(pid);
    if (act === 'details') onOpen(pid);
  });
}
