import { SuggestModal, type App } from 'obsidian';

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
	private resolved = false;

	constructor(
		app: App,
		private readonly choices: PropertyChoice[],
		private readonly onChoose: (choice: PropertyChoice | null) => void,
	) {
		super(app);
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
		this.resolved = true;
		this.onChoose(choice);
	}

	override onClose(): void {
		super.onClose();
		// Dismissing without choosing must still settle the caller's promise.
		if (!this.resolved) this.onChoose(null);
	}
}

export function askForProperty(app: App, choices: PropertyChoice[]): Promise<PropertyChoice | null> {
	return new Promise((resolve) => {
		new PropertySuggestModal(app, choices, resolve).open();
	});
}
