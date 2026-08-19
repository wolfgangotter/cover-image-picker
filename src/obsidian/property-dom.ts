/**
 * ⚠ THE ONLY FILE THAT DEPENDS ON OBSIDIAN'S INTERNAL DOM.
 *
 * There is no public API for the properties editor (F1), so the inline button
 * has to be attached by observing rendered markup. Everything here is written
 * to fail soft: if the structure changes, the button silently does not appear
 * and the command path — which needs none of this — keeps working.
 *
 * Structure relied upon, as of Obsidian 1.13:
 *   .metadata-container
 *     .metadata-property[data-property-key="cover"]
 *       .metadata-property-key
 *       .metadata-property-value
 */

import { Component, MarkdownView, debounce, type App } from 'obsidian';
import { isTargetProperty, type MatchConfig } from '../core/property-match';
import type { InsertionTarget } from '../core/types';
import { attachDropZone, DROP_ZONE_CLASS } from '../ui/drop-zone';
import { BUTTON_CLASS, createInsertButton } from '../ui/insert-button';
import type CoverImagePickerPlugin from '../main';

const PROPERTY_ROW = '.metadata-property';
const KEY_ATTRIBUTE = 'data-property-key';
const VALUE_CELL = '.metadata-property-value';
const RESCAN_DELAY_MS = 150;

/** Key of a property row, tolerating the attribute living on a descendant. */
export function propertyKeyOf(row: HTMLElement): string | null {
	const own = row.getAttribute(KEY_ATTRIBUTE);
	if (own) return own;
	const nested = row.querySelector(`[${KEY_ATTRIBUTE}]`);
	return nested?.getAttribute(KEY_ATTRIBUTE) ?? null;
}

export class PropertyDomAdapter extends Component {
	private observer: MutationObserver | null = null;
	/** Owns every listener attached to Obsidian's rows, so all can be dropped at once. */
	private listeners = new AbortController();
	private warned = false;

	constructor(private readonly plugin: CoverImagePickerPlugin) {
		super();
	}

	private get app(): App {
		return this.plugin.app;
	}

	/**
	 * Everything here is best-effort. This adapter is the one part of the
	 * plugin coupled to Obsidian's internals (F1), so it must degrade to
	 * "no inline button" rather than take the whole plugin down with it - a
	 * throw in onload shows the user "failed to load plugin" and costs them
	 * the command path too, which needs none of this.
	 */
	override onload(): void {
		try {
			const rescan = debounce(() => this.safeDecorateAll(), RESCAN_DELAY_MS, true);

			// Property rows are re-rendered on almost every editor interaction,
			// so observe once at the workspace root and rescan on a debounce
			// rather than trying to track individual views.
			this.observer = new MutationObserver(() => rescan());
			this.observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });

