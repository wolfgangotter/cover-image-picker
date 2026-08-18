/**
 * Turns a vault path into the string written to the frontmatter property.
 *
 * Probe-confirmed (D2): Obsidian's YAML serialiser quotes `[[...]]` correctly
 * and registers the result in `frontmatterLinks`, so wikilinks get rename
 * tracking for free. `markdown` and `path` do not.
 */

import type { LinkFormat } from './types';

/**
 * Percent-encode for a markdown link target. Encodes spaces and parentheses,
 * which would otherwise terminate the link early.
 */
function encodeTarget(path: string): string {
	return encodeURI(path).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export interface LinkOptions {
	format: LinkFormat;
	/** Link text for wikilinks: shortest unique form when the vault allows it. */
	linktext: string;
	/** Full vault-relative path, used by the markdown and plain formats. */
	vaultPath: string;
	/** Rendered as the embed alt text / wikilink alias. */
	alias?: string;
}

export function buildLinkValue(options: LinkOptions): string {
	const { format, linktext, vaultPath, alias } = options;
	switch (format) {
		case 'wikilink':
			return alias ? `[[${linktext}|${alias}]]` : `[[${linktext}]]`;
		case 'markdown':
			return `![${alias ?? ''}](${encodeTarget(vaultPath)})`;
		case 'path':
			return vaultPath;
	}
}

/**
 * A YAML scalar that must survive Obsidian's serialiser and any other parser
 * that touches the file. Obsidian quotes correctly today; this is belt and
 * braces for anything that writes the value as raw text.
 */
export function needsYamlQuoting(value: string): boolean {
	if (value === '') return true;
	if (/^[[{!&*#?|>%@`'"-]/.test(value)) return true;
	if (/:\s/.test(value) || /\s#/.test(value)) return true;
	if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true;
	if (/^[+-]?(\d|\.\d)/.test(value) && Number.isFinite(Number(value))) return true;
	return /[\n\r\t]/.test(value);
}

/** Double-quote and escape, for the rare paths where we emit YAML text ourselves. */
export function toYamlScalar(value: string): string {
	if (!needsYamlQuoting(value)) return value;
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
