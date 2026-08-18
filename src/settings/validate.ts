/**
 * `data.json` is user-writable and sync-corruptible. Coerce every field
 * individually and fall back per-field rather than discarding the whole file,
 * so one bad value never costs the user their other settings.
 */

import type { PropertyOverride } from '../core/overrides';
import type {
	CollisionPolicy,
	LinkFormat,
	OutputFormat,
	ResizeFit,
	ResizeMode,
	ResizeSpec,
} from '../core/types';
import { DEFAULT_SETTINGS, type CoverImagePickerSettings, type MatchMode, type StorageMode } from './schema';

type Unknown = Record<string, unknown>;

function obj(value: unknown): Unknown {
	return typeof value === 'object' && value !== null ? (value as Unknown) : {};
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function nullableInt(value: unknown, min: number, max: number, fallback: number | null): number | null {
	if (value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function str(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value : fallback;
}

/** Trims, drops blanks, de-duplicates case-insensitively, and caps the count. */
export function normalizePropertyNames(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) return [...fallback];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') continue;
		const name = entry.trim();
		if (!name || name.length > 128) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
		if (out.length >= 32) break;
	}
	return out.length ? out : [...fallback];
}

/** Vault-relative folder path: no traversal, no absolute paths, no drive letters. */
export function normalizeFolder(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const cleaned = value
		.replace(/\\/g, '/')
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment && segment !== '.' && segment !== '..')
		.join('/');
	if (!cleaned || /^[a-zA-Z]:/.test(cleaned)) return fallback;
	return cleaned;
}

/** Shared by the vault-wide resize block and every per-property override. */
function resizeSpec(value: unknown, fallback: ResizeSpec): ResizeSpec {
	const resize = obj(value);
	return {
		mode: oneOf<ResizeMode>(resize.mode, ['none', 'width', 'height', 'box'], fallback.mode),
		width: nullableInt(resize.width, 1, 20000, fallback.width),
		height: nullableInt(resize.height, 1, 20000, fallback.height),
		fit: oneOf<ResizeFit>(resize.fit, ['cover', 'contain', 'stretch'], fallback.fit),
		allowUpscale: bool(resize.allowUpscale, fallback.allowUpscale),
	};
}

/**
 * Overrides are dropped rather than repaired when they name nothing: an
 * override for a property that does not exist is silent dead weight, and the
 * list UI would show a row the user cannot reason about.
 */
export function normalizeOverrides(
	value: unknown,
	fallbackResize: ResizeSpec,
	limit = 32,
): PropertyOverride[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: PropertyOverride[] = [];
	for (const entry of value) {
		const record = obj(entry);
		if (typeof record.property !== 'string') continue;
		const property = record.property.trim();
		if (!property || property.length > 128) continue;
		const key = property.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ property, resize: resizeSpec(record.resize, fallbackResize) });
		if (out.length >= limit) break;
	}
	return out;
}

export function validateSettings(raw: unknown): CoverImagePickerSettings {
	const d = DEFAULT_SETTINGS;
	const data = obj(raw);
	const storage = obj(data.storage);
	const naming = obj(data.naming);
	const resize = obj(data.resize);
	const encode = obj(data.encode);
	const link = obj(data.link);

	return {
		schemaVersion: 1,
		propertyNames: normalizePropertyNames(data.propertyNames, d.propertyNames),
		matchMode: oneOf<MatchMode>(data.matchMode, ['exact', 'prefix'], d.matchMode),
		caseSensitive: bool(data.caseSensitive, d.caseSensitive),
		storage: {
			mode: oneOf<StorageMode>(
				storage.mode,
				['vault-root', 'fixed-folder', 'note-folder', 'obsidian-attachments'],
				d.storage.mode,
			),
			fixedFolder: normalizeFolder(storage.fixedFolder, d.storage.fixedFolder),
			createFolderIfMissing: bool(storage.createFolderIfMissing, d.storage.createFolderIfMissing),
		},
		naming: {
			template: str(naming.template, d.naming.template).slice(0, 200),
			onCollision: oneOf<CollisionPolicy>(
				naming.onCollision,
				['suffix', 'overwrite'],
				d.naming.onCollision,
			),
		},
		resize: resizeSpec(resize, d.resize),
		overrides: normalizeOverrides(data.overrides, d.resize),
		encode: {
			format: oneOf<OutputFormat>(encode.format, ['webp', 'jpeg', 'png'], d.encode.format),
			quality: int(encode.quality, 1, 100, d.encode.quality),
			// Hard ceilings: a corrupt value must never become an unbounded allocation.
			maxSourceBytes: int(encode.maxSourceBytes, 100_000, 200_000_000, d.encode.maxSourceBytes),
			maxSourcePixels: int(encode.maxSourcePixels, 10_000, 500_000_000, d.encode.maxSourcePixels),
		},
		link: {
			format: oneOf<LinkFormat>(link.format, ['wikilink', 'markdown', 'path'], d.link.format),
		},
		showPropertyButton: bool(data.showPropertyButton, d.showPropertyButton),
		acceptDroppedImages: bool(data.acceptDroppedImages, d.acceptDroppedImages),
		deleteReplacedFile: bool(data.deleteReplacedFile, d.deleteReplacedFile),
	};
}
