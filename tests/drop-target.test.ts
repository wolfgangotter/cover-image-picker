import { describe, expect, it } from 'vitest';
import {
	carriesFiles,
	firstSupportedImage,
	isSupportedImage,
	keyFromUpwardLines,
} from '../src/core/drop-target';

describe('keyFromUpwardLines', () => {
	/** Lines are given dropped-line-first, walking upward to the document start. */
	it('resolves a drop on a key line', () => {
		expect(keyFromUpwardLines(['cover:', 'title: Hello', '---'])).toBe('cover');
	});

	it('walks up from a nested list item to the key that owns it', () => {
		expect(keyFromUpwardLines(['  - image.png', 'cover:', 'title: Hello', '---'])).toBe('cover');
	});

	/**
	 * The case that matters most: dropping into the note body must never be
	 * claimed. Walking up from the body reaches the *closing* fence, which has
	 * more lines above it, and that is the signal to refuse.
	 */
	it('refuses a drop in the note body', () => {
		const body = ['some: text in the body', '', '---', 'cover: a.png', '---'];
		expect(keyFromUpwardLines(body)).toBeNull();
	});

	it('refuses when there is no frontmatter above at all', () => {
		expect(keyFromUpwardLines(['just a line', 'another'])).toBeNull();
	});

	it('refuses when the top of the document has been virtualised away', () => {
		// No fence reachable, so we cannot prove we are inside the block.
		expect(keyFromUpwardLines(['cover:', 'title: Hello'])).toBeNull();
	});

	it('refuses on the opening fence itself', () => {
		expect(keyFromUpwardLines(['---'])).toBeNull();
	});

	it('skips blank lines and comments', () => {
		expect(keyFromUpwardLines(['', '# a comment', 'cover:', '---'])).toBe('cover');
	});

	it('accepts the ... terminator form', () => {
		expect(keyFromUpwardLines(['cover:', '...'])).toBe('cover');
	});
});

describe('isSupportedImage', () => {
	it('accepts raster images by MIME type', () => {
		expect(isSupportedImage({ name: 'a.jpg', type: 'image/jpeg' })).toBe(true);
		expect(isSupportedImage({ name: 'a.png', type: 'image/png' })).toBe(true);
		expect(isSupportedImage({ name: 'a.webp', type: 'image/webp' })).toBe(true);
	});

	it('falls back to the extension when the platform gives no MIME type', () => {
		expect(isSupportedImage({ name: 'photo.JPEG', type: '' })).toBe(true);
		expect(isSupportedImage({ name: 'notes.txt', type: '' })).toBe(false);
	});

	it('rejects SVG by both MIME type and extension', () => {
		expect(isSupportedImage({ name: 'a.svg', type: 'image/svg+xml' })).toBe(false);
		expect(isSupportedImage({ name: 'a.svg', type: '' })).toBe(false);
	});

	it('rejects non-images', () => {
		expect(isSupportedImage({ name: 'a.pdf', type: 'application/pdf' })).toBe(false);
	});
});

describe('firstSupportedImage', () => {
	it('picks the first usable image in a multi-file drop', () => {
		expect(
			firstSupportedImage([
				{ name: 'a.pdf', type: 'application/pdf' },
				{ name: 'b.png', type: 'image/png' },
			]),
		).toBe(1);
	});

	it('reports -1 when nothing is usable', () => {
		expect(firstSupportedImage([{ name: 'a.pdf', type: 'application/pdf' }])).toBe(-1);
		expect(firstSupportedImage([])).toBe(-1);
	});
});

describe('carriesFiles', () => {
	it('is true only for drags carrying OS files', () => {
		expect(carriesFiles(['Files'])).toBe(true);
		expect(carriesFiles(['text/plain'])).toBe(false);
		expect(carriesFiles([])).toBe(false);
		expect(carriesFiles(undefined)).toBe(false);
	});
});
