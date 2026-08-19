# Contributing

Thanks for looking. Bug reports are genuinely the most useful thing you can
send: this plugin touches Obsidian's internals and behaves differently on each
platform, and most bugs found so far only appeared on a device the author does
not have.

## Reporting a bug

Open an issue using the bug report template. The platform, the view mode and
which affordance you used (button, command, drag and drop) are what narrow a
report down fastest — the same three questions have mattered in nearly every bug
so far.

## Before opening a pull request

Please open an issue first for anything beyond a small fix. The plugin's scope
is deliberately narrow — it only ever touches the frontmatter properties you
configure, and never changes normal editing — so a change that widens that is a
design discussion rather than a patch.

## Working on it

```bash
npm install
npm run dev     # watch build
npm run check   # typecheck + lint + tests — must be clean before you push
```

To test in a vault, copy `main.js`, `manifest.json` and `styles.css` into
`<Vault>/.obsidian/plugins/cover-image-picker/`. Those three files are also
exactly what Obsidian ships to users; nothing else in this repo reaches a vault.

`npm run check` must pass with **zero errors and zero warnings**. CI runs the
same thing on every push and pull request.

## How the code is arranged

Read [`docs/implementation-plan.md`](docs/implementation-plan.md) first. It
records the platform constraints the design is built around and, more usefully,
*why* several non-obvious choices were made — including a few that look wrong
until you know what they work around.

Three rules hold the structure together:

- **`src/core/` imports nothing from `obsidian`.** It is the resize geometry,
  filename handling, validation and pipeline, all testable in plain vitest.
  Anything needing the app goes in `src/obsidian/` or `src/ui/`.
- **`src/obsidian/property-dom.ts` is the only file allowed to depend on
  Obsidian's internal markup.** There is no public API for the properties
  editor, so that file is the blast radius when Obsidian changes. It must
  degrade to "no inline button" rather than throw — the command path works
  without it.
- **Never claim an event you do not own.** Drops and pastes outside a configured
  property must behave exactly as they do without the plugin installed. This is
  the one promise the plugin makes about not getting in the way.

## Tests

New behaviour needs a test, and a bug fix needs one that fails without the fix —
several tests here were rewritten after review because they passed with the code
they were meant to protect deleted. Pure logic goes in `src/core/` and is tested
directly; anything touching Obsidian uses the stub in `tests/stubs/`.

## Licence

By contributing you agree that your contributions are licensed under the
[MIT licence](LICENSE) that covers this project.
