import { describe, expect, it } from 'vitest';
import { buildBasename, renderTemplate, resolveCollision, sanitizeFilename } from '../src/core/naming';
import type { NamingContext } from '../src/core/types';

const ctx = (over: Partial<NamingContext> = {}): NamingContext => ({
	noteName: 'My Note',
	propertyKey: 'cover',
	originalName: 'IMG_1234.HEIC',
	now: new Date(2026, 7, 17, 9, 5, 3),
	...over,
});

describe('renderTemplate', () => {
	it('substitutes every supported token', () => {
		expect(renderTemplate('{{noteName}}_{{property}}', ctx())).toBe('My Note_cover');
		expect(renderTemplate('{{originalName}}', ctx())).toBe('IMG_1234');
		expect(renderTemplate('{{date}}', ctx())).toBe('2026-08-17');
		expect(renderTemplate('{{time}}', ctx())).toBe('090503');
		expect(renderTemplate('{{timestamp}}', ctx())).toBe(String(ctx().now.getTime()));
	});

	it('tolerates whitespace and any casing inside the braces', () => {
		expect(renderTemplate('{{ noteName }}', ctx())).toBe('My Note');
		expect(renderTemplate('{{NOTENAME}}', ctx())).toBe('My Note');
	});

	it('drops unknown tokens rather than leaking them into the filename', () => {
		expect(renderTemplate('a{{nope}}b', ctx())).toBe('ab');
	});
});

describe('sanitizeFilename', () => {
	it('keeps spaces and ordinary punctuation', () => {
		expect(sanitizeFilename('My Note (final), v2')).toBe('My Note (final), v2');
	});

	it('strips path separators so traversal cannot survive', () => {
		// No separators survive, and no ".." sequence either.
		expect(sanitizeFilename('../../etc/passwd')).toBe('-.-etc-passwd');
		expect(sanitizeFilename('a/b\\c')).toBe('a-b-c');
	});

	it('strips characters that would break Obsidian links', () => {
		expect(sanitizeFilename('a[[b]]c#d^e|f')).toBe('a-b-c-d-e-f');
	});

	it('strips control characters', () => {
		expect(sanitizeFilename('a\u0000b\u001fc')).toBe('a-b-c');
		expect(sanitizeFilename('tab\there')).toBe('tab-here');
	});

	it('removes leading and trailing dots', () => {
		expect(sanitizeFilename('...hidden...')).toBe('hidden');
		expect(sanitizeFilename('.')).toBe('cover-image');
		expect(sanitizeFilename('..')).toBe('cover-image');
	});

	it('falls back for empty and reserved names', () => {
		expect(sanitizeFilename('')).toBe('cover-image');
		expect(sanitizeFilename('   ')).toBe('cover-image');
		expect(sanitizeFilename('CON')).toBe('cover-image');
		expect(sanitizeFilename('lpt1')).toBe('cover-image');
	});

	it('caps the length', () => {
		expect(sanitizeFilename('x'.repeat(500))).toHaveLength(100);
	});

	it('preserves non-ASCII and normalises to NFC', () => {
		expect(sanitizeFilename('Übergröße')).toBe('Übergröße');
		// Decomposed U + combining diaeresis must fold to the precomposed form,
		// so the same photo never yields two different filenames.
		expect(sanitizeFilename('U\u0308ber')).toBe('\u00dcber');
	});

	it('is idempotent', () => {
		const once = sanitizeFilename('../a[[b]]#c');
		expect(sanitizeFilename(once)).toBe(once);
	});
});

describe('buildBasename', () => {
	it('sanitises after substituting, so hostile note names cannot escape', () => {
		expect(buildBasename('{{noteName}}_{{property}}', ctx({ noteName: '../../evil' }))).toBe(
			'-.-evil_cover',
		);
	});
});

describe('resolveCollision', () => {
	it('uses the plain name when nothing is in the way', () => {
		expect(resolveCollision('cover', 'jpg', () => false)).toBe('cover.jpg');
	});

	it('suffixes from 1 upwards', () => {
		const taken = new Set(['cover.jpg', 'cover-1.jpg']);
		expect(resolveCollision('cover', 'jpg', (name) => taken.has(name))).toBe('cover-2.jpg');
	});

	it('gives up gracefully rather than looping forever', () => {
		const result = resolveCollision('cover', 'jpg', () => true, 3);
		expect(result).toMatch(/^cover-\d+\.jpg$/);
	});
});
