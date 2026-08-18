/**
 * Locates the frontmatter block and works out which property the cursor is
 * sitting in. Used by the source-mode branch of the target resolution chain.
 *
 * Deliberately a plain string scan rather than a YAML parse: it has to work on
 * half-typed, syntactically invalid frontmatter, which is exactly when someone
 * is editing a property.
 */

export interface FrontmatterBlock {
	/** Offset of the first character after the opening `---` line. */
	from: number;
	/** Offset of the newline before the closing delimiter. */
	to: number;
}

const OPENING = /^---\r?\n/;
const CLOSING = /^(---|\.\.\.)\s*$/;
const TOP_LEVEL_KEY = /^([^\s#][^:]*):/;

/** Returns null when the file has no frontmatter block at all. */
export function findFrontmatterBlock(content: string): FrontmatterBlock | null {
	const opening = OPENING.exec(content);
	if (!opening) return null;

	const from = opening[0].length;
	let offset = from;

	while (offset <= content.length) {
		let lineEnd = content.indexOf('\n', offset);
		if (lineEnd === -1) lineEnd = content.length;
		const line = content.slice(offset, lineEnd).replace(/\r$/, '');

		if (CLOSING.test(line)) {
			return { from, to: offset };
		}
		if (lineEnd === content.length) break;
		offset = lineEnd + 1;
	}
	// Unterminated block: treat the rest of the file as frontmatter so that a
	// cursor inside it still resolves rather than silently falling through.
	return { from, to: content.length };
}

export function isInsideFrontmatter(content: string, offset: number): boolean {
	const block = findFrontmatterBlock(content);
	return block !== null && offset >= block.from && offset <= block.to;
}

/**
 * The top-level property key that `offset` belongs to, or null.
 *
 * Walks backwards, so a cursor on a nested list item resolves to the key that
 * owns the list:
 *
 *     cover:
 *       - image.png     <- cursor here returns "cover"
 */
export function propertyKeyAtOffset(content: string, offset: number): string | null {
	const block = findFrontmatterBlock(content);
	if (!block || offset < block.from || offset > block.to) return null;

	const region = content.slice(block.from, Math.min(block.to, content.length));
	const cursor = offset - block.from;

	let searched = 0;
	let found: string | null = null;
	for (const rawLine of region.split('\n')) {
		const lineStart = searched;
		searched += rawLine.length + 1;
		if (lineStart > cursor) break;

		const line = rawLine.replace(/\r$/, '');
		if (!line.trim() || line.startsWith('#')) continue;

		const match = TOP_LEVEL_KEY.exec(line);
		if (match?.[1] !== undefined) found = match[1].trim();
	}
	return found;
}

/** Every top-level key in the block, in document order. */
export function listPropertyKeys(content: string): string[] {
	const block = findFrontmatterBlock(content);
	if (!block) return [];

	const keys: string[] = [];
	for (const rawLine of content.slice(block.from, block.to).split('\n')) {
		const line = rawLine.replace(/\r$/, '');
		if (!line.trim() || line.startsWith('#')) continue;
		const match = TOP_LEVEL_KEY.exec(line);
		if (match?.[1] !== undefined) keys.push(match[1].trim());
	}
	return keys;
}
