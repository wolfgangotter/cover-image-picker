import { Component } from 'obsidian';

/**
 * One persistent hidden file input, reused for every pick.
 *
 * iOS fires no reliable "cancelled" event, so creating an element per
 * invocation leaks one on every dismissal. Reuse sidesteps the problem
 * entirely and there is exactly one element to clean up on unload.
 *
 * The explicit accept list (rather than `image/*`) maximises the chance iOS
 * transcodes HEIC to JPEG during selection - see `core/validate-source.ts`
 * for what happens when it does not.
 */
export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

export class FilePicker extends Component {
	private input: HTMLInputElement | null = null;
	private pending: ((file: File | null) => void) | null = null;

	override onload(): void {
		const input = createEl('input');
		input.type = 'file';
		input.accept = ACCEPTED_TYPES;
		input.multiple = false;
		input.addClass('cip-hidden-input');
		document.body.appendChild(input);

		this.registerDomEvent(input, 'change', () => {
			const file = input.files?.[0] ?? null;
			input.value = '';
			const resolve = this.pending;
			this.pending = null;
			resolve?.(file);
		});

		this.input = input;
	}

	override onunload(): void {
		this.pending?.(null);
		this.pending = null;
		this.input?.remove();
		this.input = null;
	}

	/**
	 * Open the picker and resolve with the chosen file.
	 *
	 * MUST be called from the user-gesture call stack, and in particular must
	 * never be reached from behind a modal or menu - see F9 in the plan. The
	 * returned promise stays pending if the user cancels, which is why the
	 * caller must not hold resources across the await.
	 */
	open(): Promise<File | null> {
		const input = this.input;
		if (!input) return Promise.resolve(null);

		// A second open supersedes the first rather than stacking listeners.
		this.pending?.(null);
		return new Promise<File | null>((resolve) => {
			this.pending = resolve;
			input.click();
		});
	}
}
