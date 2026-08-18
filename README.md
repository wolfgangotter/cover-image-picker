# Cover Image Picker

Pick, resize and store cover images straight from a note's YAML frontmatter
properties — including on iOS, where Obsidian offers no way to get an image into
a property at all.

> Status: **Phases 1a, 1b and 2 built** — command, inline property button, and
> desktop drag & drop. Camera capture and paste are still to come. See
> `docs/implementation-plan.md`.

## What it does

Choose a photo, and the plugin resizes it, re-encodes it, names it by a
template, saves it where you asked, and writes the link into the property — in
one step.

- **Scoped by design.** Only the property names you configure (`cover`, `banner`
  by default) are ever touched. Nothing about normal editing changes.
- **Works on iOS.** WebP cannot be encoded in WebKit, so iOS transparently falls
  back to JPEG at the same quality setting.
- **Strips EXIF.** Re-encoding through a canvas drops all metadata, including
  GPS coordinates, as a side effect of how the image is processed.
- **Offline.** No network requests, no telemetry, no external services.

## Use it

Run **Insert cover image** from the command palette. On mobile, add it to the
toolbar in **Settings → Toolbar** — it then works in source mode exactly like
the built-in image button.

The command works out which property to write to:

1. the property your cursor is in, if you are editing frontmatter in source mode
2. the only configured property in the note, if there is just one
3. otherwise it asks, and offers to create one if none exists

The photo picker opens first, and any question comes after — this is
deliberate, and it is also what keeps the picker working inside WebKit's
user-gesture rules.

On desktop you can also drag an image straight onto a matching property row, in
Live Preview or in source mode. Dropping anywhere else behaves exactly as it
does without the plugin.

## Settings

| | |
|---|---|
| **Property names** | Which properties to act on. Exact or prefix matching. |
| **Location** | A specific folder, next to the note, the vault root, or Obsidian's own attachment folder. |
| **Filename** | Template with `{{noteName}}`, `{{property}}`, `{{originalName}}`, `{{date}}`, `{{time}}`, `{{timestamp}}`. |
| **Resize** | Fit a box (cover / contain / stretch), a single axis, or don't resize. |
| **Format** | WebP, JPEG or PNG, with quality. |
| **Property rows** | The inline button and drop-target behaviour, toggled independently. |
| **Link format** | Wikilink, markdown, or a plain path. |

**Wikilink is the default and recommended**: Obsidian registers it as a real
link, so moving or renaming the image updates the property automatically. The
other two formats lose that.

## Develop

```bash
npm install
npm run dev     # watch build
npm run check   # typecheck + lint + tests
```

Architecture, the platform constraints behind it, and the phase plan are in
`docs/implementation-plan.md`. The Phase 0 diagnostics that settled those
constraints are in `probes/`.

## License

0BSD
