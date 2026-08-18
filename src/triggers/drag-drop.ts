import { Notice, TFile, type Editor, type MarkdownFileInfo, type MarkdownView } from 'obsidian';
import { carriesFiles, firstSupportedImage, keyFromUpwardLines } from '../core/drop-target';
import { propertyKeyAtOffset } from '../core/frontmatter-scan';
import { isTargetProperty, type MatchConfig } from '../core/property-match';
import type { InsertionTarget } from '../core/types';
import { runPipeline } from './insert';
import type CoverImagePickerPlugin from '../main';

const SOURCE_LINE = '.cm-line';

/**
 * Source-mode drops, where the frontmatter is plain text.
 *
 * Obsidian's own handler would insert an embed at the drop point, which inside
 * a frontmatter block produces broken YAML. We take over only when the drop
 * landed on a line that provably belongs to one of the configured properties;
 * everything else is left alone, which is the whole "do not alter general edit
 * behaviour" requirement.
 */
export function registerDragAndDrop(plugin: CoverImagePickerPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-drop', (evt, _editor, info) => {
			// Someone else already handled it.
			if (evt.defaultPrevented) return;
			if (!carriesFiles(evt.dataTransfer?.types)) return;

			const target = resolveDropTarget(plugin, evt, info);
			if (!target) return; // Not ours: stock Obsidian behaviour.

			const files = Array.from(evt.dataTransfer?.files ?? []);
			const index = firstSupportedImage(files);
			const file = index === -1 ? null : files[index];
			if (!file) {
				evt.preventDefault();
				new Notice('That file is not a supported image.');
				return;
			}

			evt.preventDefault();
			if (files.length > 1) new Notice(`Using ${file.name}; a property holds one image.`);
			void runPipeline(plugin, file, target);
		}),
	);

	registerPaste(plugin);
}

/**
 * Source-mode paste.
 *
 * Unlike a drop, a paste always lands at the cursor, so the target can be read
 * straight from the editor rather than from rendered lines - no DOM guessing.
 */
function registerPaste(plugin: CoverImagePickerPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-paste', (evt, editor, info) => {
			if (evt.defaultPrevented) return;
			if (!plugin.settings.acceptDroppedImages) return;

			const files = Array.from(evt.clipboardData?.files ?? []);
			if (files.length === 0) return;

			const target = pasteTarget(plugin, editor, info);
			if (!target) return; // Not in one of our properties: stock behaviour.

			const index = firstSupportedImage(files);
			const file = index === -1 ? null : files[index];
			if (!file) return; // Not an image we handle; let Obsidian have it.

			evt.preventDefault();
			void runPipeline(plugin, file, target);
		}),
	);
}

function pasteTarget(
	plugin: CoverImagePickerPlugin,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
): InsertionTarget | null {
	const file = info.file;
	if (!(file instanceof TFile) || file.extension !== 'md') return null;

	let key: string | null = null;
	try {
		key = propertyKeyAtOffset(editor.getValue(), editor.posToOffset(editor.getCursor()));
	} catch {
		return null;
	}
	if (!key) return null;

	const settings = plugin.settings;
	const config: MatchConfig = {
		propertyNames: settings.propertyNames,
		matchMode: settings.matchMode,
		caseSensitive: settings.caseSensitive,
	};
	if (!isTargetProperty(key, config)) return null;

	return { notePath: file.path, noteName: file.basename, propertyKey: key };
}

function resolveDropTarget(
	plugin: CoverImagePickerPlugin,
	evt: DragEvent,
	info: MarkdownView | MarkdownFileInfo,
): InsertionTarget | null {
	const file = info.file;
	if (!(file instanceof TFile) || file.extension !== 'md') return null;

	const key = keyAtDropPoint(evt);
	if (!key) return null;

	const settings = plugin.settings;
	const config: MatchConfig = {
		propertyNames: settings.propertyNames,
		matchMode: settings.matchMode,
		caseSensitive: settings.caseSensitive,
	};
	if (!isTargetProperty(key, config)) return null;

	return { notePath: file.path, noteName: file.basename, propertyKey: key };
}

/**
 * Reads the dropped-on line and every rendered line above it.
 *
 * There is no public API for turning a pointer position into an editor offset,
 * so this walks the rendered CodeMirror lines instead. If the top of the
 * document has been virtualised away the upward walk never reaches the opening
 * fence, `keyFromUpwardLines` returns null, and we simply do not claim the drop.
 */
function keyAtDropPoint(evt: DragEvent): string | null {
	const origin = evt.target;
	const line = origin instanceof Element ? origin.closest(SOURCE_LINE) : null;
	if (!line) return null;

	const lines: string[] = [];
	for (let node: Element | null = line; node; node = node.previousElementSibling) {
		if (!node.matches(SOURCE_LINE)) continue;
		lines.push(node.textContent ?? '');
	}
	return keyFromUpwardLines(lines);
}
