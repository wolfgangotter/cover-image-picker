/**
 * Freshness rules for the remembered property focus (chain step 2).
 *
 * Pure, so the expiry and note-switch behaviour can be tested without a DOM:
 * a stale memory silently targeting the wrong property would be a bad failure,
 * because the user would not see it until the image landed somewhere odd.
 */

export interface RememberedFocus {
	notePath: string;
	propertyKey: string;
	at: number;
}

/** How long a remembered focus stays relevant. */
export const FOCUS_TTL_MS = 120_000;

export function recallFocus(
	memory: RememberedFocus | null,
	notePath: string,
	now: number,
	ttlMs: number = FOCUS_TTL_MS,
): string | null {
	if (!memory) return null;
	// A different note means the memory is about something else entirely.
	if (memory.notePath !== notePath) return null;
	if (now - memory.at > ttlMs) return null;
	if (now < memory.at) return null;
	return memory.propertyKey;
}
