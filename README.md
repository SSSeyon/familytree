# Family Tree

An interactive family tree website, converted from a Quick Family Tree (`.ftz`) export. It is plain HTML, CSS and JavaScript with no build step, and is hosted free on GitHub Pages.

**What viewers get:** a zoomable tree chart (top-down or sideways), a family view centred on one person, person cards with photos, stories, oríkì and voice notes, a "How are we related?" finder, a timeline, a photo gallery, stats and birthdays, English/Yoruba, dark mode, share links, PNG/print/GEDCOM export, and a "Suggest a change" button (WhatsApp or Google Form).

**What you (the editor) get:** a built-in editor that saves straight to this GitHub repo.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app |
| `config.js` | Settings: GitHub repo, WhatsApp number, Google Form, privacy |
| `data/tree.json` | All people and families (public) |
| `photos/`, `media/` | Face photos and uploaded photos / voice notes (public) |
| `tools/convert-ftz.ps1` | Converts a `.ftz` export into `data/tree.json` + `photos/` |
| `tools/serve.ps1` | Local preview server |

## 1. Publish on GitHub Pages (one time)

1. Create a **public** repo named `familytree` under your GitHub account (`SSSeyon`).
2. Push this folder to it (branch `main`).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. After about a minute the site is live at `https://ssseyon.github.io/familytree/`.

## 2. Turn on the editor

The editor saves with a GitHub token that only you hold. The token is kept in your browser, never in the site.

1. Go to <https://github.com/settings/personal-access-tokens/new> (a fine-grained token).
2. **Repository access:** *Only select repositories* → `familytree`.
3. **Permissions → Repository permissions → Contents: Read and write.**
4. Generate the token and copy it.
5. On the site: **⋮ menu → Editor mode**. Paste the token and click Connect.

In editor mode:
- Tap a person, then ✏️ to edit their names, dates, places, oríkì, story, photo, voice notes and links.
- Use the **Relatives** buttons to add a father, mother, spouse, child or sibling, or to link someone already in the tree.
- **Save to GitHub** commits your changes, and the public site updates in about a minute.
- **Editor tools** lists data problems, unnamed people, site title and the default person.
- Unsaved edits are kept in your browser as a draft if you close the tab.

## 3. Google Form for suggestions

1. Create a Google Form, e.g. "Family tree suggestions", with these **short answer** questions: *Person*, *Person ID*, *Type*, *Your name*, *Contact*. Add a **paragraph** question: *Suggestion*.
2. In the form's **Settings → Responses**, make sure sign-in is **not** required.
3. In the **Responses** tab → ⋮ → **Get email notifications for new responses**.
4. ⋮ (top right) → **Get pre-filled link**. Type `x` in every field → **Get link** → copy it.
   The link looks like `https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&entry.111=x&entry.222=x…`.
5. In `config.js`:
   - Set `formUrl` to the same address, ending in `/formResponse` instead of `/viewform?...`.
   - Put each `entry.NNN` next to its field (person, personId, type, message, name, contact), matching the order of your questions.

Until the form is set up, the "Suggest a change" dialog offers only WhatsApp.

## Privacy

- Everything in this repo is **public**: names, photos, stories, and the WhatsApp number in `config.js`.
- People with no death date who were born less than 100 years ago count as **living**. Their **birth year is never published**; only the day and month show, as a birthday. The converter and the editor both strip the year before saving. Set `privacy.keepLivingBirthYears: true` in `config.js` to change this.
- The page asks search engines not to index it (`noindex`), but anyone with the link can view it.

## Updating from a new `.ftz` export (optional)

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-ftz.ps1 -Ftz "path\to\FamilyTree.ftz"
```

⚠️ This **replaces** `data/tree.json`, so anything added in the web editor is lost. Once you use the web editor, treat it as the main copy.

## Local preview

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open <http://localhost:8080>.

## Translations

The Yoruba interface text and kinship terms were drafted by machine and should be checked by a fluent speaker. They are in `js/i18n.js` (interface) and `js/relate.js` (`yoRel`, kinship terms).
