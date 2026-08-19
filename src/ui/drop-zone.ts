import { Notice } from 'obsidian';
import { carriesFiles, firstSupportedImage } from '../core/drop-target';
import type { InsertionTarget } from '../core/types';
import { runPipeline } from '../triggers/insert';
import type CoverImagePickerPlugin from '../main';

export const DROP_ZONE_CLASS = 'cip-drop-zone';
const ACTIVE_CLASS = 'cip-drop-active';

/**
 * Makes a property row accept dropped image files.
 *
 * `editor-drop` does not fire here: the properties container is rendered
 * outside CodeMirror's content DOM in Live Preview (F5), so the row needs its
 * own listeners.
 */
export function attachDropZone(
	plugin: CoverImagePickerPlugin,
	row: HTMLElement,
	getTarget: () => InsertionTarget | null,
	signal: AbortSignal,
): void {
	row.addClass(DROP_ZONE_CLASS);
	let depth = 0;

	const setActive = (active: boolean) => {
		row.toggleClass(ACTIVE_CLASS, active);
	};

	row.addEventListener(
		'dragenter',
		(evt) => {
			if (!carriesFiles(evt.dataTransfer?.types)) return;
			evt.preventDefault();
			depth++;
			setActive(true);
		},
		{ signal },
	);

	row.addEventListener(
		'dragover',
		(evt) => {
			if (!carriesFiles(evt.dataTransfer?.types)) return;
			// Without preventDefault the drop event never fires at all.
			evt.preventDefault();
			evt.stopPropagation();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy';
		},
		{ signal },
	);

	row.addEventListener(
		'dragleave',
		() => {
			// dragenter/leave fire for descendants too, hence the depth count.
			depth = Math.max(0, depth - 1);
			if (depth === 0) setActive(false);
		},
		{ signal },
	);

	row.addEventListener(
		'drop',
		(evt) => {
			depth = 0;
			setActive(false);
			if (evt.defaultPrevented) return;
			// A zone that outlived its removal must be inert, not just unstyled.
			if (!plugin.settings.acceptDroppedImages) return;

			const files = Array.from(evt.dataTransfer?.files ?? []);
			if (files.length === 0) return;

			// Resolved before claiming the event: if this row no longer belongs
			// to a configured property, the drop is not ours to swallow.
			const target = getTarget();
			if (!target) return;

			const index = firstSupportedImage(files);
			if (index === -1) {
				// Claim it anyway: the drag was over our row, and letting it
				// through would paste a link into the properties UI.
				evt.preventDefault();
				new Notice('That file is not a supported image.');
				return;
			}

			const file = files[index];
			if (!file) return;

			evt.preventDefault();
			evt.stopPropagation();
			if (files.length > 1) new Notice(`Using ${file.name}; a property holds one image.`);

			void runPipeline(plugin, file, target);
		},
		{ signal },
	);
}
