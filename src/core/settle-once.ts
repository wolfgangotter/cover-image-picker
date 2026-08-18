/**
 * A one-shot callback guard.
 *
 * Obsidian's `SuggestModal` closes *before* it calls `onChooseSuggestion`, so a
 * naive "resolve null when the modal closes" cancellation always wins the race
 * and the real choice is discarded. Wrapping the resolver means the first
 * settle wins, and deferring the cancellation lets a genuine choice arrive
 * first.
 */
export function settleOnce<T>(callback: (value: T) => void): (value: T) => void {
	let settled = false;
	return (value: T) => {
		if (settled) return;
		settled = true;
		callback(value);
	};
}
