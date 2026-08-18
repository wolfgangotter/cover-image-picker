import { Notice, Platform, TFile } from 'obsidian';
import type { InsertionTarget } from '../core/types';
import { runPipeline } from './insert';
import { resolveTargetInteractive, resolveTargetSync } from './resolve-target';
import type CoverImagePickerPlugin from '../main';

export const INSERT_COMMAND_ID = 'insert-cover-image';
export const CAMERA_COMMAND_ID = 'insert-cover-image-camera';

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

	// Hidden on desktop, where there is no camera to open. Add it to the
	// mobile toolbar in Settings -> Toolbar for a one-tap capture.
	plugin.addCommand({
		id: CAMERA_COMMAND_ID,
		name: 'Take a photo as cover image',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const usable = Platform.isMobileApp && file instanceof TFile && file.extension === 'md';
			if (checking || !usable) return usable;
			void insertCoverImage(plugin, { capture: true });
			return true;
		},
	});
}

async function insertCoverImage(
	plugin: CoverImagePickerPlugin,
	options: { capture?: boolean } = {},
): Promise<void> {
	// Pre-resolve synchronously (free), then open the picker before anything
	// can await. Never put a modal between here and `open()` - see F9.
	const presumed = resolveTargetSync(plugin.app, plugin.settings, plugin.focusTracker);
	const file = await plugin.filePicker.open(options);
	if (!file) return;

	const target: InsertionTarget | null =
		presumed ?? (await resolveTargetInteractive(plugin.app, plugin.settings));
	if (!target) {
		new Notice('No cover property to insert into. Add one in the note, or configure names in settings.');
		return;
	}

	await runPipeline(plugin, file, target);
}
