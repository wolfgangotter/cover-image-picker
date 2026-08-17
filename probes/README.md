# Phase 0 probes

Throwaway diagnostics for the two open questions in
`docs/implementation-plan.md`, plus a free confirmation of F9. **Not part of
the plugin**; delete after Phase 0 or keep for regression checking against
future Obsidian versions.

`probe-plugin/main.js` is hand-written CommonJS — **no build step, no npm
install**. Obsidian loads it as-is.

## Install

```bash
cp -r probes/probe-plugin "<Vault>/.obsidian/plugins/cip-probe"
```

Then **Settings → Community plugins → Reload plugins**, and enable
**CIP Probe (throwaway)**. Community plugins must be turned on (Safe mode off).

For iOS: put it in a synced vault (Obsidian Sync / iCloud) and enable it on the
phone, or use the Files app to copy the folder into
`<Vault>/.obsidian/plugins/cip-probe/`. Note that `.obsidian` is hidden — in the
Files app you may need a vault whose folder you can reach.

All five commands are in the command palette under **CIP probe:**. Results open
in a selectable modal, because there is no console on iOS without a Mac.

---

## Check 1 — EXIF orientation (Q2)

**The question.** iPhone photos are almost never stored upright. A portrait shot
is stored landscape with an EXIF `Orientation` tag telling the decoder to rotate
it. If the WKWebView inside Obsidian iOS ignores that tag when we draw to a
canvas, **every portrait cover image comes out sideways** — and our resize maths
also gets the aspect ratio backwards, so `cover` cropping picks the wrong axis.
It is a two-line fix if we know, and a confusing bug report if we don't.

**How it's tested.** `exif-orientation-6.jpg` is a deterministic 8×8-block
fixture, embedded in the probe as base64:

- stored 64×32 — **left half red, right half blue**
- `EXIF Orientation = 6` = "rotate 90° clockwise to display correctly"
- rotating 90° CW maps the left edge to the top edge

So a decoder that honours the tag must report **32×64 with RED on top**. One
that ignores it reports **64×32**. The dimensions alone are unambiguous — no
eyeballing.

The probe runs three decode paths, because they do not all behave the same:

| Path | What it is |
|---|---|
| A | `<img>` + `decode()` + `drawImage` |
| B | `createImageBitmap(blob, { imageOrientation: 'from-image' })` |
| C | `createImageBitmap(blob)` with no options (spec default has changed over time) |

**Run it.** Command palette → **CIP probe: EXIF orientation (Q2)**. Run on
desktop *and* on iOS and compare.

**Reading the result.**

- All three say `ORIENTATION APPLIED` → nothing to do; use path A or B.
- Path B fails or says `orientation IGNORED`, path A applied → **use path A**
  (`<img>`), and say so in a comment in `core/decode.ts`.
- Everything says `orientation IGNORED` on iOS → we must parse the EXIF
  orientation ourselves (~40 lines: scan APP1, read tag `0x0112`) and apply the
  matching canvas transform in `core/resize.ts`. Budget half a day and add it to
  Phase 1a.

The probe also reports whether `canvas.toDataURL('image/webp')` works — that is
the exact capability probe `encode/native-canvas.ts` will ship, so you get to
confirm D1's JPEG fallback fires correctly on your actual device rather than
trusting caniuse.

**Cross-check with a real photo.** The fixture is synthetic. Also take a real
portrait photo with the iPhone camera and run it through once the Phase 1a
pipeline exists — that is the ground truth the fixture only approximates.

---

## Check 2 — YAML frontmatter round-trip (D2)

**The question.** We plan to write `cover: "[[assets/cover.jpg]]"` via
`processFrontMatter`. If Obsidian's YAML serialiser writes it **unquoted**, then
`[[assets/cover.jpg]]` is valid YAML flow syntax for *a list containing a list* —
so the property silently becomes nested garbage, changes type in the Properties
UI, and the banner plugin downstream sees nothing. This is the kind of failure
that looks fine in the editor and is wrong on disk.

Secondary questions the same probe answers:

- Do spaces, `#` and non-ASCII characters in filenames survive?
- Does Obsidian populate `frontmatterLinks` for our value? That is what makes
  **renaming the image update the property automatically** — a significant UX
  win, and it decides D2's default in favour of wikilinks.

**Run it.** Open a **scratch note** (it writes six `cipProbe*` keys into the
active file), then command palette → **CIP probe: YAML frontmatter round-trip
(D2)**. Then **CIP probe: clean up YAML probe keys**.

It writes six values, reads the file back off disk, and shows you the literal
YAML plus what the metadata cache parsed:

| Key | Value | What it tells you |
|---|---|---|
| `cipProbePlain` | `assets/cover.jpg` | baseline, no special chars |
| `cipProbeWiki` | `[[assets/cover.jpg]]` | **the one that matters** |
| `cipProbeWikiSpace` | `[[assets/my cover.jpg]]` | spaces in filenames |
| `cipProbeWikiHash` | `[[assets/cover #1.jpg]]` | `#` — a YAML comment char |
| `cipProbeMarkdown` | `![](assets/my%20cover.jpg)` | the markdown link option |
| `cipProbeUnicode` | `[[assets/Übergröße_cover.jpg]]` | non-ASCII, NFC/NFD |

**Reading the result.**

- Raw YAML shows `cipProbeWiki: "[[assets/cover.jpg]]"` (quoted) and every row
  says `OK round-trip` → D2 stands as written, default to wikilinks.
- Any row says `*** MISMATCH ***`, or the raw YAML is unquoted → `core/link-
  format.ts` must quote defensively itself, and that case becomes a unit test.
- `frontmatterLinks` lists the wikilink rows → rename-tracking works; keep
  wikilink as the default and mention it in the README as a feature.
- `frontmatterLinks` is empty → wikilinks are inert here; reconsider whether
  plain path is the better default.

Also worth doing once by hand: open the scratch note in **source mode** after
running the probe and look at the actual characters, and check the Properties UI
hasn't retyped anything to "List".

---

## Bonus — F9, the user-gesture rule

Two commands, best run from the **mobile toolbar** on iOS (add them in
Settings → Mobile → Manage toolbar options):

- **CIP probe: file picker SYNC** — calls `input.click()` immediately. Should
  open the photo picker.
- **CIP probe: file picker ASYNC** — `await`s twice first. On WebKit this is
  expected to do **nothing at all**, silently. The Notice still fires, so you can
  tell the command ran and the picker simply refused.

If SYNC opens and ASYNC doesn't, F9 is confirmed inside Obsidian's own webview
and the "file first, target second" flow in §6 of the plan is mandatory rather
than precautionary. The SYNC command also reports the picked file's reported
MIME type and size — run it on a **photo taken with the iPhone camera** to see
whether iOS hands us `image/jpeg` (transcoded, good) or `image/heic` (which we
cannot decode, and which drives the notice text in §7).
