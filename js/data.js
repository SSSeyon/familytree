// Tree data model: loading, indexes and family helpers.
import { t, lang } from './i18n.js';

export const store = { tree: null, P: {}, U: {} };
const idx = { kids: new Map(), unionsOf: new Map(), desc: new Map(), founders: null };
const listeners = new Set();

export async function loadTree() {
  const res = await fetch('data/tree.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load data/tree.json');
  setTree(await res.json());
}

export function setTree(tree) {
  store.tree = tree;
  store.P = tree.people;
  store.U = tree.unions;
  reindex();
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function changed() { reindex(); listeners.forEach(fn => fn()); }

export function reindex() {
  const { P, U } = store;
  idx.kids.clear(); idx.unionsOf.clear(); idx.desc.clear(); idx.founders = null;
  for (const p of Object.values(P)) {
    if (p.parents && U[p.parents]) {
      if (!idx.kids.has(p.parents)) idx.kids.set(p.parents, []);
      idx.kids.get(p.parents).push(p.id);
    }
  }
  for (const list of idx.kids.values()) list.sort((a, b) => (P[a].order ?? 99) - (P[b].order ?? 99) || birthKey(P[a]) - birthKey(P[b]));
  for (const u of Object.values(U)) {
    for (const [pid, ord] of [[u.husband, u.hOrder], [u.wife, u.wOrder]]) {
      if (!pid || !P[pid]) continue;
      if (!idx.unionsOf.has(pid)) idx.unionsOf.set(pid, []);
      idx.unionsOf.get(pid).push({ u, ord: ord ?? 0 });
    }
  }
  for (const [pid, list] of idx.unionsOf) idx.unionsOf.set(pid, list.sort((a, b) => a.ord - b.ord).map(x => x.u));
}

const birthKey = p => (p.birth?.y ?? 9999) * 400 + (p.birth?.m ?? 0) * 31 + (p.birth?.d ?? 0);

// ---- basic lookups ----
export const person = id => store.P[id];
export const union = id => store.U[id];
export const kidsOf = uid => idx.kids.get(uid) || [];
export const unionsOf = pid => idx.unionsOf.get(pid) || [];
export const spouseIn = (u, pid) => (u.husband === pid ? u.wife : u.husband);
export const allPeople = () => Object.values(store.P);

export function parentsOf(pid) {
  const u = store.U[store.P[pid]?.parents];
  return u ? { union: u, father: u.husband || null, mother: u.wife || null } : null;
}
export function parentIds(pid) {
  const p = parentsOf(pid);
  return p ? [p.father, p.mother].filter(Boolean) : [];
}
export function spousesOf(pid) {
  return unionsOf(pid).map(u => spouseIn(u, pid)).filter(Boolean);
}
export function childrenOf(pid) {
  return unionsOf(pid).flatMap(u => kidsOf(u.id));
}
export function siblingsOf(pid) {
  const pp = parentsOf(pid);
  if (!pp) return { full: [], half: [] };
  const full = kidsOf(pp.union.id).filter(k => k !== pid);
  const half = new Set();
  for (const par of [pp.father, pp.mother].filter(Boolean)) {
    for (const u of unionsOf(par)) if (u.id !== pp.union.id) kidsOf(u.id).forEach(k => half.add(k));
  }
  return { full, half: [...half] };
}

// ---- names, dates, privacy ----
export function isLiving(p) {
  if (!p || p.deceased || p.death) return false;
  if (p.birth?.y && p.birth.y < new Date().getFullYear() - 100) return false;
  return true;
}
export function displayName(p) {
  if (!p) return t('unknown');
  const n = [p.given, p.surname].filter(Boolean).join(' ').trim();
  return n || t('unknown');
}
export function shortName(p) { return p?.given || p?.surname || t('unknown'); }
export function initials(p) {
  const n = [p?.given, p?.surname].filter(Boolean).join(' ').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
export const isNamed = p => !!(p.given || p.surname);

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  yo: ['Ṣẹ́rẹ́', 'Èrèlé', 'Ẹrẹ̀nà', 'Ìgbé', 'Ẹ̀bibi', 'Òkúdu', 'Agẹmọ', 'Ògún', 'Owewe', 'Ọ̀wàrà', 'Bélú', 'Ọ̀pẹ̀'],
};
export function fmtDate(d) {
  if (!d) return '';
  const m = d.m ? MONTHS[lang()][d.m - 1] : '';
  return [d.d || '', m, d.y || ''].filter(Boolean).join(' ');
}
// Short life span, e.g. "1962 – 2020", "d. 2002", "b. 1935".
export function lifeSpan(p) {
  const b = !isLiving(p) || store.tree?.meta?.showLivingYears ? p.birth?.y : null;
  const d = p.death?.y;
  if (b && d) return `${b} – ${d}`;
  if (d) return `${t('diedAbbr')} ${d}`;
  if (b) return `${t('bornAbbr')} ${b}`;
  if (p.deceased) return t('deceased');
  return '';
}
export function ageAt(p, when = new Date()) {
  if (!p.birth?.y) return null;
  const end = p.death?.y ? new Date(p.death.y, (p.death.m || 6) - 1, p.death.d || 1) : when;
  return Math.floor((end - new Date(p.birth.y, (p.birth.m || 6) - 1, p.birth.d || 1)) / 3.15576e10);
}

// ---- descendants & founders ----
export function descendants(pid) {
  if (idx.desc.has(pid)) return idx.desc.get(pid);
  const out = new Set([pid]);
  const stack = [pid];
  while (stack.length) {
    const cur = stack.pop();
    for (const c of childrenOf(cur)) if (!out.has(c)) { out.add(c); stack.push(c); }
  }
  idx.desc.set(pid, out);
  return out;
}

// Top-of-line ancestors (no parents recorded, have children), biggest line first.
export function founders() {
  if (idx.founders) return idx.founders;
  const { P } = store;
  const list = [];
  for (const p of Object.values(P)) {
    if (p.parents || !childrenOf(p.id).length) continue;
    // for a couple where both have no parents, list the husband only
    const covered = unionsOf(p.id).every(u => {
      const sp = spouseIn(u, p.id);
      return sp && u.wife === p.id && !P[sp]?.parents;
    });
    if (covered) continue;
    list.push({ id: p.id, size: descendants(p.id).size });
  }
  // drop lines fully contained in a bigger line
  list.sort((a, b) => b.size - a.size);
  const kept = [];
  for (const f of list) {
    const d = descendants(f.id);
    const inside = kept.some(k => { const kd = descendants(k.id); return [...d].every(x => kd.has(x) || spousesOf(x).some(s => kd.has(s))); });
    if (!inside) kept.push(f);
  }
  idx.founders = kept;
  return kept;
}
export function mainFounder() { return founders()[0]?.id; }

// Which founder's chart shows this person (as descendant or as a spouse)?
export function founderFor(pid) {
  for (const f of founders()) {
    const d = descendants(f.id);
    if (d.has(pid) || spousesOf(pid).some(s => d.has(s))) return f.id;
  }
  return mainFounder();
}

// Ancestors with generation distance (self = 0).
export function ancestorDepths(pid) {
  const out = new Map([[pid, 0]]);
  const q = [pid];
  while (q.length) {
    const cur = q.shift();
    for (const par of parentIds(cur)) if (!out.has(par)) { out.set(par, out.get(cur) + 1); q.push(par); }
  }
  return out;
}

// ---- mutation helpers (editor) ----
export function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Search: accent-insensitive match on names and nicknames.
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function search(q, limit = 12) {
  const n = norm(q).trim();
  if (!n) return [];
  const res = [];
  for (const p of allPeople()) {
    const hay = norm([p.given, p.surname, p.nickname].filter(Boolean).join(' '));
    if (!hay) continue;
    const i = hay.indexOf(n);
    if (i < 0) continue;
    res.push({ p, score: (i === 0 ? 0 : hay.includes(' ' + n) ? 1 : 2) + hay.length / 100 });
  }
  return res.sort((a, b) => a.score - b.score).slice(0, limit).map(r => r.p);
}

// "child of X & Y" / "wife of X" — disambiguates people with the same name.
export function contextLine(pid) {
  const pp = parentsOf(pid);
  if (pp) {
    const names = [pp.father, pp.mother].filter(Boolean).map(id => shortName(store.P[id]));
    if (names.some(n => n !== t('unknown'))) return t('childOf', { names: names.join(' & ') });
  }
  const sp = spousesOf(pid)[0];
  if (sp) return t(store.P[pid].sex === 'F' ? 'wifeOf' : store.P[pid].sex === 'M' ? 'husbandOf' : 'spouseOf', { name: shortName(store.P[sp]) });
  return '';
}
