import { SuggestModal, type App } from 'obsidian';
import { settleOnce } from '../core/settle-once';

export interface PropertyChoice {
	key: string;
	/** Current value, shown so the user can tell populated rows from empty ones. */
	description: string;
}

/**
 * Asks which property to write to. Only reached in the ambiguous cases
 * (steps 4-5 of the resolution chain), and always *after* the file has been
 * picked, so it never sits between the tap and the picker.
 */
export class PropertySuggestModal extends SuggestModal<PropertyChoice> {
	private readonly settle: (choice: PropertyChoice | null) => void;

	constructor(
		app: App,
		private readonly choices: PropertyChoice[],
		onChoose: (choice: PropertyChoice | null) => void,
	) {
		super(app);
		this.settle = settleOnce(onChoose);
		this.setPlaceholder('Which property should hold the image?');
	}

	getSuggestions(query: string): PropertyChoice[] {
		const needle = query.toLowerCase();
		return this.choices.filter((choice) => choice.key.toLowerCase().includes(needle));
	}

	renderSuggestion(choice: PropertyChoice, el: HTMLElement): void {
		el.createDiv({ text: choice.key, cls: 'cip-suggest-key' });
		if (choice.description) {
			el.createDiv({
				text: choice.description,
				cls: 'cip-suggest-value',
			});
		}
	}

	onChooseSuggestion(choice: PropertyChoice): void {
		this.settle(choice);
	}

	override onClose(): void {
		super.onClose();
		// Obsidian closes the modal BEFORE invoking onChooseSuggestion, so
		// cancelling synchronously here would discard every real selection.
		// Defer by a tick and let `settleOnce` give a genuine choice priority.
		window.setTimeout(() => this.settle(null), 0);
	}
}

export function askForProperty(app: App, choices: PropertyChoice[]): Promise<PropertyChoice | null> {
	return new Promise((resolve) => {
		new PropertySuggestModal(app, choices, resolve).open();
	});
}
