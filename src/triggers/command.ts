import { MarkdownView, Notice, TFile } from 'obsidian';
import { toUserMessage } from '../core/errors';
import type { InsertionTarget } from '../core/types';
import { ProgressReporter, formatBytes } from '../ui/progress';
import { resolveTargetInteractive, resolveTargetSync } from './resolve-target';
import type CoverImagePickerPlugin from '../main';

export const INSERT_COMMAND_ID = 'insert-cover-image';

export function registerCommands(plugin: CoverImagePickerPlugin): void {
	plugin.addCommand({
		id: INSERT_COMMAND_ID,
		name: 'Insert cover image',
		// Kept cheap: this runs on every keystroke in the command palette.
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const usable = file instanceof TFile && file.extension === 'md';
			if (checking || !usable) return usable;
			void insertCoverImage(plugin);
			return true;
		},
	});
}

async function insertCoverImage(plugin: CoverImagePickerPlugin): Promise<void> {
	// Pre-resolve synchronously (free), then open the picker before anything
	// can await. Never put a modal between here and `open()` - see F9.
	const presumed = resolveTargetSync(plugin.app, plugin.settings);
	const file = await plugin.filePicker.open();
	if (!file) return;

	const target: InsertionTarget | null =
		presumed ?? (await resolveTargetInteractive(plugin.app, plugin.settings));
	if (!target) {
		new Notice('No cover property to insert into. Add one in the note, or configure names in settings.');
		return;
	}

	await runPipeline(plugin, file, target);
}

export async function runPipeline(
	plugin: CoverImagePickerPlugin,
	file: File,
	target: InsertionTarget,
): Promise<void> {
	const progress = new ProgressReporter();
	try {
		const result = await plugin.pipeline.run(file, file.name, target, progress.start());
		new Notice(
			`Set ${target.propertyKey}: ${result.width}×${result.height} ${result.format.toUpperCase()}, ${formatBytes(result.bytes)}`,
		);
		flashProperty(plugin, target.propertyKey);
	} catch (err) {
		// Detail to the console only; the user gets a short safe message.
		console.error('[cover-image-picker] insertion failed', err);
		new Notice(toUserMessage(err));
	} finally {
		progress.stop();
	}
}

/** Brief highlight so it is obvious which row changed. No-op in source mode. */
function flashProperty(plugin: CoverImagePickerPlugin, key: string): void {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const row = view?.contentEl
		.querySelector(`.metadata-property[data-property-key="${CSS.escape(key)}"]`)
		?.closest('.metadata-property');
	if (!(row instanceof HTMLElement)) return;

	row.addClass('cip-just-updated');
	window.setTimeout(() => row.removeClass('cip-just-updated'), 1200);
}
