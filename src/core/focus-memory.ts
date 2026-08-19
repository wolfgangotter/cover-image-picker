/**
 * Freshness rules for the remembered property focus (chain step 2).
 *
 * Pure, so the expiry and note-switch behaviour can be tested without a DOM:
 * a stale memory silently targeting the wrong property is the worst kind of
 * bug this plugin can have, because nothing on screen explains it. The user
 * sees the image land somewhere they did not choose and cannot tell why.
 */

export interface RememberedFocus {
	notePath: string;
	propertyKey: string;
	at: number;
}

/**
 * How long a remembered focus stays relevant.
 *
 * This exists to bridge one specific gap: opening the command palette blurs
 * the property field, so by the time the command runs there is nothing left to
 * read. That gap is a few seconds - focus the field, open the palette, type,
 * press enter. Anything longer is not bridging an interaction, it is guessing
 * from history, which is how "I deleted that property and it came back"
 * happens.
 */
export const FOCUS_TTL_MS = 15_000;

export interface RecallOptions {
	ttlMs?: number;
	/**
	 * Whether the remembered property is still present in the note. A property
	 * the user has since deleted must not be resurrected by the memory of
	 * having touched it - deleting it is exactly how you touch it last.
	 */
	stillPresent?: (propertyKey: string) => boolean;
}

export function recallFocus(
	memory: RememberedFocus | null,
	notePath: string,
	now: number,
	options: RecallOptions = {},
): string | null {
	const { ttlMs = FOCUS_TTL_MS, stillPresent } = options;

	if (!memory) return null;
	// A different note means the memory is about something else entirely.
	if (memory.notePath !== notePath) return null;
	if (now - memory.at > ttlMs) return null;
	if (now < memory.at) return null;
	if (stillPresent && !stillPresent(memory.propertyKey)) return null;
	return memory.propertyKey;
}
