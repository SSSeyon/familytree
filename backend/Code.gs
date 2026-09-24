/**
 * Family Tree backend — Google Apps Script web app.
 *
 * Stores the family tree in your Google Drive, checks the editor passphrase,
 * accepts photo / voice-note uploads and "Suggest a change" messages.
 *
 * Setup (5 minutes) — see README "Backend setup":
 *   1. https://script.google.com → New project → paste this file.
 *   2. Project Settings (⚙) → Script properties → add  EDIT_PASSPHRASE = <your passphrase>
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
 *   4. Copy the web-app URL into config.js → backend.url
 *
 * The passphrase lives only in Script properties (private to you), never in the website.
 */

const FOLDER_NAME = 'Family Tree (website data)';
const KEEP_BACKUPS = 60;

// ---------- entry points ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'media') return json(readMedia(p.id));
    if (p.action === 'ping') return json({ ok: true });
    return json({ ok: true, tree: readTree() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad-request' }); }
  try {
    if (req.action === 'suggest') return json(saveSuggestion(req));
    if (!checkPassphrase(req.pass)) return json({ ok: false, error: 'wrong-passphrase' });
    if (req.action === 'verify') { const t = readTree(); return json({ ok: true, rev: (t && t.meta && t.meta.rev) || 0 }); }
    if (req.action === 'save') return json(saveTree(req));
    if (req.action === 'upload') return json(saveUpload(req));
    return json({ ok: false, error: 'unknown-action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- passphrase (with brute-force protection) ----------
function checkPassphrase(pass) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw new Error('too-many-attempts — wait 15 minutes');
  const real = PropertiesService.getScriptProperties().getProperty('EDIT_PASSPHRASE');
  if (!real) throw new Error('EDIT_PASSPHRASE is not set in Script properties');
  if (pass === real) return true;
  cache.put('fails', String(fails + 1), 900);
  return false;
}

// ---------- storage ----------
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function sub_(name) {
  const f = folder_(), it = f.getFoldersByName(name);
  return it.hasNext() ? it.next() : f.createFolder(name);
}
function dataFile_() {
  const it = folder_().getFilesByName('tree.json');
  return it.hasNext() ? it.next() : null;
}
function readTree() {
  const f = dataFile_();
  return f ? JSON.parse(f.getBlob().getDataAsString('UTF-8')) : null;
}

function saveTree(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const current = readTree();
    const curRev = (current && current.meta && current.meta.rev) || 0;
    if (current && curRev > (req.baseRev || 0) && !req.force) return { ok: false, error: 'conflict', rev: curRev };
    const tree = req.tree;
    tree.meta = tree.meta || {};
    tree.meta.rev = curRev + 1;
    tree.meta.updated = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
    const text = JSON.stringify(tree);
    const f = dataFile_();
    if (f) {
      // keep the previous version as a backup
      sub_('history').createFile(`tree-rev${curRev}.json`, f.getBlob().getDataAsString('UTF-8'), 'application/json');
      f.setContent(text);
    } else {
      folder_().createFile('tree.json', text, 'application/json');
    }
    pruneBackups_();
    return { ok: true, rev: tree.meta.rev };
  } finally {
    lock.releaseLock();
  }
}

function pruneBackups_() {
  const files = [];
  const it = sub_('history').getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(KEEP_BACKUPS).forEach(f => f.setTrashed(true));
}

// ---------- uploads (photos, voice notes) ----------
function saveUpload(req) {
  const bytes = Utilities.base64Decode(req.data);
  const blob = Utilities.newBlob(bytes, req.mime || 'application/octet-stream', req.name || 'upload');
  const file = sub_('media').createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = file.getId();
  const isImage = /^image\//.test(req.mime || '');
  return { ok: true, id, url: isImage ? `https://lh3.googleusercontent.com/d/${id}` : `drive:${id}` };
}

function readMedia(id) {
  const file = DriveApp.getFileById(id);
  // only serve files that belong to this app's media folder
  const parents = file.getParents();
  const mediaId = sub_('media').getId();
  let ok = false;
  while (parents.hasNext()) if (parents.next().getId() === mediaId) ok = true;
  if (!ok) throw new Error('not-found');
  const blob = file.getBlob();
  return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// ---------- suggestions → Google Sheet + email ----------
function saveSuggestion(req) {
  const clip = (s, n) => String(s || '').slice(0, n);
  const msg = clip(req.message, 4000).trim();
  if (!msg) return { ok: false, error: 'empty' };
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('sugg') || 0);
  if (n > 60) return { ok: false, error: 'busy — try again later' };
  cache.put('sugg', String(n + 1), 3600);

  const it = folder_().getFilesByName('Suggestions');
  const ss = it.hasNext() ? SpreadsheetApp.open(it.next()) : (() => {
    const s = SpreadsheetApp.create('Suggestions');
    DriveApp.getFileById(s.getId()).moveTo(folder_());
    s.getSheets()[0].appendRow(['When', 'About', 'Person ID', 'Type', 'Suggestion', 'From', 'Contact', 'Link']);
    return s;
  })();
  const row = [new Date(), clip(req.person, 200), clip(req.personId, 60), clip(req.type, 60), msg, clip(req.name, 120), clip(req.contact, 120), clip(req.link, 300)];
  ss.getSheets()[0].appendRow(row);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `Family tree suggestion: ${row[1]}`,
      `${row[3]}\n\n${msg}\n\nFrom: ${row[5]} ${row[6]}\n${row[7]}\n\nAll suggestions: ${ss.getUrl()}`);
  } catch (err) { /* email quota reached — the sheet still has it */ }
  return { ok: true };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor (▶ Run) to grant Drive / Sheets / Mail permissions.
function authorize() {
  folder_(); sub_('media'); sub_('history');
  Logger.log('Ready. Folder: ' + folder_().getUrl());
}
