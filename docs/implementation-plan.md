# Cover Image Picker — Implementation Plan

Status: proposal for review. Derived from `docs/scaffolding.md`, the official
`obsidian-sample-plugin`, and Obsidian API typings **v1.13.1**.

---

## 1. Verified constraints (these drive every later decision)

These were checked against `obsidian.d.ts@1.13.1`, caniuse, and the Obsidian
release/installer rules. They are the facts the architecture has to bend around.

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | **There is no public API for the Properties editor.** No `registerPropertyWidget`, no `metadataTypeManager` typing, nothing. The only property-adjacent public surfaces are `FileManager.processFrontMatter`, `MetadataCache.getFileCache().frontmatter`, `getFrontMatterInfo()`, and `parseFrontMatter*()` helpers. | grep of `obsidian.d.ts` for `PropertyWidget\|registerProperty\|metadataTypeManager` → 0 hits | Any UI attached to a property row is **DOM-level integration against internal class names**. This is the top maintenance risk and must be quarantined in exactly one adapter module with feature-detection and silent degradation. |
| F2 | **Safari / iOS Safari have never supported `canvas.toBlob(…, 'image/webp')`** — not in any version through Safari 27 / iOS 26.5. | caniuse `mdn-api_htmlcanvaselement_toblob_type_parameter_webp` | Obsidian iOS runs WKWebView, so **native WebP encoding is impossible on the primary target platform.** WebP on iOS requires a bundled WASM encoder. See decision D1. |
| F3 | **Obsidian only installs `main.js`, `manifest.json`, `styles.css`.** No other release asset is downloaded. | Obsidian release guidelines | A WASM encoder cannot ship as a sidecar `.wasm` file. It must be **inlined as base64 inside `main.js`** (or fetched at runtime, which violates the "offline by default" developer policy). |
| F4 | **There is no API to add items to the mobile toolbar.** | grep `toolbar` in `obsidian.d.ts` → only Bases-related hits | But: Obsidian's own mobile toolbar is **user-configurable with any registered command** (Settings → Mobile → Manage toolbar options). Registering a command gives us a native bottom-toolbar button *for free*, with zero internal-DOM coupling. This is the single most important lever for the mobile UX. |
| F5 | `editor-drop` fires for the **CodeMirror editor surface only**. The properties container is rendered outside CM's content DOM in Live Preview. | `Workspace.on('editor-drop')` signature + MarkdownView layout | Desktop drag-and-drop onto a property row needs **our own `dragover`/`drop` listeners on the property element**, not `editor-drop`. We still register `editor-drop`/`editor-paste` as a secondary path for source mode. |
| F6 | `processFrontMatter(file, fn, options)` is atomic read-modify-write and can throw `YAMLParseError`. | `obsidian.d.ts:2954` | This is the only sanctioned write path. Never hand-edit YAML text. Always wrap in try/catch and surface a safe `Notice`. |
| F7 | `FileManager.getAvailablePathForAttachment(filename, sourcePath)` exists and honours the user's attachment settings. `Vault.createBinary(path, ArrayBuffer)` writes the file. `FileManager.generateMarkdownLink()` produces a link honouring the vault's link-format settings. | `obsidian.d.ts:2967, 7396, 2931` | Use all three; do not reimplement path or link logic. |
| F8 | `Platform.isIosApp / isMobileApp / isPhone / isDesktopApp` are public. | `obsidian.d.ts:4823` | Clean platform branching without UA sniffing. |
| F9 | **Measured, not assumed.** The general WebKit rule is that `input.click()` must run inside the user-gesture call stack. **On Obsidian iOS this turned out to be lenient**: the picker opened both synchronously *and* after `await Promise.resolve()` + `await setTimeout(…, 0)`. WebKit propagates gesture through short timers, and file inputs are gated less strictly than popups/fullscreen. | probe run, 2026-08-17 | We have slack, but it is undocumented, time-bounded and could tighten in any Apple or Obsidian update. **Treat "no `await` before `click()`" as cheap discipline rather than a hard constraint**, and keep the hard rule where it is actually load-bearing: *never put a modal or menu between the tap and the picker.* See §6. |
| F10 | **Confirmed on device:** focusing a property in Live Preview shows only the system keyboard — no Obsidian toolbar. The toolbar *does* appear in source mode. | user testing, 2026-08 | The native toolbar (F4) covers source mode completely and Live Preview not at all. Live Preview needs its own affordance. |
| F11 | Obsidian's **Settings → Editor → Properties in document** has `Visible` / `Hidden` / `Source`. Under `Hidden`/`Source` there is no property row to attach to. | Obsidian settings | The DOM-based affordance can be absent through no fault of ours. The command path must be able to do everything on its own. |

