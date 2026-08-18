import { MarkdownView, TFile, type App, type Editor } from 'obsidian';
import { propertyKeyAtOffset } from '../core/frontmatter-scan';
import { isTargetProperty, missingPropertyNames, type MatchConfig } from '../core/property-match';
import type { InsertionTarget } from '../core/types';
import { askForProperty, type PropertyChoice } from '../ui/property-suggest';
import type { CoverImagePickerSettings } from '../settings/schema';

/**
 * Steps 1-3 of the resolution chain from the plan. All synchronous, so a
 * caller can run them before opening the picker at no cost.
 *
 * Step 2 (last-focused property) arrives with the Live Preview DOM adapter in
 * Phase 1b; in source mode the cursor already carries the same information.
 */
export function resolveTargetSync(app: App, settings: CoverImagePickerSettings): InsertionTarget | null {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') return null;

	const config: MatchConfig = {
		propertyNames: settings.propertyNames,
		matchMode: settings.matchMode,
		caseSensitive: settings.caseSensitive,
	};
	const base = { notePath: file.path, noteName: file.basename };

	// 1. Source-mode cursor: the toolbar keeps editor focus, so this is reliable
	//    exactly where the native toolbar is available.
	const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	const fromCursor = editor ? propertyKeyAtCursor(editor) : null;
	if (fromCursor && isTargetProperty(fromCursor, config)) {
		return { ...base, propertyKey: fromCursor };
	}

	// 3. Sole configured property present in the note.
	const present = matchingKeysInNote(app, file, config);
	if (present.length === 1 && present[0] !== undefined) {
		return { ...base, propertyKey: present[0] };
	}

	return null;
}

function propertyKeyAtCursor(editor: Editor): string | null {
	try {
		return propertyKeyAtOffset(editor.getValue(), editor.posToOffset(editor.getCursor()));
	} catch {
		return null;
	}
}

function matchingKeysInNote(app: App, file: TFile, config: MatchConfig): string[] {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!frontmatter) return [];
	return Object.keys(frontmatter).filter((key) => isTargetProperty(key, config));
}

function describe(value: unknown): string {
	if (value === null || value === undefined || value === '') return 'empty';
	if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
	if (typeof value === 'object') return 'set';
	// eslint-disable-next-line @typescript-eslint/no-base-to-string -- object and array cases are handled above, so this is a primitive
	return String(value).slice(0, 80);
}

/**
 * Steps 4-5: ask the user. Always called *after* the file is picked, so the
 * modal never blocks the picker's user gesture.
 */
export async function resolveTargetInteractive(
	app: App,
	settings: CoverImagePickerSettings,
): Promise<InsertionTarget | null> {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') return null;

	const config: MatchConfig = {
		propertyNames: settings.propertyNames,
		matchMode: settings.matchMode,
		caseSensitive: settings.caseSensitive,
	};
	const base = { notePath: file.path, noteName: file.basename };
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const present = Object.keys(frontmatter).filter((key) => isTargetProperty(key, config));

	const choices: PropertyChoice[] = present.map((key) => ({
		key,
		description: describe(frontmatter[key]),
	}));

	// 5. Nothing present: offer to create the configured names.
	for (const name of missingPropertyNames(present, config)) {
		choices.push({ key: name, description: 'create this property' });
	}

	if (choices.length === 0) return null;
	if (choices.length === 1 && choices[0] !== undefined) {
		return { ...base, propertyKey: choices[0].key };
	}

	const chosen = await askForProperty(app, choices);
	return chosen ? { ...base, propertyKey: chosen.key } : null;
}
