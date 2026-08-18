import { Menu, Notice, setIcon, setTooltip, TFile } from 'obsidian';
import type { InsertionTarget } from '../core/types';
import { insertForTarget } from '../triggers/insert';
import type CoverImagePickerPlugin from '../main';

export const BUTTON_CLASS = 'cip-insert-button';

/**
 * The icon injected into a matching property row.
 *
 * Needs no focus, which is the whole point: on iOS no toolbar appears when a
 * property is focused (F10), so an affordance that works without focusing the
 * field sidesteps the problem rather than fighting it.
 */
export function createInsertButton(
	plugin: CoverImagePickerPlugin,
	getTarget: () => InsertionTarget | null,
): HTMLElement {
	const button = createDiv({ cls: BUTTON_CLASS });
	button.setAttribute('role', 'button');
	button.setAttribute('tabindex', '0');
	setIcon(button, 'image-plus');
	setTooltip(button, 'Set cover image');

	// Suppress focus so tapping does not raise the keyboard on mobile before
	// the picker opens. `click` still fires and still carries the gesture.
	const suppressFocus = (evt: Event) => evt.preventDefault();
	button.addEventListener('mousedown', suppressFocus);
	button.addEventListener('touchstart', suppressFocus, { passive: false });

	button.addEventListener('click', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		// A button that outlived its removal must be inert, not merely invisible.
		if (!plugin.settings.showPropertyButton) return;
		const target = getTarget();
		if (!target) return;

		const existing = plugin.frontmatter.read(target);
		if (isEmpty(existing)) {
			// One tap, no menu: keeps the picker inside the gesture (F9).
			void insertForTarget(plugin, target);
		} else {
			showReplaceMenu(plugin, target, evt);
		}
	});

	button.addEventListener('keydown', (evt) => {
		if (evt.key !== 'Enter' && evt.key !== ' ') return;
		evt.preventDefault();
		if (!plugin.settings.showPropertyButton) return;
		const target = getTarget();
		if (target) void insertForTarget(plugin, target);
	});

	return button;
}

function isEmpty(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return true;
	return Array.isArray(value) && value.length === 0;
}

/**
 * Shown when the property already holds something. Each menu item is itself a
 * fresh user gesture, so calling the picker from one is safe.
 */
function showReplaceMenu(plugin: CoverImagePickerPlugin, target: InsertionTarget, evt: MouseEvent): void {
	const menu = new Menu();

	menu.addItem((item) =>
		item
			.setTitle('Replace image')
			.setIcon('image-plus')
			.onClick(() => void insertForTarget(plugin, target)),
	);

	const linked = plugin.frontmatter.resolveLinkedFile(target);
	if (linked) {
		menu.addItem((item) =>
			item
				.setTitle('Open image')
				.setIcon('external-link')
				.onClick(() => void plugin.app.workspace.getLeaf('tab').openFile(linked)),
		);
	}

	menu.addItem((item) =>
		item
			.setTitle('Clear property')
			.setIcon('x')
			.onClick(() => {
				void clearProperty(plugin, target, linked);
			}),
	);

	menu.showAtMouseEvent(evt);
}

async function clearProperty(
	plugin: CoverImagePickerPlugin,
	target: InsertionTarget,
	linked: TFile | null,
): Promise<void> {
	try {
		await plugin.frontmatter.clear(target);
		// Deleting the file itself is opt-in: it may be used elsewhere.
		if (linked && plugin.settings.deleteReplacedFile) {
			await plugin.app.fileManager.trashFile(linked);
		}
		new Notice(`Cleared ${target.propertyKey}.`);
	} catch (err) {
		console.error('[cover-image-picker] clear failed', err);
		new Notice('The property could not be cleared.');
	}
}
