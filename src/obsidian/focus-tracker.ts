import { Component } from 'obsidian';
import { recallFocus, type RememberedFocus } from '../core/focus-memory';
import { isTargetProperty, type MatchConfig } from '../core/property-match';
import { propertyKeyOf } from './property-dom';
import type CoverImagePickerPlugin from '../main';

/**
 * Step 2 of the target resolution chain.
 *
 * In Live Preview, opening the command palette blurs the property field, so by
 * the time the command runs there is nothing to read. Recording focus as it
 * happens is what lets the command still know which property the user meant.
 */
export class PropertyFocusTracker extends Component {
	private last: RememberedFocus | null = null;

	constructor(private readonly plugin: CoverImagePickerPlugin) {
		super();
	}

	override onload(): void {
		this.registerDomEvent(activeDocument, 'focusin', (evt) => this.record(evt));
	}

	override onunload(): void {
		this.last = null;
	}

	private record(evt: FocusEvent): void {
		// Feature-tested rather than instanceof-checked, so this keeps working
		// in popout windows where HTMLElement is a different constructor.
		const target = evt.target as Element | null;
		const row = target?.closest?.('.metadata-property');
		if (!row?.instanceOf(HTMLElement)) return;

		const key = propertyKeyOf(row);
		if (!key) return;

		const settings = this.plugin.settings;
		const config: MatchConfig = {
			propertyNames: settings.propertyNames,
			matchMode: settings.matchMode,
			caseSensitive: settings.caseSensitive,
		};
		if (!isTargetProperty(key, config)) return;

		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) return;

		this.last = { notePath: file.path, propertyKey: key, at: Date.now() };
	}

	/** The remembered property for `notePath`, if it is still fresh. */
	recall(notePath: string, now = Date.now()): string | null {
		return recallFocus(this.last, notePath, now);
	}

	forget(): void {
		this.last = null;
	}
}
