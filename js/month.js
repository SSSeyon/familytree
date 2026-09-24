// "This month in the family": birthdays and remembrance days, WhatsApp greetings and reminders.
import { store, allPeople, isLiving, displayName, fmtDate, lifeSpan } from './data.js';
import { t, lang } from './i18n.js';
import { esc, icon, avatar, $, toast, nameOf } from './ui.js';

// Shared with sw.js, which shows the reminders when the app is closed (where the browser allows).
const REM_CACHE = 'ft-reminders', REM_LIST = 'reminders.json', REM_LAST = 'reminders-last.txt';
const YO_MONTHS = ['Ṣẹ́rẹ́', 'Èrèlè', 'Ẹrẹ̀nà', 'Ìgbé', 'Ẹ̀bibi', 'Òkúdu', 'Agẹmọ', 'Ògún', 'Owewe', 'Ọ̀wàrà', 'Bélú', 'Ọ̀pẹ̀'];
let viewing = null; // month on screen, 1–12

export const monthName = m => lang() === 'yo' ? 'Oṣù ' + YO_MONTHS[m - 1] : new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' });
const family = () => store.tree.meta?.title || '';
const pageUrl = hash => location.origin + location.pathname + hash;

function daysUntil(m, d) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 864e5);
}
const whenLabel = n => n === 0 ? t('today') : n === 1 ? t('tomorrow') : n <= 31 ? t('inDays', { n }) : '';

// Birthdays of living people and remembrance days of those who have passed, in month m.
function eventsIn(m) {
  const byDay = key => (a, b) => (a[key].d || 99) - (b[key].d || 99);
  const people = allPeople();
  return {
    bdays: people.filter(p => isLiving(p) && p.birth?.m === m).sort(byDay('birth')),
    remember: people.filter(p => p.death?.m === m).sort(byDay('death')),
  };
}

const bdayText = p => t('waBday', { name: displayName(p), family: family() }) + '\n' + pageUrl(`#/person/${p.id}`);
const rememberText = p => t('waRemember', { name: displayName(p), span: lifeSpan(p) || fmtDate(p.death) }) + '\n' + pageUrl(`#/person/${p.id}`);
const waHref = text => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function renderMonth(view) {
  const now = new Date(), thisMonth = now.getMonth() + 1;
  const m = viewing || thisMonth;
  const { bdays, remember } = eventsIn(m);
  const isToday = d => m === thisMonth && d?.d === now.getDate();
  const when = d => m === thisMonth || m === thisMonth % 12 + 1 ? (d?.d ? whenLabel(daysUntil(m, d.d)) : '') : '';
  const row = (p, d, kind) => `<li class="${isToday(d) ? 'today' : ''}">${avatar(p, 'sm')}
    <span class="grow"><a href="#/person/${esc(p.id)}">${nameOf(p)}</a><div class="small muted">${esc(d.d ? fmtDate({ d: d.d, m }) : t('dayUnknown'))}${when(d) ? ' · ' + esc(when(d)) : ''}${kind === 'r' && lifeSpan(p) ? ' · ' + esc(lifeSpan(p)) : ''}</div></span>
    <a class="btn sm" target="_blank" rel="noopener" href="${esc(waHref(kind === 'b' ? bdayText(p) : rememberText(p)))}">${icon('whatsapp')}${t(kind === 'b' ? 'sendWishes' : 'shareMemory')}</a></li>`;
  const summary = [
    t('monthShare', { month: monthName(m), family: family() }),
    ...bdays.map(p => `🎂 ${p.birth.d ? fmtDate({ d: p.birth.d, m }) + ' – ' : ''}${displayName(p)}`),
    ...remember.map(p => `🕊️ ${p.death.d ? fmtDate({ d: p.death.d, m }) + ' – ' : ''}${displayName(p)}`),
    pageUrl('#/explore/month'),
  ].join('\n');
  const canNotify = 'Notification' in window && 'serviceWorker' in navigator;
  const on = remindersOn() && canNotify && Notification.permission === 'granted';

  view.innerHTML = `<div class="page month">
    <div class="page-head month-head">
      <button class="icon-btn" data-m="-1" aria-label="${esc(t('prevMonth'))}">‹</button>
      <h1>${esc(monthName(m))}</h1>
      <button class="icon-btn" data-m="1" aria-label="${esc(t('nextMonth'))}">›</button>
      ${m !== thisMonth ? `<button class="btn sm" data-m="0">${t('thisMonth')}</button>` : ''}
    </div>
    <section class="card-box"><h2>🎂 ${t('mBirthdays')} <span class="muted small">(${bdays.length})</span></h2>
      ${bdays.length ? `<ul class="list-plain month-list">${bdays.map(p => row(p, p.birth, 'b')).join('')}</ul>` : `<p class="muted">${t('mNone')}</p>`}
    </section>
    <section class="card-box"><h2>🕊️ ${t('remembrance')} <span class="muted small">(${remember.length})</span></h2>
      ${remember.length ? `<ul class="list-plain month-list">${remember.map(p => row(p, p.death, 'r')).join('')}</ul>` : `<p class="muted">${t('mNone')}</p>`}
    </section>
    <div class="row wrap">${bdays.length || remember.length ? `<a class="btn primary" target="_blank" rel="noopener" href="${esc(waHref(summary))}">${icon('whatsapp')}${t('shareMonth')}</a>` : ''}</div>
    <section class="card-box"><h2>${t('remindTitle')}</h2>
      ${canNotify
        ? `<label class="switch"><input type="checkbox" data-remind ${on ? 'checked' : ''}><span class="track"></span>${t('remindMe')}</label>
           <p class="small muted">${t('remindHelp')}</p>
           ${Notification.permission === 'denied' ? `<p class="small">${t('remindBlocked')}</p>` : ''}`
        : `<p class="small muted">${t('remindNo')}</p>`}
    </section>
  </div>`;

  view.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const step = +b.dataset.m;
    viewing = step ? (m + step + 11) % 12 + 1 : thisMonth;
    renderMonth(view);
  });
  const sw = $('[data-remind]', view);
  if (sw) sw.onchange = async () => {
    if (sw.checked) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { sw.checked = false; toast(t('remindBlocked'), 5000); return; }
      setRemind(true);
      await scheduleReminders();
      toast(t('remindOnToast'), 4000);
    } else { setRemind(false); await clearReminders(); }
  };
}

