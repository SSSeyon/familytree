// Relationship calculator: "B is A's second cousin once removed".
import { store, ancestorDepths, parentsOf, unionsOf, spouseIn, spousesOf, parentIds, childrenOf } from './data.js';
import { t, lang } from './i18n.js';

// Closest common ancestor between a and b → {up, down} generations.
function blood(a, b) {
  const A = ancestorDepths(a), B = ancestorDepths(b);
  let best = null;
  for (const [id, up] of A) {
    const down = B.get(id);
    if (down === undefined) continue;
    if (!best || up + down < best.up + best.down) best = { up, down, via: id };
  }
  if (!best) return null;
  if (best.up === 1 && best.down === 1) {
    best.half = parentsOf(a)?.union.id !== parentsOf(b)?.union.id;
  }
  return best;
}

// Returns a structured relation of B to A, or null.
export function relation(a, b) {
  if (!a || !b) return null;
  if (a === b) return { k: 'self' };
  if (spousesOf(a).includes(b)) return { k: 'spouse', former: unionsOf(a).filter(u => spouseIn(u, a) === b).every(u => u.separated) };
  const r = blood(a, b);
  if (r) return { k: 'blood', ...r };
  // step / in-law via A's spouse (link = that spouse, used to draw the path)
  for (const s of spousesOf(a)) {
    const r2 = blood(s, b);
    if (!r2) continue;
    const via = { link: s, side: 'a', inner: { k: 'blood', ...r2 } };
    if (r2.up === 0 && r2.down === 1) return { k: 'stepchild', ...via };
    if (r2.down === 0) return { k: 'parentInLaw', gen: r2.up, ...via };
    if (r2.up === 1 && r2.down === 1) return { k: 'siblingInLaw', ...via };
    return { k: 'viaSpouse', spouse: s, ...via };
  }
  // in-law via B's spouse
  for (const s of spousesOf(b)) {
    const r2 = blood(a, s);
    if (!r2) continue;
    const via = { link: s, side: 'b', inner: { k: 'blood', ...r2 } };
    if (r2.up === 0) return { k: 'childInLaw', gen: r2.down, ...via };
    if (r2.up === 1 && r2.down === 0) return { k: 'stepparent', ...via };
    if (r2.up === 1 && r2.down === 1) return { k: 'siblingInLaw', ...via };
    return { k: 'spouseOfRel', spouse: s, ...via };
  }
  return shortestPath(a, b) ? { k: 'distant' } : null;
}

// Shortest chain of people through parent/child/spouse links.
export function shortestPath(a, b) {
  const prev = new Map([[a, null]]);
  const q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    const edges = [
      ...parentIds(cur).map(id => [id, 'eParent']),
      ...childrenOf(cur).map(id => [id, 'eChild']),
      ...spousesOf(cur).map(id => [id, 'eSpouse']),
    ];
    for (const [id, edge] of edges) if (!prev.has(id)) { prev.set(id, { from: cur, edge }); q.push(id); }
  }
  if (!prev.has(b)) return null;
  const steps = [];
  for (let cur = b; cur !== a; cur = prev.get(cur).from) steps.unshift({ id: cur, edge: prev.get(cur).edge });
  return [{ id: a }, ...steps];
}

// The chain of people that explains relation(a, b): up to the common ancestor and back
// down, plus the marriage for in-laws. Falls back to the shortest chain.
export function relationPath(a, b) {
  const r = relation(a, b);
  if (r?.k === 'blood') return bloodPath(a, b, r.via);
  if (r?.link) {
    const inner = r.side === 'a' ? bloodPath(r.link, b, r.inner.via) : bloodPath(a, r.link, r.inner.via);
    if (inner) return r.side === 'a'
      ? [{ id: a }, { id: r.link, edge: 'eSpouse' }, ...inner.slice(1)]
      : [...inner, { id: b, edge: 'eSpouse' }];
  }
  return shortestPath(a, b);
}
function bloodPath(a, b, via) {
  const up = chainUp(a, via), down = chainUp(b, via);
  if (!up || !down) return null;
  return [{ id: a }, ...up.slice(1).map(id => ({ id, edge: 'eParent' })), ...down.reverse().slice(1).map(id => ({ id, edge: 'eChild' }))];
}
// [from, parent, grandparent, …, ancestor] along the shortest line of parents.
function chainUp(from, ancestor) {
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === ancestor) break;
    for (const p of parentIds(cur)) if (!prev.has(p)) { prev.set(p, cur); q.push(p); }
  }
  if (!prev.has(ancestor)) return null;
  const out = [];
  for (let c = ancestor; c != null; c = prev.get(c)) out.unshift(c);
  return out;
}

