/**
 * Pure decisions for drag and drop.
 *
 * The rule these enforce is the spec's hard "do not do": we claim a drop only
 * when we are certain it belongs to us. Anything uncertain falls through to
 * Obsidian untouched.
 */

const FENCE = /^(---|\.\.\.)\s*$/;
const TOP_LEVEL_KEY = /^([^\s#][^:]*):/;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export interface DroppedFileInfo {
	name: string;
	type: string;
}

/**
 * Which frontmatter key a source-mode drop landed on.
 *
 * `lines` starts at the dropped line and walks *upward*, ending at the first
 * line of the document. Reading upward is what distinguishes frontmatter from
 * the body: from inside the block the first fence we meet is the opening one,
 * which is the document's first line. From the body, the first fence we meet
 * is the *closing* one, with more lines above it — and that is the case we
 * must refuse, or dropping into the note body would be hijacked.
 *
 * Returns null whenever anything is ambiguous, including when the editor has
 * virtualised the top of the document away.
 */
export function keyFromUpwardLines(lines: string[]): string | null {
	const fenceIndex = lines.findIndex((line) => FENCE.test(line.trim()));
	if (fenceIndex === -1) return null;
	// The fence must be the document's first line, or we started in the body.
	if (fenceIndex !== lines.length - 1) return null;

	for (let i = 0; i < fenceIndex; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const match = TOP_LEVEL_KEY.exec(line);
		if (match?.[1] !== undefined) return match[1].trim();
	}
	return null;
}

function extensionOf(name: string): string {
	const index = name.lastIndexOf('.');
	return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

/** Whether a dropped file is something the pipeline can actually process. */
export function isSupportedImage(file: DroppedFileInfo): boolean {
	// SVG is rejected outright: it can carry script, and there is nothing to
	// resize. Mirrors the magic-byte check in validate-source.ts.
	if (file.type === 'image/svg+xml' || extensionOf(file.name) === 'svg') return false;
	if (file.type.startsWith('image/')) return true;
	// Some platforms hand over an empty MIME type; fall back to the extension.
	return file.type === '' && IMAGE_EXTENSIONS.has(extensionOf(file.name));
}

/** Index of the first usable image in a drop, or -1. A property holds one. */
export function firstSupportedImage(files: readonly DroppedFileInfo[]): number {
	return files.findIndex((file) => isSupportedImage(file));
}

/**
 * Whether a drag carries OS files at all.
 *
 * Drags without files - text, internal Obsidian item drags - are left alone,
 * so we never call preventDefault on something we cannot handle.
 */
export function carriesFiles(types: readonly string[] | undefined): boolean {
	return types?.includes('Files') ?? false;
}
