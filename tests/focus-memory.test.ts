import { describe, expect, it } from 'vitest';
import { FOCUS_TTL_MS, recallFocus, type RememberedFocus } from '../src/core/focus-memory';

const memory: RememberedFocus = { notePath: 'notes/a.md', propertyKey: 'cover', at: 1_000_000 };

describe('recallFocus', () => {
	it('returns the property while the memory is fresh', () => {
		expect(recallFocus(memory, 'notes/a.md', memory.at)).toBe('cover');
		expect(recallFocus(memory, 'notes/a.md', memory.at + FOCUS_TTL_MS - 1)).toBe('cover');
	});

	it('expires after the TTL', () => {
		expect(recallFocus(memory, 'notes/a.md', memory.at + FOCUS_TTL_MS + 1)).toBeNull();
	});

	it('ignores a memory from a different note', () => {
		expect(recallFocus(memory, 'notes/b.md', memory.at)).toBeNull();
	});

	it('returns null when nothing is remembered', () => {
		expect(recallFocus(null, 'notes/a.md', Date.now())).toBeNull();
	});

	it('ignores a memory from the future, which means the clock moved', () => {
		expect(recallFocus(memory, 'notes/a.md', memory.at - 1)).toBeNull();
	});

	it('honours a custom TTL', () => {
		expect(recallFocus(memory, 'notes/a.md', memory.at + 50, 10)).toBeNull();
	});
});