### Phase 0 probe results — all questions closed (2026-08-17)

Run via `probes/` on desktop and iOS.

| Question | Result | Effect on the plan |
|---|---|---|
| **Q2 — EXIF orientation** | **Applied on both platforms, on all three decode paths** (32×64, red on top). | No EXIF parser needed. Drops ~40 LOC and half a day from Phase 1a, and removes a whole risk class. `core/decode.ts` just picks a path. |
| **WebP encode (D1)** | **Desktop yes, iOS no** — exactly as F2 predicted. | D1's JPEG fallback confirmed on real hardware, not just caniuse. The capability probe works and is the right shape. |
| **F9 — gesture** | **Both sync and async opened the picker on iOS.** Prediction was wrong. | Constraint downgraded, design unchanged — see F9 and §6. |
| **D2 — YAML round-trip** | **All six values round-tripped**, including wikilinks, spaces, `#` and non-ASCII. | D2 stands. Wikilink stays the default. |

**One thing still worth reading off the output you already have:** did the
`frontmatterLinks` section list the wikilink rows, or was it empty? That decides
whether renaming an image auto-updates the property — a README-worthy feature if
yes. It does not block any code.

---

## 2. Architecture

**Ports-and-adapters, with a pure core.** The rationale is not dogma — it is F1
and F2. The two things most likely to break (Obsidian's internal property DOM,
and the image encoder) are the two things that must be swappable and the two
things that must *not* be entangled with the business logic.

```
┌─ triggers (adapters, platform-specific, DOM-coupled) ─────────────┐
│  PropertyDomAdapter   DragDropTrigger   CommandTrigger            │
└──────────────────────────┬────────────────────────────────────────┘
                           │ ImageInsertRequest { file, propertyKey, note }
┌──────────────────────────▼────────────────────────────────────────┐
│  InsertionPipeline (orchestrator, thin, async, cancellable)       │
└──┬──────────┬──────────┬──────────┬──────────┬────────────────────┘
   │          │          │          │          │
┌──▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌──▼──────────┐
│Valid-│ │ Decoder │ │Resizer │ │ Encoder │ │ Namer       │  ← pure, unit-tested
│ator  │ │         │ │        │ │ (port)  │ │             │
└──────┘ └─────────┘ └────────┘ └────┬────┘ └─────────────┘
                                     │
                         ┌───────────┴───────────┐
                    NativeCanvasEncoder    WasmWebpEncoder
                    (desktop, fast)        (iOS, lazy-loaded)
┌───────────────────────────────────────────────────────────────────┐
│  VaultPort  — createBinary / getAvailablePathForAttachment        │
│  FrontmatterPort — processFrontMatter / generateMarkdownLink      │
└───────────────────────────────────────────────────────────────────┘
```

**Rules:**
- `core/` imports **nothing** from `obsidian`. It is testable in plain vitest.
- Every `obsidian` import lives in `obsidian/` (ports) or `ui/` (adapters).
- One module owns internal CSS selectors: `obsidian/property-dom.ts`. If
  Obsidian changes its DOM, exactly one file breaks and it fails soft.

---

## 3. Module map

Target: no file over ~250 LOC (hard cap 500 per house rules).