			// Listed individually because the overloads are per-event-name.
			this.registerEvent(this.app.workspace.on('layout-change', () => rescan()));
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => rescan()));
			this.registerEvent(this.app.workspace.on('file-open', () => rescan()));
			this.app.workspace.onLayoutReady(() => this.safeDecorateAll());
		} catch (err) {
			console.error('[cover-image-picker] property row integration unavailable', err);
		}
	}

	/** Never lets a DOM surprise escape into Obsidian's event loop. */
	private safeDecorateAll(): void {
		try {
			this.decorateAll();
		} catch (err) {
			if (!this.warned) {
				this.warned = true;
				console.error('[cover-image-picker] could not decorate property rows', err);
			}
		}
	}

	override onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.removeAllDecorations();
	}

	/** Detaches every row listener and starts a fresh generation. */
	private resetListeners(): void {
		this.listeners.abort();
		this.listeners = new AbortController();
	}

	/** Called when settings change: property names may no longer match. */
	refresh(): void {
		this.removeAllDecorations();
		this.decorateAll();
	}

	/** Whether anything at all needs attaching to property rows. */
	private get enabled(): boolean {
		const { showPropertyButton, acceptDroppedImages } = this.plugin.settings;
		return showPropertyButton || acceptDroppedImages;
	}

	/**
	 * Sweeps every open markdown view as well as the active document, so
	 * buttons in popout windows are cleaned up too - those live in a different
	 * document and `activeDocument` alone would miss them.
	 */
	private removeAllDecorations(): void {
		this.resetListeners();

		const roots: ParentNode[] = [activeDocument];
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView) roots.push(leaf.view.contentEl);
		}
		for (const root of roots) {
			root.querySelectorAll(`.${BUTTON_CLASS}`).forEach((el) => {
				el.remove();
			});
			// The listeners are already gone; clear the marker so the rows are
			// eligible for decoration again.
			root.querySelectorAll(`.${DROP_ZONE_CLASS}`).forEach((el) => {
				el.removeClasses([DROP_ZONE_CLASS, 'cip-drop-active']);
			});
		}
	}

	private matchConfig(): MatchConfig {
		const settings = this.plugin.settings;
		return {
			propertyNames: settings.propertyNames,
			matchMode: settings.matchMode,
			caseSensitive: settings.caseSensitive,
		};
	}

	private decorateAll(): void {
		if (!this.enabled) {
			this.removeAllDecorations();
			return;
		}

		const config = this.matchConfig();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;

			const rows = view.contentEl.querySelectorAll(PROPERTY_ROW);
			if (rows.length === 0) continue;

			const notePath = view.file.path;
			const noteName = view.file.basename;
			rows.forEach((node) => {
				if (node.instanceOf(HTMLElement)) this.decorateRow(node, config, notePath, noteName);
			});
		}
		this.warnOnceIfStructureMissing();
	}

	/**
	 * The button and the drop zone are independent: either can be switched off
	 * without disturbing the other, even though they attach to the same row.
	 */
	private decorateRow(row: HTMLElement, config: MatchConfig, notePath: string, noteName: string): void {
		const key = propertyKeyOf(row);
		const button = row.querySelector(`.${BUTTON_CLASS}`);

		if (!key || !isTargetProperty(key, config)) {
			// Settings may have changed since this row was decorated, or Obsidian
			// may have reused the node for a different property. Undecorate fully:
			// leaving the drop zone behind would keep accepting images for a
			// property that is no longer on this row.
			button?.remove();
			row.removeClasses([DROP_ZONE_CLASS, 'cip-drop-active']);
			return;
		}

		const settings = this.plugin.settings;

		/*
		 * Resolved on every use rather than captured.
		 *
		 * Obsidian can rename the property on an existing row, which changes
		 * `data-property-key` in place. A target captured at decoration time
		 * would then quietly write to the previous property - and because both
		 * affordances would already exist, neither would be rebuilt to notice.
		 */
		const target = (): InsertionTarget | null => {
			const current = propertyKeyOf(row);
			if (!current || !isTargetProperty(current, this.matchConfig())) return null;
			return { notePath, noteName, propertyKey: current };
		};

		if (settings.showPropertyButton && !button) {
			const host = row.querySelector(VALUE_CELL) ?? row;
			host.appendChild(createInsertButton(this.plugin, target));
		} else if (!settings.showPropertyButton && button) {
			button.remove();
		}

		// Desktop drag and drop onto the row itself (F5).
		if (settings.acceptDroppedImages && !row.hasClass(DROP_ZONE_CLASS)) {
			attachDropZone(this.plugin, row, target, this.listeners.signal);
		} else if (!settings.acceptDroppedImages && row.hasClass(DROP_ZONE_CLASS)) {
			row.removeClasses([DROP_ZONE_CLASS, 'cip-drop-active']);
		}
	}

	/**
	 * If Obsidian ever renames these classes this is the only symptom the user
	 * would otherwise get, so say it once in the console rather than silently
	 * doing nothing forever.
	 */
	private warnOnceIfStructureMissing(): void {
		if (this.warned) return;
		const hasContainer = activeDocument.querySelector('.metadata-container') !== null;
		const hasRows = activeDocument.querySelector(PROPERTY_ROW) !== null;
		if (hasContainer && !hasRows) {
			this.warned = true;
			console.warn(
				'[cover-image-picker] properties container found but no .metadata-property rows; ' +
					'the inline button is unavailable. Use the "Insert cover image" command instead.',
			);
		}
	}
}
