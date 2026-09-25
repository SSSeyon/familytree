// "Add my family": relatives fill in missing people with a simple form; an editor adds them with one tap.
import { person, unionsOf, spouseIn, displayName, fmtDate, contextLine } from './data.js';
import { t } from './i18n.js';
import { esc, icon, html, $, $$, toast, modal } from './ui.js';
import { hasBackend, sendSuggestion } from './backend.js';

const CFG = window.FT_CONFIG || {};
const RELS = ['child', 'spouse', 'parent', 'sibling'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One line per person, e.g. "Child: Ada Hunga (female), born 3 Aug 2021, with Itunuoluwa Adebo".
export function describeAddition(add) {
  return (add.people || []).map(e => {
    const name = [e.given, e.surname].filter(Boolean).join(' ') || t('unknown');
    const bits = [`${t('af_' + e.rel)}: ${name}`];
    if (e.sex) bits[0] += ` (${t(e.sex === 'M' ? 'male' : 'female').toLowerCase()})`;
    if (e.birth) bits.push(t('afBorn', { date: fmtDate(e.birth) }));
    if (e.dead) bits.push(e.death?.y ? t('afDied', { date: e.death.y }) : t('afPassed'));
    if (e.rel === 'child') {
      const u = e.union && unionsOf(add.pid).find(x => x.id === e.union);
      const other = u ? spouseIn(u, add.pid) : null;
      const withName = name => t('withSpouse', { name }).replace(/^./, c => c.toLowerCase());
      if (other) bits.push(withName(displayName(person(other))));
      else if (e.otherName) bits.push(withName(e.otherName));
    }
    return bits.join(', ');
  }).map(s => `• ${s}`).join('\n');
}

const row = (pid, n) => {
  const partners = unionsOf(pid).filter(u => spouseIn(u, pid));
  return `<fieldset class="af-row" data-row="${n}">
    <legend>${t('afPerson', { n: n + 1 })}</legend>
    <div class="grid-2">
      <label class="field"><span>${t('afRel', { name: displayName(person(pid)) })}</span>
        <select name="rel">${RELS.map(r => `<option value="${r}">${t('af_' + r)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('sex')}</span>
        <select name="sex"><option value="">—</option><option value="M">${t('male')}</option><option value="F">${t('female')}</option></select></label>
      <label class="field"><span>${t('given')} *</span><input type="text" name="given" autocomplete="off"></label>
      <label class="field"><span>${t('surname')}</span><input type="text" name="surname" autocomplete="off"></label>
    </div>
    <label class="field af-other"><span>${t('afOtherParent')}</span>
      <select name="union">${partners.map(u => `<option value="${esc(u.id)}">${esc(displayName(person(spouseIn(u, pid))))}</option>`).join('')}<option value="">${t('afSomeoneElse')}</option></select>
      <input type="text" name="otherName" placeholder="${esc(t('afOtherName'))}" ${partners.length ? 'hidden' : ''}></label>
    <div class="field"><span>${t('birthday')}</span><div class="grid-3">
      <input type="number" name="bd" min="1" max="31" placeholder="${t('day')}" aria-label="${t('day')}">
      <select name="bm" aria-label="${t('month')}"><option value="">${t('month')}</option>${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
      <input type="number" name="by" min="1800" max="2100" placeholder="${t('year')}" aria-label="${t('year')}">
    </div></div>
    <label class="row small"><input type="checkbox" name="dead"> ${t('afHasPassed')}</label>
    <input type="number" name="dy" min="1800" max="2100" placeholder="${esc(t('afDeathYear'))}" hidden>
    ${n ? `<button type="button" class="btn sm ghost" data-remove>${icon('trash')}${t('afRemove')}</button>` : ''}
  </fieldset>`;
};

export function openAddFamily(pid) {
  const p = person(pid);
  if (!p) return;
  let n = 0;
  const body = html(`<form class="af">
    <p class="small muted">${t('afIntro', { name: displayName(p) })}</p>
    <div data-rows>${row(pid, n++)}</div>
    <button type="button" class="btn sm" data-more>${icon('plus')}${t('afAnother')}</button>
    <div class="grid-2">
      <label class="field"><span>${t('sgName')}</span><input type="text" name="name" autocomplete="name"></label>
      <label class="field"><span>${t('sgContact')}</span><input type="text" name="contact"></label>
    </div>
  </form>`);
  const foot = html(`<div style="display:contents">
    <button class="btn" type="button" data-wa>${icon('whatsapp')}${t('sgViaWa')}</button>
    ${hasBackend() ? `<button class="btn primary" type="button" data-send>${icon('upload')}${t('afSend')}</button>` : ''}
  </div>`);
  const m = modal({ title: t('afTitle', { name: displayName(p) }), body, foot, wide: true });

  const wire = fs => {
    const rel = $('[name=rel]', fs), other = $('.af-other', fs), un = $('[name=union]', fs), on = $('[name=otherName]', fs);
    const dead = $('[name=dead]', fs), dy = $('[name=dy]', fs);
    const sync = () => { other.hidden = rel.value !== 'child'; on.hidden = !!un.value; dy.hidden = !dead.checked; };
    rel.onchange = un.onchange = dead.onchange = sync;
    $('[data-remove]', fs)?.addEventListener('click', () => fs.remove());
    sync();
  };
  wire($('.af-row', body));
  $('[data-more]', body).onclick = () => {
    const fs = html(row(pid, n++));
    $('[data-rows]', body).append(fs);
    wire(fs);
    $('[name=given]', fs).focus();
  };

  const read = () => {
    const people = $$('.af-row', body).map(fs => {
      const v = k => $(`[name=${k}]`, fs)?.value.trim() || '';
      const e = { rel: v('rel'), given: v('given'), surname: v('surname') };
      if (v('sex')) e.sex = v('sex');
      const b = {}; if (+v('bd')) b.d = +v('bd'); if (+v('bm')) b.m = +v('bm'); if (+v('by')) b.y = +v('by');
      if (Object.keys(b).length) e.birth = b;
      if ($('[name=dead]', fs).checked) { e.dead = true; if (+v('dy')) e.death = { y: +v('dy') }; }
      if (e.rel === 'child') { if (v('union')) e.union = v('union'); else if (v('otherName')) e.otherName = v('otherName'); }
      return e;
    }).filter(e => e.given || e.surname);
    return { add: { v: 1, pid, people }, name: body.name.value.trim(), contact: body.contact.value.trim() };
  };
  const valid = d => { if (!d.add.people.length) { toast(t('afNeedName')); $('[name=given]', body).focus(); return false; } return true; };
  const about = `${displayName(p)}${contextLine(pid) ? ` (${contextLine(pid)})` : ''}`;
  const link = `${location.origin}${location.pathname}#/person/${pid}`;

  $('[data-wa]', m.el).onclick = () => {
    const d = read(); if (!valid(d)) return;
    const text = `*${t('afTitle', { name: displayName(p) })}*\n${link}\n\n${describeAddition(d.add)}${d.name ? `\n\n— ${d.name}` : ''}${d.contact ? ` (${d.contact})` : ''}`;
    window.open(`https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    m.close();
  };
  const send = $('[data-send]', m.el);
  if (send) send.onclick = async () => {
    const d = read(); if (!valid(d)) return;
    send.disabled = true;
    try {
      await sendSuggestion({ person: about, personId: pid, type: t('afType'), message: describeAddition(d.add), name: d.name, contact: d.contact, link, add: JSON.stringify(d.add) });
      toast(t('afThanks'), 5000); m.close();
    } catch (e) { toast(t('genericError', { msg: e.message })); send.disabled = false; }
  };
}
