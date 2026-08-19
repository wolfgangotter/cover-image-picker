# Release checklist

Phase 4 of `implementation-plan.md`. Everything in §1 is done; §2 and §3 need a
GitHub repository and your explicit go-ahead, because they are public and
effectively irreversible.

---

## 1. Repository state — done

- [x] `LICENSE` carries the right copyright holder (it still said "Dynalist Inc."
      from the sample plugin — a genuine blocker, since it misattributed the work)
- [x] `manifest.json` version `1.0.0`, `minAppVersion` `1.13.0`,
      `isDesktopOnly: false`, stable `id` (`cover-image-picker` — never change
      this after release)
- [x] `versions.json` maps `1.0.0` → `1.13.0`
- [x] `package.json` version matches the manifest
- [x] README states requirements, install, privacy and permissions
- [x] Plugin `id` and `name` are free in the community catalogue (checked against
      `community-plugins.json`, 6760 entries). Nearest neighbours are
      `image-picker` / "Image Picker" and `cover-image` / "Cover Image" — worth a
      glance so the README differentiates.
- [x] `main.js` is gitignored; CI builds it for the release
- [x] Quality gate clean: `npm run check` (typecheck + lint + 210 tests),
      zero errors **and** zero warnings

## 2. Before tagging

- [ ] **Add a screenshot** and reference it in the README (see the TODO comment
      at the top). Nothing here needs it to work, but the catalogue listing is
      much weaker without one.
- [ ] **Create `main`.** All history is currently linear on feature branches and
      no `main` exists yet; the release workflow and the catalogue both assume a
      default branch.
- [ ] **Run the manual matrix below.** Several rows have never been exercised.
- [ ] Push to a public GitHub repository.

### Manual matrix

Rows marked ✅ have been verified during development. The rest have not, and a
first release is the wrong time to find out.

| Case | Status |
|---|---|
| Desktop: command, Live Preview | ✅ |
| Desktop: property button, empty and populated | ✅ |
| Desktop: drag & drop onto a property row | ✅ |
| Desktop: drop on a non-matching property / note body behaves as stock | ✅ |
| iOS: command palette, gallery and camera | ✅ |
| iOS: property button, both states | ✅ |
| iOS: source mode via the toolbar | ✅ |
| Both property-row toggles, on and off | ✅ |
| Ambiguous target (two matching properties) | ✅ |
| **Per-property sizes** actually applied to the output | ✅ |
| **Real camera photo** end to end — orientation and file size | ✅ |
| **12 MP photo** on iOS — memory behaviour | ⬜ (peak canvas memory cut ~4x since this row was written) |
| **iPad** | ⬜ |
| Note in a subfolder, and each storage mode | ✅ automated (`tests/vault-storage.test.ts`) |
| Filename with spaces / non-ASCII | ⬜ unit-tested only — see note below |
| Properties set to `Hidden` in Obsidian settings (F11) | ⬜ |
| Popout window (desktop) | ⬜ |
| **Type in a note, then insert a cover within ~2s** — nothing typed is lost | ⬜ |
| Delete a property, then insert — must ask rather than resurrect it | ✅ |
| Disable/enable: no stray buttons, no surviving drop listeners | ✅ automated (`tests/lifecycle.test.ts`) |

**On the non-ASCII row:** `tests/naming.test.ts` covers the sanitiser, which
normalises to NFC, and `tests/link-format.test.ts` covers percent-encoding. Neither
can reach the risk that row exists for: macOS and iOS hand filesystem paths back
in NFD, so a written filename can round-trip to a different string than the one
embedded in the wikilink, leaving a broken embed. Only a device run finds that.

## 3. Release and submission

The submission process changed: it is **no longer a pull request** against
`obsidianmd/obsidian-releases`. Plugins are now added through the community
directory web interface.

1. **Push to a public GitHub repository**, with `main` as the default branch.
   The directory reads `manifest.json` from the default branch, and the repo
   must be publicly readable for review.
2. **Tag exactly `1.0.0`** — no leading `v`. The tag has to equal the manifest
   version or the automated check fails.
   ```bash
   git tag 1.0.0 && git push origin 1.0.0
   ```
3. The release workflow builds and opens a **draft** release with `main.js`,
   `manifest.json` and `styles.css` attached as individual files. Review it and
   **publish** it — a draft is not visible to the directory.
4. **Submit** at <https://community.obsidian.md>: sign in with your Obsidian
   account, link your GitHub account so ownership can be verified, and add the
   plugin through the directory.
5. **Address feedback.** Review is automated first. Fixes require a new release
   with an incremented version — you cannot amend `1.0.0` in place once it has
   been submitted.

## 4. After release

- Never change the plugin `id`.
- Bump with `npm version <patch|minor|major>`, which runs `version-bump.mjs` to
  keep `manifest.json` and `versions.json` in step.
- `minAppVersion` only moves up when a newer API is actually used.