```
src/
  main.ts                        ~70   lifecycle only: load settings, wire triggers, register command
  settings/
    schema.ts                    ~90   interfaces + DEFAULT_SETTINGS + migration by schemaVersion
    validate.ts                  ~80   runtime coercion of loaded data (never trust data.json)
    tab.ts                       ~220  PluginSettingTab UI
    folder-suggest.ts            ~60   AbstractInputSuggest<TFolder> for the folder picker
  core/                          ← zero obsidian imports, 100% unit-tested
    types.ts                     ~70   ImageInsertRequest, ProcessedImage, ResizeSpec, EncodeResult
    frontmatter-scan.ts          ~90   cursor-offset → property key (source mode); pure, testable
    validate-source.ts           ~90   size cap, MIME allowlist, magic-byte sniff
    decode.ts                    ~90   Blob → ImageBitmap|HTMLImageElement, orientation handling
    resize.ts                    ~110  cover/contain/stretch math + two-step downscale; pure fn + canvas fn
    naming.ts                    ~120  template tokens, filename sanitisation, collision suffixes
    link-format.ts               ~70   wikilink | markdown | plain path; YAML-safe value
    errors.ts                    ~50   typed error taxonomy with user-safe messages
    pipeline.ts                  ~150  orchestration; takes ports as constructor args
  encode/
    port.ts                      ~30   interface ImageEncoder { supports(fmt), encode(canvas, opts) }
    native-canvas.ts             ~90   toBlob + one-time capability probe
    wasm-webp.ts                 ~110  lazy dynamic import + instantiate; Phase 2
    select-encoder.ts            ~60   platform/capability-based selection
  obsidian/
    vault-port.ts                ~90   write file, ensure folder, resolve target folder
    frontmatter-port.ts          ~110  read current value, write value, wikilink generation
    property-dom.ts              ~180  ⚠ the ONLY file with internal selectors; MutationObserver
    focus-tracker.ts             ~60   records last-focused matching property (§6 chain step 2)
  ui/
    insert-button.ts             ~90   the inline icon injected into a matching property row
    file-picker.ts               ~80   persistent hidden <input type=file>, iOS-safe accept list
    property-suggest.ts          ~80   SuggestModal for ambiguous targets (§6 chain steps 4–5)
    progress.ts                  ~50   Notice-based progress + cancel
    confirm-replace.ts           ~70   Menu/Modal shown when property already has a value
  triggers/
    resolve-target.ts            ~110  the §6 resolution chain; steps 1–3 synchronous
    command.ts                   ~70   addCommand → mobile toolbar in source mode + palette (F4/F10)
    drag-drop.ts                 ~110  dragover/drop on property rows + editor-drop fallback
    paste.ts                     ~70   editor-paste (Phase 3)
tests/
  core/*.test.ts                       resize math, naming, link format, validation
  fixtures/                            tiny synthetic images
styles.css                             all plugin CSS; no inline styles (lint rule)
```

---

## 4. Settings schema

```ts
interface CoverImagePickerSettings {
  schemaVersion: 1;

  // Scope — the "do not do" guardrail from the spec
  propertyNames: string[];          // default: ['cover', 'banner']
  matchMode: 'exact' | 'prefix';    // default: 'exact'
  caseSensitive: boolean;           // default: false

  // Storage
  storage: {
    mode: 'vault-root' | 'fixed-folder' | 'note-folder' | 'obsidian-attachments';
    fixedFolder: string;            // used when mode === 'fixed-folder'
    createFolderIfMissing: boolean; // default: true
  };

  // Naming
  naming: {
    template: string;               // default: '{{noteName}}_{{property}}'
    onCollision: 'suffix' | 'overwrite' | 'ask';  // default: 'suffix'
  };

  // Resize
  resize: {
    mode: 'none' | 'width' | 'height' | 'box';
    width: number | null;           // default 1600
    height: number | null;          // default 900
    fit: 'cover' | 'contain' | 'stretch';   // only meaningful for 'box'
    allowUpscale: boolean;          // default: false
  };

  // Encoding
  encode: {
    format: 'webp' | 'jpeg' | 'png';   // MVP: 'webp'
    quality: number;                   // 1–100, default 75
    maxSourceBytes: number;            // default 25_000_000 — hard guard
  };

  // Output
  link: {
    format: 'wikilink' | 'markdown' | 'path';  // default 'wikilink'
    pathStyle: 'shortest' | 'relative' | 'absolute';
  };

  // Behaviour
  replaceExisting: 'ask' | 'always' | 'never';  // default 'ask'
  deleteReplacedFile: boolean;                  // default: false — destructive, opt-in
}
```