// ---------- wording ----------
const g = (sex, m, f, n) => (sex === 'M' ? m : sex === 'F' ? f : n);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times'];
const greats = n => (n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : `${n}× great-`);

function enBlood(r, sex) {
  const { up, down } = r;
  if (up === 0) {
    const base = g(sex, 'son', 'daughter', 'child');
    return down === 1 ? base : greats(down - 2) + 'grand' + base;
  }
  if (down === 0) {
    const base = g(sex, 'father', 'mother', 'parent');
    return up === 1 ? base : greats(up - 2) + 'grand' + base;
  }
  if (up === 1 && down === 1) return g(sex, 'brother', 'sister', 'sibling');
  if (up === 1) return greats(down - 3) + (down >= 3 ? 'grand-' : '') + g(sex, 'nephew', 'niece', 'nibling');
  if (down === 1) return greats(up - 2) + g(sex, 'uncle', 'aunt', 'aunt/uncle');
  const deg = Math.min(up, down) - 1, rem = Math.abs(up - down);
  return `${ORD[deg] || deg + 'th'} cousin${rem ? ' ' + (TIMES[rem] || rem + ' times') + ' removed' : ''}`;
}

function enRel(rel, sexB, spouseName) {
  switch (rel.k) {
    case 'self': return null;
    case 'spouse': return (rel.former ? 'former ' : '') + g(sexB, 'husband', 'wife', 'spouse');
    case 'blood': return enBlood(rel, sexB);
    case 'stepchild': return g(sexB, 'stepson', 'stepdaughter', 'stepchild');
    case 'stepparent': return g(sexB, 'stepfather', 'stepmother', 'step-parent');
    case 'parentInLaw': return (rel.gen > 1 ? greats(rel.gen - 2) + 'grand' : '') + g(sexB, 'father', 'mother', 'parent') + '-in-law';
    case 'childInLaw': return (rel.gen > 1 ? greats(rel.gen - 2) + 'grand' : '') + g(sexB, 'son', 'daughter', 'child') + '-in-law';
    case 'siblingInLaw': return g(sexB, 'brother', 'sister', 'sibling') + '-in-law';
    case 'viaSpouse': return `${spouseName}’s ${enBlood(rel.inner, sexB)}`;
    case 'spouseOfRel': { const w = enBlood(rel.inner, store.P[rel.spouse]?.sex); return `${g(sexB, 'husband', 'wife', 'spouse')} of ${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`; }
    case 'distant': return 'relative by marriage';
  }
  return null;
}

// Yoruba: kinship is mostly by age (ẹ̀gbọ́n/àbúrò) and generation, not gender.
function yoRel(rel, sexB, a, b) {
  if (rel.k === 'spouse') return g(sexB, 'ọkọ', 'ìyàwó', 'ẹnìkejì') + (rel.former ? ' àtijọ́' : '');
  if (rel.k === 'blood') {
    const { up, down } = rel;
    if (up === 0) return down === 1 ? g(sexB, 'ọmọkùnrin', 'ọmọbìnrin', 'ọmọ') : down === 2 ? 'ọmọ-ọmọ' : `ọmọ-ọmọ (ìran ${down})`;
    if (down === 0) return up === 1 ? g(sexB, 'bàbá', 'ìyá', 'òbí') : up === 2 ? g(sexB, 'bàbá àgbà', 'ìyá àgbà', 'òbí àgbà') : g(sexB, 'baba-ńlá', 'ìyá-ńlá', 'òbí-ńlá') + ` (ìran ${up})`;
    if (up === 1 && down === 1) {
      const older = olderThan(b, a);
      const base = older === true ? 'ẹ̀gbọ́n' : older === false ? 'àbúrò' : g(sexB, 'arákùnrin', 'arábìnrin', 'ọmọ ìyá');
      return base;
    }
    if (up === 1) return 'ọmọ ẹ̀gbọ́n/àbúrò' + (down > 2 ? ` (ìran ${down - 1})` : '');
    if (down === 1) return g(sexB, 'bàbá', 'ìyá', 'òbí') + ' (ẹ̀gbọ́n/àbúrò òbí)' + (up > 2 ? ` — ìran ${up - 1}` : '');
    return `ẹbí (${enBlood(rel, sexB)})`;
  }
  if (rel.k === 'parentInLaw' || rel.k === 'childInLaw' || rel.k === 'siblingInLaw') return `àna (${enRel(rel, sexB)})`;
  if (rel.k === 'stepchild') return 'ọmọ ọkọ/ìyàwó';
  if (rel.k === 'stepparent') return g(sexB, 'ọkọ ìyá', 'ìyàwó bàbá', 'ẹnìkejì òbí');
  return `ẹbí (${enRel(rel, sexB, store.P[rel.spouse]?.given || '')})`;
}

