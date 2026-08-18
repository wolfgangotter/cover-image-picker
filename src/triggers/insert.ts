import { Notice } from 'obsidian';
import { toUserMessage } from '../core/errors';
import type { InsertionTarget } from '../core/types';
import { ProgressReporter, formatBytes } from '../ui/progress';
import type CoverImagePickerPlugin from '../main';

/**
 * The shared tail of every trigger: pick a file, run the pipeline, report.
 *
 * Lives apart from `command.ts` so the property-row button can reuse it
 * without the two importing each other.
 */
export async function insertForTarget(
	plugin: CoverImagePickerPlugin,
	target: InsertionTarget,
): Promise<void> {
	// Opened before any await, and never from behind a modal or menu (F9).
	const file = await plugin.filePicker.open();
	if (!file) return;
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
		flashProperty(target.propertyKey);
	} catch (err) {
		// Detail to the console only; the user gets a short safe message.
		console.error('[cover-image-picker] insertion failed', err);
		new Notice(toUserMessage(err));
	} finally {
		progress.stop();
	}
}

/** Brief highlight so it is obvious which row changed. No-op in source mode. */
function flashProperty(key: string): void {
	const rows = activeDocument.querySelectorAll(
		`.metadata-property[data-property-key="${CSS.escape(key)}"]`,
	);
	rows.forEach((row) => {
		if (!row.instanceOf(HTMLElement)) return;
		row.addClass('cip-just-updated');
		window.setTimeout(() => row.removeClass('cip-just-updated'), 1200);
	});
}
