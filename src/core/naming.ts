/**
 * Filename construction. Pure, so the sanitiser can be tested against
 * hostile input directly.
 */

import type { NamingContext } from './types';

/**
 * Control characters, plus everything illegal on some filesystem we care
 * about, plus the characters that would break Obsidian link syntax.
 * Spaces and ordinary punctuation are deliberately kept: they are legal and
 * users expect them in filenames.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point: they must be stripped from filenames
const ILLEGAL = /[\u0000-\u001f\u007f/\\:*?"<>|#^[\]]/g;
const TOKEN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
const MAX_BASENAME = 100;

/** Windows reserved device names; harmless elsewhere, fatal there. */
const RESERVED = new Set([
	'con',
	'prn',
	'aux',
	'nul',
	...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
	...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

const FALLBACK = 'cover-image';

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function tokenValue(name: string, ctx: NamingContext): string | null {
	switch (name.toLowerCase()) {
		case 'notename':
			return ctx.noteName;
		case 'property':
			return ctx.propertyKey;
		case 'originalname':
			return ctx.originalName.replace(/\.[^.]+$/, '');
		case 'date':
			return `${ctx.now.getFullYear()}-${pad(ctx.now.getMonth() + 1)}-${pad(ctx.now.getDate())}`;
		case 'time':
			return `${pad(ctx.now.getHours())}${pad(ctx.now.getMinutes())}${pad(ctx.now.getSeconds())}`;
		case 'timestamp':
			return String(ctx.now.getTime());
		default:
			return null;
	}
}

/** Unknown tokens collapse to nothing rather than leaking `{{typo}}` into a filename. */
export function renderTemplate(template: string, ctx: NamingContext): string {
	return template.replace(TOKEN, (_match, name: string) => tokenValue(name, ctx) ?? '');
}

export function sanitizeFilename(raw: string): string {
	const cleaned = raw
		.normalize('NFC')
		.replace(ILLEGAL, '-')
		.replace(/\s+/g, ' ')
		.replace(/-{2,}/g, '-')
		// Collapse dot runs so ".." can never survive into a filename. The
		// storage port rejects any path containing "..", and a legitimate note
		// called "a..b" must not trip that guard.
		.replace(/\.{2,}/g, '.')
		.trim()
		// Leading dots hide files; trailing dots break Windows.
		.replace(/^\.+/, '')
		.replace(/\.+$/, '')
		.trim();

	const capped = cleaned.slice(0, MAX_BASENAME).trim();
	if (!capped || RESERVED.has(capped.toLowerCase())) return FALLBACK;
	return capped;
}

export function buildBasename(template: string, ctx: NamingContext): string {
	return sanitizeFilename(renderTemplate(template, ctx));
}

/**
 * Find a free filename. `taken` is asked about full `name.ext` strings.
 * Suffixes count from 1 so the first duplicate reads `cover-1.jpg`.
 */
export function resolveCollision(
	basename: string,
	extension: string,
	taken: (filename: string) => boolean,
	limit = 1000,
): string {
	const first = `${basename}.${extension}`;
	if (!taken(first)) return first;

	for (let i = 1; i <= limit; i++) {
		const candidate = `${basename}-${i}.${extension}`;
		if (!taken(candidate)) return candidate;
	}
	// Astronomically unlikely; still better than looping forever.
	return `${basename}-${Date.now()}.${extension}`;
}
