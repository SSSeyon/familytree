// "What's new": each save records what changed (new babies, photos, stories…) in meta.news.
import { store, person, displayName, fmtDate, contextLine } from './data.js';
import { t } from './i18n.js';
import { esc, icon, avatar, nameOf } from './ui.js';

const MAX_ENTRIES = 30, MAX_ITEMS = 40;
const today = () => new Date().toISOString().slice(0, 10);
const isNew = (d) => d?.y && (Date.now() - new Date(d.y, (d.m || 1) - 1, d.d || 1)) < 2 * 365.25 * 864e5;

// Compares the tree as it was when editing started (prev) with the tree about to be saved (next).
export function recordNews(prev, next) {
  if (!prev?.people) return;
  const P0 = prev.people, U0 = prev.unions || {};
  const items = [];
  const add = (k, ...p) => items.push({ k, p });
  for (const p of Object.values(next.people)) {
    const o = P0[p.id];
    if (!o) {
      if (!p.given && !p.surname) continue;
      add(isNew(p.birth) ? 'born' : 'joined', p.id);
      continue;
    }
    if (p.photo && p.photo !== o.photo) add('photo', p.id);
    if (['bio', 'oriki', 'meaning'].some(f => p[f] && p[f] !== o[f])) add('story', p.id);
    if ((p.media || []).length > (o.media || []).length) add('media', p.id);
    if ((p.death || p.deceased) && !(o.death || o.deceased)) add('passed', p.id);
  }
  for (const u of Object.values(next.unions || {})) {
    if (!U0[u.id] && u.husband && u.wife && P0[u.husband] && P0[u.wife]) add('married', u.husband, u.wife);
  }
  if (!items.length) return;
  const meta = next.meta || (next.meta = {});
  const news = meta.news || [];
  const d = today();
  let entry = news[0]?.d === d ? news[0] : null;
  if (!entry) { entry = { d, items: [] }; news.unshift(entry); }
  const key = i => i.k + ':' + i.p.join(',');
  const have = new Set(entry.items.map(key));
  for (const i of items) if (!have.has(key(i))) { entry.items.push(i); have.add(key(i)); }
  entry.items = entry.items.slice(0, MAX_ITEMS);
  meta.news = news.slice(0, MAX_ENTRIES);
}

const ICON = { born: '🎉', joined: '🌱', photo: '📷', story: '📖', media: '🎙️', passed: '🕊️', married: '💍' };
function line(i, plain) {
  const ps = i.p.map(person);
  if (ps.some(x => !x)) return null;
  const nm = x => plain ? displayName(x) : `<a href="#/person/${esc(x.id)}">${nameOf(x)}</a>`;
  const text = t('nw_' + i.k, { name: nm(ps[0]), other: ps[1] ? nm(ps[1]) : '' });
  return plain ? `${ICON[i.k]} ${text}` : text;
}

export const latestNews = () => store.tree.meta?.news?.[0]?.d || '';
export function newsSeen() { try { return localStorage.getItem('ft.newsSeen') || ''; } catch (e) { return ''; } }
export const hasUnseenNews = () => latestNews() > newsSeen();

export function renderNews(view) {
  const news = store.tree.meta?.news || [];
  try { if (latestNews()) localStorage.setItem('ft.newsSeen', latestNews()); } catch (e) {}
  document.querySelectorAll('.new-dot').forEach(e => e.remove());
  const date = d => { const [y, m, dd] = d.split('-').map(Number); return fmtDate({ y, m, d: dd }); };
  const pageUrl = location.origin + location.pathname + '#/explore/news';
  view.innerHTML = `<div class="page news">
    <div class="page-head"><h1>${t('whatsNew')}</h1></div>
    <p class="muted small">${t('newsIntro')}</p>
    ${news.length ? news.map(e => {
      const rows = e.items.map(i => ({ i, h: line(i) })).filter(r => r.h);
      if (!rows.length) return '';
      const share = [`*${store.tree.meta?.title || ''} — ${t('whatsNew')}* (${date(e.d)})`, ...e.items.map(i => line(i, true)).filter(Boolean), pageUrl].join('\n');
      return `<section class="card-box">
        <div class="row news-head"><h2>${esc(date(e.d))}</h2>
          <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(share)}">${icon('whatsapp')}${t('shareMemory')}</a></div>
        <ul class="list-plain news-list">${rows.map(({ i, h }) => `<li class="nw-${i.k}">${avatar(person(i.p[0]), 'sm')}
          <span class="grow"><span>${ICON[i.k]} ${h}</span>${i.k === 'born' ? `<div class="small muted">${esc(contextLine(i.p[0]))}</div>` : ''}</span></li>`).join('')}</ul>
      </section>`;
    }).join('') : `<div class="empty"><p>${t('newsNone')}</p></div>`}
  </div>`;
}