// ---------- reminders ----------
const remindersOn = () => { try { return localStorage.getItem('ft.remind') === '1'; } catch (e) { return false; } };
const setRemind = v => { try { v ? localStorage.setItem('ft.remind', '1') : localStorage.removeItem('ft.remind'); } catch (e) {} };

// Called at start-up: store the next few weeks of events for the service worker,
// and show today's reminders now if they haven't been shown yet.
export async function scheduleReminders() {
  if (!remindersOn() || !('caches' in window) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const events = [];
  const now = new Date();
  for (const k of [0, 1]) {
    const m = (now.getMonth() + k) % 12 + 1;
    const { bdays, remember } = eventsIn(m);
    bdays.filter(p => p.birth.d).forEach(p => events.push({ m, d: p.birth.d, tag: 'b' + p.id, title: '🎂 ' + t('nBday', { name: displayName(p) }), body: t('nBdayBody'), url: '#/explore/month' }));
    remember.filter(p => p.death.d).forEach(p => events.push({ m, d: p.death.d, tag: 'r' + p.id, title: '🕊️ ' + t('nRemember', { name: displayName(p) }), body: lifeSpan(p) || '', url: '#/explore/month' }));
  }
  try {
    const c = await caches.open(REM_CACHE);
    await c.put(REM_LIST, new Response(JSON.stringify({ events })));
    const reg = await swReady();
    try { await reg?.periodicSync?.register('ft-remind', { minInterval: 12 * 3600e3 }); } catch (e) {}
    // today's, if not already shown
    const key = now.toDateString();
    const last = await c.match(REM_LAST);
    if (last && (await last.text()) === key) return;
    const todays = events.filter(x => x.m === now.getMonth() + 1 && x.d === now.getDate());
    for (const x of todays) {
      const opts = { body: x.body, tag: x.tag, icon: 'icons/icon-192.png', data: { url: x.url } };
      if (reg?.showNotification) await reg.showNotification(x.title, opts); else new Notification(x.title, opts);
    }
    await c.put(REM_LAST, new Response(key));
  } catch (e) {}
}

async function clearReminders() {
  try { await caches.delete(REM_CACHE); } catch (e) {}
  try { await (await swReady())?.periodicSync?.unregister('ft-remind'); } catch (e) {}
}
// The service worker may not be available (e.g. first visit, some previews): don't wait forever.
const swReady = () => Promise.race([navigator.serviceWorker?.ready, new Promise(r => setTimeout(r, 3000))]);
