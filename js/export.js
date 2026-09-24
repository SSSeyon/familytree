// GEDCOM 5.5.1 and JSON export.
import { store, kidsOf, unionsOf } from './data.js';
import { download } from './ui.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const gdate = d => [d.d, d.m && MON[d.m - 1], d.y].filter(Boolean).join(' ');

function text(lines, level, tag, value) {
  if (!value) return;
  const parts = String(value).split(/\r?\n/);
  lines.push(`${level} ${tag} ${parts[0]}`);
  parts.slice(1).forEach(p => lines.push(`${level + 1} CONT ${p}`));
}

export function toGedcom() {
  const { P, U } = store;
  const iid = new Map(Object.keys(P).map((id, i) => [id, `@I${i + 1}@`]));
  const fid = new Map(Object.keys(U).map((id, i) => [id, `@F${i + 1}@`]));
  const L = ['0 HEAD', '1 SOUR FAMILYTREE_WEB', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8',
    `1 DATE ${gdate({ d: new Date().getDate(), m: new Date().getMonth() + 1, y: new Date().getFullYear() })}`];
  for (const p of Object.values(P)) {
    L.push(`0 ${iid.get(p.id)} INDI`);
    L.push(`1 NAME ${p.given || ''} /${p.surname || ''}/`.replace('  ', ' '));
    if (p.given) L.push(`2 GIVN ${p.given}`);
    if (p.surname) L.push(`2 SURN ${p.surname}`);
    if (p.nickname) L.push(`2 NICK ${p.nickname}`);
    L.push(`1 SEX ${p.sex === 'M' ? 'M' : p.sex === 'F' ? 'F' : 'U'}`);
    if (p.birth || p.birthPlace) { L.push('1 BIRT'); if (p.birth) L.push(`2 DATE ${gdate(p.birth)}`); text(L, 2, 'PLAC', p.birthPlace); }
    if (p.death || p.deceased) { L.push(p.death ? '1 DEAT' : '1 DEAT Y'); if (p.death) L.push(`2 DATE ${gdate(p.death)}`); }
    if (p.burialPlace) { L.push('1 BURI'); text(L, 2, 'PLAC', p.burialPlace); }
    text(L, 1, 'OCCU', p.occupation);
    if (p.residence) { L.push('1 RESI'); text(L, 2, 'PLAC', p.residence); }
    text(L, 1, 'NOTE', [p.oriki && `Oriki: ${p.oriki}`, p.bio, p.notes].filter(Boolean).join('\n\n'));
    if (p.parents && fid.has(p.parents)) L.push(`1 FAMC ${fid.get(p.parents)}`);
    unionsOf(p.id).forEach(u => L.push(`1 FAMS ${fid.get(u.id)}`));
  }
  for (const u of Object.values(U)) {
    L.push(`0 ${fid.get(u.id)} FAM`);
    if (u.husband && iid.has(u.husband)) L.push(`1 HUSB ${iid.get(u.husband)}`);
    if (u.wife && iid.has(u.wife)) L.push(`1 WIFE ${iid.get(u.wife)}`);
    kidsOf(u.id).forEach(k => L.push(`1 CHIL ${iid.get(k)}`));
    if (u.marriage || u.place) { L.push('1 MARR'); if (u.marriage) L.push(`2 DATE ${gdate(u.marriage)}`); text(L, 2, 'PLAC', u.place); }
    if (u.separated) L.push('1 DIV Y');
  }
  L.push('0 TRLR');
  return L.join('\r\n');
}

export function downloadGedcom() { download('family-tree.ged', toGedcom(), 'text/plain;charset=utf-8'); }
export function downloadJson() { download('tree.json', JSON.stringify(store.tree, null, 1), 'application/json'); }