**Loading must be defensive.** `data.json` is user-writable and sync-corruptible.
`settings/validate.ts` coerces every field, clamps every number to range, drops
unknown keys, and falls back to defaults per-field rather than wholesale. A
corrupt `maxSourceBytes` must not become an unbounded allocation.

---

## 5. The insertion pipeline

Single async function, one code path for every trigger. Each stage fails with a
typed error that maps to a user-safe `Notice` string; internals go to
`console.error` only.

1. **Resolve target.** Note `TFile` + property key. Reject if the key is not in
   `propertyNames` (this *is* the scope guardrail — enforced in the pipeline, not
   only in the UI, so no trigger can bypass it).
2. **Validate source.** `file.size <= maxSourceBytes`; MIME in allowlist;
   **magic-byte sniff** of the first 12 bytes rather than trusting `file.type` or
   the extension. Reject SVG outright (XSS vector via foreign content; also
   pointless for a raster pipeline).
3. **Decode.** `createImageBitmap(blob, { imageOrientation: 'from-image' })`,
   verified by probe to apply EXIF orientation on both platforms. Keep the
   `HTMLImageElement` + object-URL path as a fallback (also verified) for older
   webviews. **No manual EXIF handling is required** — probe result, Q2. Wrap in
   a timeout, and always `bitmap.close()` / `URL.revokeObjectURL()` in `finally`
   — iOS webviews are memory-tight and leaked bitmaps will kill the app.
4. **Resize.** Pure geometry function `computeTargetSize(src, spec) → {w,h,crop}`
   — fully unit-testable, no DOM. Then draw. Downscales beyond 2× go through
   iterative halving (single-step large downscale is visibly aliased in WebKit).
5. **Encode.** Via the `ImageEncoder` port. See D1.
6. **Name.** Render template → sanitise (strip `/ \ : * ? " < > |` and control
   chars, collapse whitespace, NFC-normalise, cap at 100 chars, reject `.`/`..`)
   → append extension → resolve collisions.
7. **Store.** Resolve folder per `storage.mode`, `normalizePath()`, create folder
   if needed, `vault.createBinary()`. **Assert the final path is inside the
   intended folder after normalisation** — this is the path-traversal check, and
   it belongs here rather than only in the sanitiser.
8. **Link.** Build the YAML value (wikilink strings must be emitted such that
   Obsidian's YAML serialiser quotes them; verify `cover: "[[img.webp]]"` round-
   trips) and write via `processFrontMatter`.