function olderThan(x, y) {
  const px = store.P[x], py = store.P[y];
  if (px.birth?.y && py.birth?.y && px.birth.y !== py.birth.y) return px.birth.y < py.birth.y;
  if (px.parents && px.parents === py.parents && px.order != null && py.order != null && px.order !== py.order) return px.order < py.order;
  return null;
}

// Gungbe (Yoruba letters, DRAFT): Baba, Iya, Ovi, Tọgbo/Nọgbo, Medaho (older) / Novi (younger).
function gunRel(rel, sexB, a, b) {
  if (rel.k === 'spouse') return g(sexB, 'asu', 'asi', 'alọwlemẹ');
  if (rel.k === 'blood') {
    const { up, down } = rel;
    if (up === 0) return down === 1 ? g(sexB, 'ovisunnu', 'ovinyọnu', 'ovi') : down === 2 ? 'ovi ovi' : `ovi ovi (whẹndo ${down})`;
    if (down === 0) return up === 1 ? g(sexB, 'baba', 'iya', 'mẹjitọ') : g(sexB, 'tọgbo', 'nọgbo', 'mẹjitọ mẹho') + (up > 2 ? ` (whẹndo ${up})` : '');
    if (up === 1 && down === 1) { const older = olderThan(b, a); return older === true ? 'medaho' : older === false ? 'novi' : 'nọvi'; }
  }
  return `hẹnnumẹ (${enRel(rel, sexB, store.P[rel.spouse]?.given || '')})`;
}

// Relationship word(s) only, e.g. "grandson".
export function relWord(a, b) {
  const rel = relation(a, b);
  if (!rel || rel.k === 'self') return null;
  const sexB = store.P[b]?.sex;
  return lang() === 'yo' ? yoRel(rel, sexB, a, b) : lang() === 'gun' ? gunRel(rel, sexB, a, b) : enRel(rel, sexB, store.P[rel.spouse]?.given || 'spouse');
}

// Full sentence: "Seyon is Miwawiwe's son".
export function relSentence(a, b, name) {
  if (a === b) return t('sameName');
  const rel = relation(a, b);
  if (rel?.k === 'spouseOfRel' && lang() === 'en') {
    return `${name(b)} is the ${g(store.P[b]?.sex, 'husband', 'wife', 'spouse')} of ${name(a)}’s ${enBlood(rel.inner, store.P[rel.spouse]?.sex)}`;
  }
  const w = relWord(a, b);
  if (!w) return t('relNone');
  return t('relIs', { a: name(a), b: name(b), rel: w });
}

// Label relative to the viewer, e.g. "Your grandson", "Wife of your first cousin".
export function relToYou(me, pid) {
  const rel = relation(me, pid);
  if (!rel || rel.k === 'self') return null;
  if (rel.k === 'spouseOfRel' && lang() === 'en') {
    return `${g(store.P[pid]?.sex, 'Husband', 'Wife', 'Spouse')} of your ${enBlood(rel.inner, store.P[rel.spouse]?.sex)}`;
  }
  const w = relWord(me, pid);
  return w ? t('relToYou', { rel: w }) : null;
}
