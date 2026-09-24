# Family Tree

An interactive family tree website, converted from a Quick Family Tree (`.ftz`) export. It is plain HTML, CSS and JavaScript with no build step, and is hosted free on GitHub Pages.

**What viewers get:** a zoomable tree chart (top-down or sideways), a family view centred on one person, person cards with photos, stories, oríkì and voice notes, a "How are we related?" finder, a timeline, a photo gallery, stats and birthdays, English/Yoruba, dark mode, share links, PNG/print/GEDCOM export, and a "Suggest a change" button (saved to a Google Sheet, or sent on WhatsApp).

**What you (the editor) get:** a built-in editor unlocked with a family passphrase. It syncs through your Google Drive, and the site installs as a phone app (PWA).

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app |
| `config.js` | Settings: backend URL, WhatsApp number, start person, privacy |
| `backend/Code.gs` | Google Apps Script backend (storage, passphrase, uploads, suggestions) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app (PWA) and offline support |
| `data/tree.json` | All people and families (public) |
| `photos/` | Original face photos (new uploads go to Google Drive) |
| `tools/convert-ftz.ps1` | Converts a `.ftz` export into `data/tree.json` + `photos/` |
| `tools/serve.ps1` | Local preview server |

## 1. Publish on GitHub Pages (one time)

1. Create a **public** repo named `familytree` under your GitHub account (`SSSeyon`).
2. Push this folder to it (branch `main`).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. After about a minute the site is live at `https://ssseyon.github.io/familytree/`.

## 2. Backend setup (editing, sync and suggestions) — one time, about 5 minutes

Editing uses a **family passphrase** instead of GitHub tokens. A small Google Apps Script, running in your own Google account, stores the tree in your Google Drive and checks the passphrase privately. The passphrase is never in the website code. Every visitor’s app syncs from it.

1. Open <https://script.google.com> → **New project**. Name it "Family Tree backend".
2. Delete the sample code and paste in everything from [`backend/Code.gs`](backend/Code.gs). Save.
3. ⚙ **Project Settings** → **Script properties** → **Add script property**:
   - Property: `EDIT_PASSPHRASE`
   - Value: your family passphrase. Save.
4. Back in the editor, pick the `authorize` function in the toolbar and press **▶ Run**, then allow the Drive / Sheets / Gmail permissions. Google warns that the app is unverified because it is your own script: click **Advanced → Go to Family Tree backend**.
5. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (ends in `/exec`).
6. Put that URL in `config.js` → `backend: { url: "…/exec" }`, then commit and push.

That’s it:
- **Editing:** Settings → Editing → **Editor mode** → enter the passphrase. Changes, photos and voice notes save to the Drive folder **“Family Tree (website data)”** and reach everyone on their next visit. Every previous version is kept in `history/`.
- **Suggestions:** they go into a **“Suggestions”** Google Sheet in the same folder, and you get an email for each one.
- **Changing the passphrase:** edit the `EDIT_PASSPHRASE` script property. No redeploy is needed.
- **If you edit Code.gs later:** Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy. This keeps the same URL.
- **Wrong guesses:** after 10 wrong passphrases the backend locks editing for 15 minutes.

## Privacy

- The website and anything saved through it are **public to anyone with the link**: names, photos, stories, voice notes and the WhatsApp number in `config.js`. The passphrase and suggestions stay private in your Google account.
- People with no death date who were born less than 100 years ago count as **living**. Their **birth year is never published**; only the day and month show, as a birthday. The converter and the editor both strip the year before saving. Set `privacy.keepLivingBirthYears: true` in `config.js` to change this.
- The page asks search engines not to index it (`noindex`), but anyone with the link can view it.

## Updating from a new `.ftz` export (optional)

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-ftz.ps1 -Ftz "path\to\FamilyTree.ftz"
```

`data/tree.json` is only the starting copy. Once the backend is set up, the live tree lives in Google Drive, and this command does **not** change it.

## Local preview

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open <http://localhost:8080>.

## Translations

The Yoruba and Gungbe (written with Yoruba letters) text is a machine-drafted first pass and should be checked by fluent speakers. Untranslated Gungbe strings fall back to English. The text is in `js/i18n.js` (interface) and `js/relate.js` (`yoRel`, `gunRel` kinship terms).