9. **Cleanup.** If replacing and `deleteReplacedFile` is on, trash the old file
   via `fileManager.trashFile()` (respects the user's trash preference) — never
   `vault.delete()`.

**A nice free win:** canvas re-encoding strips all EXIF, including GPS
coordinates. Worth stating in the README — it is a genuine privacy benefit of
this design, not an accident.

---

## 6. UI/UX design

### The constraints that determine the design

**F10 (no toolbar in Live Preview):** the native toolbar covers source mode only.
This one is hard and confirmed on device.

**F9 (gesture):** measured as *lenient* on Obsidian iOS — the picker opened even
after two async hops. So this no longer forces the design. It still shapes it,
for two reasons: the leniency is undocumented and could tighten, and a *modal or
menu* between the tap and the picker is a different and much longer-lived
interruption than a 0 ms timer. The rule we keep is the narrow one:

> **Never put a modal or a menu between the tap and `input.click()`.**
> Short awaits are fine. Anything that waits on the user is not.

### Principle: file first, target second

```
tap  ──►  open picker  ──►  user picks photo  ──►  resolve target,
 │        (no modal may                            ask only if ambiguous,
 │         come before this)                       process, write
 └─ pre-resolve the likely target (steps 1–3 are synchronous anyway)
```

Note this is now kept **because it is the better UX**, not because iOS forces it:
choosing the photo is the user's actual intent, and confirming the destination is
the rare path. It also keeps us on the safe side of F9 for free, so there is no
reason to trade it away. Pre-resolution steps 1–3 below are synchronous reads
(cursor, metadata cache, in-memory), so they cost nothing before the picker
opens; only the ambiguous cases need a modal, and by then no gesture is in play.

### Three doors, one pipeline

| Door | Where it works | Target known? |
|---|---|---|
| **1. Inline button** in the property row | Live Preview, desktop + mobile | yes, implicitly |
| **2. Command** `Insert cover image` | everywhere — mobile toolbar (source mode), command palette, desktop hotkey | resolved by the chain below |
| **3. Drag & drop** onto the property row | desktop Live Preview | yes, implicitly |

Door 2 is the backbone, not the fallback. It is the only door that survives F11
(properties hidden), F10 (source mode) and F1 (Obsidian changes its internal
DOM). **Build Door 2 first, then Door 1.** If the DOM adapter ever breaks, the
plugin degrades to command-only and stays fully functional.

### Target resolution chain (Door 2)

Tried in order, all of 1–3 synchronous:

1. **Source-mode cursor.** If the cursor sits inside the frontmatter block
   (offsets from `getFrontMatterInfo()`), read the key from the cursor line;
   walk up to the nearest top-level key if the cursor is on a nested list item.
   Reliable because tapping the mobile toolbar preserves editor focus — which is
   exactly the source-mode case F10 hands us.
2. **Last-focused property.** A `focusin` listener on matching property inputs
   records `{path, key, timestamp}` with a ~120 s TTL. This is what makes the
   command feel context-aware in Live Preview: tap the `cover` field, open the
   command palette (which blurs the field), run the command — we still know.
3. **Sole match.** Exactly one configured property present in the note's
   frontmatter → use it. Covers most real notes.
4. **Multiple matches** → `SuggestModal` listing them with their current values.
5. **No match** → create it: one configured name → use it silently; several →
   suggester of configured names.

`checkCallback` only checks "is there an active markdown file" — keep it cheap,
it runs on every palette keystroke. Steps 4–5 discovering nothing valid simply
ends in a `Notice`; nothing has been written at that point.

### Door 1 — the inline button

A single icon (lucide `image-plus`) appended to `.metadata-property` rows whose
key matches. Details that matter more than they look:

- **No focus required.** The user does not tap into the field first — which
  sidesteps F10 entirely rather than fighting it.
- **Must not focus the input.** `preventDefault()` on `mousedown`/`touchstart`
  suppresses focus (no keyboard flash), while `click` still fires and still
  carries the gesture. Binding the picker to `click` keeps F9 satisfied.
- **44×44 pt hit area** (iOS HIG) via padding on a ~16 px icon; property rows are
  only ~28 px tall, so the hit area must exceed the visual.
- **Adaptive action.** Empty property → open the picker directly (one tap).
  Property already has a value → open a `Menu` with *Replace* / *Remove* /
  *Reveal file*. The menu is safe under F9: tapping a menu item is itself a fresh
  user gesture, provided the item callback calls `input.click()` synchronously.
- Desktop may hide it until row hover; mobile always shows it.

### What we deliberately do *not* build

**A custom floating bar above the keyboard.** It was the literal reading of the
spec ("menu on the bottom"), and it is the wrong call: `visualViewport` maths in
WKWebView, competing with the iOS accessory bar, show/hide jank, and a bar that
looks like Obsidian's toolbar but isn't — permanent maintenance cost for an
affordance the inline button already provides with none of it. The properties
block sits at the *top* of the note, so an inline button is never covered by the
keyboard anyway. Revisit only if device testing shows the inline button is
genuinely hard to hit.

### Picker mechanics

One persistent hidden `<input type="file">` owned by the plugin, `value` reset
before each open — not a fresh detached element per invocation. Rationale: iOS
fires no reliable "cancelled" event, so per-invocation elements leak. Reuse
sidesteps the whole problem, and `onunload` removes the one element.

`accept="image/jpeg,image/png,image/webp,image/gif"` — an **explicit list, not
`image/*`** — maximises the chance iOS transcodes HEIC to JPEG on selection. If
a HEIC still arrives, detect by magic bytes and show an actionable notice
("Set iPhone Settings → Camera → Formats to Most Compatible") rather than
bundling a 1.5 MB HEIC decoder. No `capture` attribute in MVP (gallery only);
adding `capture="environment"` later is a one-line camera path.

### Feedback

`Notice` for progress on anything over ~300 ms, `Notice` on success naming the
file, and a brief `.cip-just-updated` highlight animation on the property row.
Errors surface as short user-safe notices; details go to `console.error` only.

---

## 7. Trigger implementation notes

### Desktop — drag & drop (F5)
`property-dom.ts` observes the metadata container and, for each row whose key
matches, attaches `dragenter/dragover/dragleave/drop` (via
`Component.registerDomEvent` so unload is clean). `dragover` must
`preventDefault()` and set `dropEffect = 'copy'` or the drop never fires. Add a
`.cip-drop-active` class for the hover affordance; all styling in `styles.css`.

Secondary: `workspace.on('editor-drop')` for source mode, where the frontmatter
is plain text. Check `evt.defaultPrevented` first and only claim the event when
the cursor is genuinely inside a matching frontmatter key — otherwise return and
let Obsidian handle it. **Not claiming events we do not own is the entire "do not
alter general edit behaviour" requirement.**

### Mobile — the command *is* the source-mode toolbar button (F4 + F10)
Register `cover-image-picker:insert-cover-image`. The user adds it to the native
mobile toolbar in Settings → Mobile → Manage toolbar options. Because the
toolbar is present in source mode (F10), this satisfies the spec's "on source
mode a new icon needs to be added to the menu" natively — no toolbar hacking, no
internal coupling, survives Obsidian updates.

In Live Preview, where no toolbar appears (F10), the same command is reachable
from the command palette and resolves its target via the chain in §6. The inline
button (Door 1) is the primary Live Preview affordance.

Per F9 the command callback does not strictly need to call `input.click()` before
any `await` — but keep it early anyway, and never gate it behind a modal. Add a
short comment at that line so a later refactor does not "helpfully" insert a
confirmation dialog there.

---

## 8. Decisions

### D1 — WebP on iOS → **RESOLVED: JPEG fallback** (user decision, 2026-08)

F2 makes native WebP impossible on iOS; the alternative was inlining a 281 KB
WASM encoder as base64 (`main.js` 30 KB → ~420 KB). Decided against.

Ship `encode/native-canvas.ts` with a one-time capability probe
(`canvas.toDataURL('image/webp').startsWith('data:image/webp')`), cached for the
session. Desktop gets real WebP; iOS transparently gets JPEG at the same quality
setting. Setting label: **"WebP (falls back to JPEG on iOS)"** — with a short
description, because a user comparing files across devices will otherwise think
it is a bug.

The `ImageEncoder` port still ships in Phase 1. It costs ~30 LOC and keeps the
WASM option a two-file change if the ~20–30 % size difference ever proves to
matter. `encode/wasm-webp.ts` stays out of the tree until then.

### D2 — Frontmatter value format
Default to `wikilink` (`cover: "[[assets/note_cover.webp]]"`), because the banner
and cover plugins this feeds (Banners, Pixel Banner, Obsidian Banner) all accept
wikilinks, and Obsidian resolves them (`frontmatterLinks` exists in
`CachedMetadata`, so renames update automatically). Offer `markdown` and `path`
for other consumers. **Verify the YAML round-trip early** — an unquoted
`[[x]]` parses as a nested sequence and would silently corrupt the property.

### D3 — Do not touch `metadataTypeManager` or `MarkdownView.metadataEditor`
Both are internal. Everything we need is reachable through the public API plus
read-only DOM observation. Cast-to-`any` access to Obsidian internals is the
most common reason plugins break on updates and it is also flagged in review by
`eslint-plugin-obsidianmd`.

### D4 — `isDesktopOnly: false`, `minAppVersion`
Set `minAppVersion` to the oldest version whose property DOM we actually verify
against — suggest `1.4.0` (when Properties shipped) only if tested there;
otherwise be honest and set the version you test on.

---

## 9. Security checklist (mapped to the house rules)

- **Input validation:** size cap, MIME allowlist, magic-byte sniff, dimension cap
  (reject > 100 MP to prevent decompression-bomb OOM), reject SVG.
- **Path traversal:** sanitise filename *and* re-assert containment of the
  resolved path after `normalizePath`. Two independent checks.
- **Output encoding:** all DOM built with `createEl`/`createDiv`/`setText`; never
  `innerHTML`. No user string ever reaches HTML.
- **Least privilege:** no network calls at all — the plugin is 100 % offline and
  should say so in the README. No `requestUrl`, no remote code, no telemetry.
- **Secrets:** none exist; nothing to store.
- **Destructive ops:** deleting a replaced image is opt-in and uses
  `trashFile()`. Overwrite-on-collision is opt-in; default is suffix.
- **Error handling:** typed errors → short user-safe `Notice`; stack traces only
  to `console.error`. No file paths of other users' vaults in messages.
- **Cleanup:** every listener via `registerDomEvent`/`registerEvent`, every
  observer disconnected in `onunload`, every object URL revoked, every
  `ImageBitmap` closed.
- **Sentry:** the house rule for Sentry handover **does not apply here** —
  Obsidian's developer policy prohibits undisclosed telemetry, and shipping an
  error reporter in a community plugin would fail review. Errors go to the
  console and to the user. Flagging this explicitly as a deliberate deviation.

---

## 10. Testing

The sample plugin ships no test runner. Add **vitest + jsdom**, with an
`obsidian` alias to a hand-written stub (`tests/stubs/obsidian.ts`) so the few
port tests can run headless.

**Unit (the valuable ones — all pure, all in `core/`):**
- `resize.ts` — cover/contain/stretch for portrait, landscape, square, extreme
  aspect ratios; upscale-disabled behaviour; width-only and height-only modes.
- `naming.ts` — every token; unicode; path separators; reserved names; length
  cap; collision suffixing; idempotence.
- `link-format.ts` — all three formats; YAML quoting of wikilinks; spaces and
  `#`/`|` in filenames.
- `validate-source.ts` — magic bytes for JPEG/PNG/WebP/GIF/HEIC; oversize;
  spoofed extension.
- `settings/validate.ts` — corrupt/partial/hostile `data.json`.
- `frontmatter-scan.ts` — cursor on a key line, on a nested list item, on the
  `---` fences, outside the block entirely, in a note with no frontmatter.
- `resolve-target.ts` — each step of the chain, and that steps 1–3 never await.

Clean resets: no module-level mutable state anywhere in `core/`; the pipeline
takes its ports as arguments, so each test constructs its own.

**Manual matrix (must run before release):** desktop Live Preview drop, desktop
source mode, iOS source mode via toolbar, iOS Live Preview via inline button,
iOS Live Preview via command palette (verifies the focus-tracker step), iPad,
portrait photo from the real camera (Q2 was proven with a synthetic fixture
only — this is the ground-truth cross-check), 12 MP photo memory behaviour, note in
subfolder, filename with spaces/unicode, property already populated, properties
set to `Hidden` in Obsidian settings (F11), property-DOM adapter disabled (F1
degradation), plugin disable/enable leaves no listeners.

**Gate before handoff:** `npm run build` (tsc noEmit) + `npm run lint` +
`npm test`, all clean.

---

## 11. Tooling deltas from the sample plugin

Keep: esbuild config (add `format: 'cjs'` externals as-is), tsconfig strict
settings (`noUncheckedIndexedAccess` is on — good, keep it), the eslint config
with `eslint-plugin-obsidianmd`, the release workflow, `version-bump.mjs`.

Add:
- `vitest` + `jsdom` + `tests/stubs/obsidian.ts`, `npm test` script.
- `"test": "vitest run"` wired into the lint CI workflow.
- `styles.css` populated (sample's is empty).
- Prettier config matching the sample's tab indentation, if you want formatting
  enforced.

Rewrite `manifest.json`: `id: "cover-image-picker"`, `isDesktopOnly: false`.
Never change `id` after the first release.

---

## 12. Phasing

Build order follows the doors: **command before inline button**, because the
command has no internal-DOM dependency and proves the whole pipeline on the
hardest platform first.

**Phase 0 — ✅ DONE (2026-08-17).** Probes in `probes/` run on desktop and iOS;
results and their consequences are in §1. Net effect: no EXIF parser needed,
JPEG fallback confirmed, wikilink default confirmed, gesture risk downgraded.
Remaining Phase 0 work is only the scaffold itself — copy the sample, rename,
add vitest, confirm a hello-world plugin loads on both platforms.

**Phase 1a — Pipeline + command, iOS-first (1 day).** Settings → `core/` →
ports → `ui/file-picker.ts` → `triggers/command.ts` with the full target
resolution chain. No property DOM yet. **Acceptance: on iOS in *source* mode,
with the command on the mobile toolbar, tap it, pick a photo, and get a resized,
renamed, linked image in the configured folder.** This validates F9, the whole
image pipeline, and the frontmatter write before any fragile code exists.

**Phase 1b — Inline property button (1 day).** `obsidian/property-dom.ts` +
`ui/insert-button.ts`. **Acceptance: on iOS in Live Preview, tap the button on a
`cover` row and get the same result with no keyboard flash — and with the
adapter forcibly disabled, the command path still works.** That second half is
the F1 mitigation and should be an explicit test, not an assumption.

**Phase 2 — Desktop drag & drop (1 day).** `drag-drop.ts` + drop affordance +
`editor-drop` source-mode path. Acceptance: dropping onto a non-matching
property or the note body behaves exactly as stock Obsidian.

**Phase 3 — Polish (1–2 days).** Camera capture (`capture` attribute); paste
handling; replace/remove menu; PNG/JPEG format choice; per-property overrides.
WASM WebP only if D1 is ever revisited.

**Phase 4 — Release.** README with a screenshot and an explicit "no network, no
telemetry, EXIF stripped" statement, `versions.json`, tagged release with the
three assets, community-plugin submission PR.

---

## 13. Top risks

1. **Internal property DOM changes** (F1). Mitigation: one adapter file, feature
   detect, degrade to command-only rather than throwing. A missing button is
   acceptable; a broken editor is not.
2. **iOS memory on large photos.** Mitigation: dimension cap, iterative
   downscale, explicit bitmap disposal, no retained originals.
3. **HEIC arriving undecodable.** Mitigation: explicit `accept` list, magic-byte
   detection, actionable message. Do not bundle a HEIC decoder.
4. **Scope creep into general edit behaviour** — the explicit "do not do".
   Mitigation: the property-name check lives in the pipeline, and every event
   handler returns early unless it owns the event.
5. **Silent iOS gesture breakage** (F9) — *downgraded by the probe, not
   eliminated.* Obsidian iOS tolerated async today; Apple or Obsidian could
   tighten it, and the failure mode is "tapping does nothing" with no error.
   Mitigation: keep the click in one small function, never gate it behind a
   modal, and keep "iOS picker opens" in the manual matrix so a regression is
   caught by testing rather than by users.
