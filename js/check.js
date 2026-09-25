// Tree checker (editors): likely mistakes in dates, links and duplicates.
import { store, person, allPeople, unionsOf, parentIds, parentsOf, displayName, isNamed, descendants } from './data.js';
import { t } from './i18n.js';
import { esc, icon, avatar, $$, nameOf } from './ui.js';

const yr = d => d?.y || null;
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');

// Each problem: { key, sev: 'err' | 'warn' | 'info', pids, msg }. The key lets editors hide it.
export function runChecks() {
  const out = [];
  const add = (sev, kind, pids, msg) => out.push({ key: kind + ':' + pids.join(','), sev, pids, msg });
  const nowY = new Date().getFullYear();

  for (const p of allPeople()) {
    const b = yr(p.birth), d = yr(p.death);
    if (b && d && d < b) add('err', 'death', [p.id], t('ckDeathBeforeBirth'));
    if ((b || 0) > nowY || (d || 0) > nowY) add('err', 'future', [p.id], t('ckFuture'));
    if (b && d && d - b > 110) add('warn', 'long', [p.id], t('ckLong', { n: d - b }));
    if (isNamed(p) && (!p.sex || p.sex === 'U')) add('info', 'sex', [p.id], t('ckNoSex'));
    if (!p.parents && !unionsOf(p.id).length) add('warn', 'alone', [p.id], t('ckIsolated'));
    // own ancestor (a loop in the links)
    if (parentIds(p.id).some(x => descendants(p.id).has(x))) add('err', 'loop', [p.id], t('ckLoop'));

    // against each parent
    const pp = parentsOf(p.id);
    for (const [par, role] of [[pp?.father, 'f'], [pp?.mother, 'm']]) {
      const q = person(par);
      if (!q) continue;
      const qb = yr(q.birth), qd = yr(q.death), qn = displayName(q);
      if (b && qb) {
        const age = b - qb;
        if (age <= 0) add('err', 'before', [p.id, par], t('ckBornBeforeParent', { name: qn }));
        else if (age < 13) add('err', 'young', [p.id, par], t('ckParentYoung', { name: qn, n: age }));
        else if (role === 'm' && age > 55) add('warn', 'oldm', [p.id, par], t('ckParentOld', { name: qn, n: age }));
        else if (role === 'f' && age > 80) add('warn', 'oldf', [p.id, par], t('ckParentOld', { name: qn, n: age }));
      }
      if (b && qd && (role === 'm' ? b > qd : b > qd + 1)) add('err', 'afterdeath', [p.id, par], t('ckAfterDeath', { name: qn }));
    }
  }

  for (const u of Object.values(store.U)) {
    const h = person(u.husband), w = person(u.wife);
    if (h?.sex === 'F') add('warn', 'role', [h.id], t('ckRoleH'));
    if (w?.sex === 'M') add('warn', 'role', [w.id], t('ckRoleW'));
    // married before 14, or after death
    const my = yr(u.marriage);
    for (const s of [h, w].filter(Boolean)) {
      if (my && yr(s.birth) && my - yr(s.birth) < 14) add('warn', 'wedyoung', [s.id], t('ckMarriedYoung', { n: my - yr(s.birth) }));
      if (my && yr(s.death) && my > yr(s.death)) add('err', 'weddead', [s.id], t('ckMarriedDead'));
    }
  }
  // the same couple recorded twice
  const pairs = new Map();
  for (const u of Object.values(store.U)) {
    if (!u.husband || !u.wife) continue;
    const k = u.husband + '+' + u.wife;
    if (pairs.has(k)) add('warn', 'twice', [u.husband, u.wife], t('ckMarriedTwice'));
    pairs.set(k, u.id);
  }

  // possible duplicates: same name, dates don't disagree, and not parent/child or ancestor of each other
  const byName = new Map();
  for (const p of allPeople()) {
    if (!p.given || !p.surname) continue;
    const k = norm(p.given) + '|' + norm(p.surname);
    byName.set(k, [...(byName.get(k) || []), p]);
  }
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], c = group[j];
      if (yr(a.birth) && yr(c.birth) && Math.abs(yr(a.birth) - yr(c.birth)) > 2) continue;
      if (yr(a.death) && yr(c.death) && Math.abs(yr(a.death) - yr(c.death)) > 2) continue;
      if (descendants(a.id).has(c.id) || descendants(c.id).has(a.id)) continue;   // named after a forebear
      add('warn', 'dup', [a.id, c.id], t('ckDuplicate'));
    }
  }
  const rank = { err: 0, warn: 1, info: 2 };
  return out.sort((x, y) => rank[x.sev] - rank[y.sev]);
}

// Renders the checker into box. onEdit(pid) opens the editor; commit() saves a change to the tree.
export function renderChecks(box, { onEdit, commit }) {
  const meta = store.tree.meta || (store.tree.meta = {});
  const hidden = new Set(meta.checkHidden || []);
  let showHidden = false;
  const draw = () => {
    const all = runChecks();
    const list = all.filter(i => showHidden || !hidden.has(i.key));
    const nHidden = all.filter(i => hidden.has(i.key)).length;
    const count = s => all.filter(i => i.sev === s && !hidden.has(i.key)).length;
    box.innerHTML = `
      <p class="small muted">${t('ckIntro')}</p>
      <div class="ck-sum">${['err', 'warn', 'info'].map(s => `<span><i class="ck-dot ${s}"></i>${t({ err: 'ckErr', warn: 'ckWarn', info: 'ckInfo' }[s])} <strong>${count(s)}</strong></span>`).join('')}</div>
      <ul class="list-plain ck-list">${list.map(i => `<li class="ck ${i.sev}${hidden.has(i.key) ? ' hidden-ck' : ''}">
        <span class="ck-dot ${i.sev}" aria-label="${esc(t({ err: 'ckErr', warn: 'ckWarn', info: 'ckInfo' }[i.sev]))}"></span>
        <span class="grow"><span class="ck-people">${i.pids.map(pid => `<a href="#/person/${esc(pid)}">${avatar(person(pid), 'sm')}${nameOf(person(pid))}</a>`).join('<span class="muted">·</span>')}</span>
          <span class="small">${esc(i.msg)}</span>
        <span class="row wrap">${i.pids.slice(0, 2).map((pid, k) => `<button class="btn sm" data-edit="${esc(pid)}">${icon('edit')}${i.pids.length > 1 ? esc(person(pid)?.given || t('edit')) : t('edit')}</button>`).join('')}
          <button class="btn sm ghost" data-hide="${esc(i.key)}">${hidden.has(i.key) ? t('ckUnhide') : t('ckHide')}</button></span></span>
      </li>`).join('') || `<li class="muted">✓ ${t('ckNone')}</li>`}</ul>
      ${nHidden ? `<button class="btn sm ghost" data-show-hidden>${showHidden ? t('ckHideHidden') : t('ckShowHidden', { n: nHidden })}</button>` : ''}`;
    $$('[data-edit]', box).forEach(b => b.onclick = () => onEdit(b.dataset.edit));
    $$('[data-hide]', box).forEach(b => b.onclick = () => {
      const k = b.dataset.hide;
      hidden.has(k) ? hidden.delete(k) : hidden.add(k);
      meta.checkHidden = [...hidden];
      if (!meta.checkHidden.length) delete meta.checkHidden;
      commit();
      draw();
    });
    const sh = box.querySelector('[data-show-hidden]');
    if (sh) sh.onclick = () => { showHidden = !showHidden; draw(); };
  };
  draw();
}
