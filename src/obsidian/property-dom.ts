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
	private warned = false;

	constructor(private readonly plugin: CoverImagePickerPlugin) {
		super();
	}

	private get app(): App {
		return this.plugin.app;
	}

	override onload(): void {
		const rescan = debounce(() => this.decorateAll(), RESCAN_DELAY_MS, true);

		// Property rows are re-rendered on almost every editor interaction, so
		// observe once at the workspace root and rescan on a debounce rather
		// than trying to track individual views.
		this.observer = new MutationObserver(() => rescan());
		this.observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });

		// Listed individually because the overloads are per-event-name.
		this.registerEvent(this.app.workspace.on('layout-change', () => rescan()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => rescan()));
		this.registerEvent(this.app.workspace.on('file-open', () => rescan()));
		this.app.workspace.onLayoutReady(() => this.decorateAll());
	}

	override onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.removeAllButtons();
	}

	/** Called when settings change: property names may no longer match. */
	refresh(): void {
		this.removeAllButtons();
		this.decorateAll();
	}

	private removeAllButtons(): void {
		activeDocument.querySelectorAll(`.${BUTTON_CLASS}`).forEach((el) => {
			el.remove();
		});
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
		if (!this.plugin.settings.showPropertyButton) {
			this.removeAllButtons();
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

	private decorateRow(row: HTMLElement, config: MatchConfig, notePath: string, noteName: string): void {
		const key = propertyKeyOf(row);
		const existing = row.querySelector(`.${BUTTON_CLASS}`);

		if (!key || !isTargetProperty(key, config)) {
			// Settings may have changed since this row was decorated.
			existing?.remove();
			return;
		}
		if (existing) return;

		const host = row.querySelector(VALUE_CELL) ?? row;
		const target: InsertionTarget = { notePath, noteName, propertyKey: key };
		host.appendChild(createInsertButton(this.plugin, () => target));
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
