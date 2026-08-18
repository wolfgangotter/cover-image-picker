import { describe, expect, it } from 'vitest';
import {
	findFrontmatterBlock,
	isInsideFrontmatter,
	listPropertyKeys,
	propertyKeyAtOffset,
} from '../src/core/frontmatter-scan';

const NOTE = ['---', 'title: Hello', 'cover:', '  - image.png', 'tags: [a, b]', '---', '', 'Body text.'].join(
	'\n',
);

/** Offset of the first character of the given line. */
function lineStart(content: string, index: number): number {
	return content.split('\n').slice(0, index).join('\n').length + (index > 0 ? 1 : 0);
}

describe('findFrontmatterBlock', () => {
	it('finds the block in a normal note', () => {
		const block = findFrontmatterBlock(NOTE);
		expect(block).not.toBeNull();
		expect(NOTE.slice(block?.from, block?.to)).toContain('title: Hello');
		expect(NOTE.slice(block?.from, block?.to)).not.toContain('Body text.');
	});

	it('returns null when there is no frontmatter', () => {
		expect(findFrontmatterBlock('Just a note.')).toBeNull();
		expect(findFrontmatterBlock('')).toBeNull();
	});

	it('ignores a --- that is not on the first line', () => {
		expect(findFrontmatterBlock('text\n---\nnot: frontmatter\n---\n')).toBeNull();
	});

	it('accepts CRLF line endings', () => {
		expect(findFrontmatterBlock('---\r\ncover: a\r\n---\r\n')).not.toBeNull();
	});

	it('accepts ... as a closing delimiter', () => {
		const block = findFrontmatterBlock('---\ncover: a\n...\nbody');
		expect(block).not.toBeNull();
		expect(block && block.to).toBeLessThan('---\ncover: a\n...\nbody'.indexOf('body'));
	});

	it('treats an unterminated block as running to the end of the file', () => {
		const block = findFrontmatterBlock('---\ncover: a\n');
		expect(block?.to).toBe('---\ncover: a\n'.length);
	});
});

describe('propertyKeyAtOffset', () => {
	it('resolves a cursor on a key line', () => {
		expect(propertyKeyAtOffset(NOTE, lineStart(NOTE, 1) + 3)).toBe('title');
		expect(propertyKeyAtOffset(NOTE, lineStart(NOTE, 4) + 2)).toBe('tags');
	});

	it('walks up from a nested list item to the key that owns it', () => {
		expect(propertyKeyAtOffset(NOTE, lineStart(NOTE, 3) + 5)).toBe('cover');
	});

	it('returns null outside the block', () => {
		expect(propertyKeyAtOffset(NOTE, NOTE.length - 2)).toBeNull();
		expect(propertyKeyAtOffset('no frontmatter here', 3)).toBeNull();
	});

	it('returns null on the opening delimiter', () => {
		expect(propertyKeyAtOffset(NOTE, 1)).toBeNull();
	});

	it('works on half-typed frontmatter', () => {
		const partial = '---\ncov';
		expect(propertyKeyAtOffset(partial, partial.length)).toBeNull();
		const typed = '---\ncover:';
		expect(propertyKeyAtOffset(typed, typed.length)).toBe('cover');
	});

	it('skips comments', () => {
		const withComment = '---\n# just a comment\ncover: a\n---\n';
		expect(propertyKeyAtOffset(withComment, withComment.indexOf('cover') + 2)).toBe('cover');
	});
});

describe('isInsideFrontmatter', () => {
	it('distinguishes the block from the body', () => {
		expect(isInsideFrontmatter(NOTE, lineStart(NOTE, 2))).toBe(true);
		expect(isInsideFrontmatter(NOTE, NOTE.length - 1)).toBe(false);
	});
});

describe('listPropertyKeys', () => {
	it('lists top-level keys in document order', () => {
		expect(listPropertyKeys(NOTE)).toEqual(['title', 'cover', 'tags']);
	});

	it('is empty without frontmatter', () => {
		expect(listPropertyKeys('body only')).toEqual([]);
	});
});
