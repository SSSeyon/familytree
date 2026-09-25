# Family Tree

An interactive family tree website, converted from a Quick Family Tree (`.ftz`) export. It is plain HTML, CSS and JavaScript with no build step, and is hosted free on GitHub Pages.

**What viewers get:**
- A zoomable tree chart, a fan chart of forebears, and a family view centred on one person.
- "I am…": pick yourself once and every card, search result and birthday shows how that person is related to you.
- Person cards with photos, stories, oríkì and voice notes.
- A "How are we related?" finder that draws the connection as a small family tree.
- "This month": birthdays and remembrance days, with one-tap WhatsApp greetings and optional phone reminders.
- A timeline, a photo gallery and family stats.
- English, Yorùbá and Gungbe, plus light and dark mode.
- Share links; PNG, print and GEDCOM export.
- A "Suggest a change" button that sends to the editors or to WhatsApp.

**What you (the editor) get:** a built-in editor unlocked with a family passphrase. Editor tools include a tree checker that flags likely mistakes (a child born before a parent, dates after death, possible duplicates). It syncs through Firebase (free plan). The site also installs as a phone app (PWA).

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app |
| `version.js` | App version shown in Settings (`V1.7`). **Bump it on every update**; this also refreshes everyone's offline copy. |
| `config.js` | Settings: Firebase details, WhatsApp number, start person, privacy |
| `backend/firestore.rules` | Security rules to paste into Firebase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app (PWA) and offline support |
| `data/tree.json` | Starting copy of all people and families (public) |
| `photos/` | Original face photos (new uploads are stored in Firebase) |
| `tools/convert-ftz.ps1` | Converts a `.ftz` export into `data/tree.json` + `photos/` |
| `tools/serve.ps1` | Local preview server |

## 1. Publish on GitHub Pages (one time)

1. Create a **public** repo named `familytree` under your GitHub account (`SSSeyon`).
2. Push this folder to it (branch `main`).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. After about a minute the site is live at `https://ssseyon.github.io/familytree/`.

## 2. Editing & sync setup (Firebase): one time, about 10 minutes

The passphrase is the password of one Firebase user. Firebase checks it, so it never appears in the website code, and Firebase slows down repeated wrong guesses. No Google app verification is involved.

1. Go to <https://console.firebase.google.com> → **Create a project** (e.g. "azandowanu-family"). You can turn Google Analytics off. Stay on the free **Spark** plan.
2. **Build → Firestore Database → Create database** → pick a location near you → start in **production mode**.
3. In Firestore, open the **Rules** tab. Replace everything with the contents of [`backend/firestore.rules`](backend/firestore.rules), then **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
5. **Authentication → Users → Add user:**
   - Email: `editor@azandowanu.family` (it doesn't need to be a real mailbox)
   - Password: your family passphrase
6. Recommended: **Authentication → Settings → User actions** → untick **Enable create (sign-up)**, so nobody can create other accounts.
7. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app named "Family Tree" (no hosting needed). From the config it shows, copy `apiKey` and `projectId` into `config.js` → `firebase`. Then commit and push.

   These two values are meant to be public; the security rules protect the data.

That's it:
- **Editing:** Settings → Editing → **Editor mode** → enter the passphrase. Tick "Remember on this device" to stay signed in. Only a sign-in token is kept, never the passphrase.
- **Syncing:** changes, photos and voice notes reach everyone on their next visit, or when they reopen the app.
- **Backups:** every earlier version is kept in the Firestore `history` collection.
- **Suggestions:** they appear under **Editor tools → Suggestions received**. Mark each one **Done** when handled.
- **Changing the passphrase:** Authentication → Users → delete the editor user and add it again with the same email and the new passphrase.

## Privacy

- The website and anything saved through it are **public to anyone with the link**: names, photos, stories, voice notes and the WhatsApp number in `config.js`. The passphrase, the backups and the suggestions stay private in Firebase.
- People with no death date who were born less than 100 years ago count as **living**. Their **birth year is never published**; only the day and month show, as a birthday. The converter and the editor both strip the year before saving. To change this, set `privacy.keepLivingBirthYears: true` in `config.js`.
- The page asks search engines not to index it (`noindex`), but anyone with the link can view it.

## Updating the app

After changing any file, bump `APP_VERSION` in `version.js` (e.g. `1.2` → `1.3`) before pushing. Installed apps pick up the new version on their next visit. **Settings → Hard refresh** forces it straight away.

## Updating from a new `.ftz` export (optional)

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-ftz.ps1 -Ftz "path\to\FamilyTree.ftz"
```

`data/tree.json` is only the starting copy. Once Firebase is set up, the live tree lives there, and this command does **not** change it.

## Local preview

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open <http://localhost:8080>.

## Translations

The Yoruba and Gungbe (written with Yoruba letters) text is a machine-drafted first pass and should be checked by fluent speakers. Untranslated Gungbe strings fall back to English. The text is in `js/i18n.js` (interface) and `js/relate.js` (`yoRel`, `gunRel` kinship terms).
