import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings/schema';
import { normalizeFolder, normalizePropertyNames, validateSettings } from '../src/settings/validate';

describe('validateSettings', () => {
	it('returns defaults for absent or nonsense input', () => {
		expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings('not an object')).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps good values while repairing bad ones in the same object', () => {
		const result = validateSettings({
			propertyNames: ['hero'],
			encode: { format: 'nonsense', quality: 900 },
		});
		expect(result.propertyNames).toEqual(['hero']);
		expect(result.encode.format).toBe(DEFAULT_SETTINGS.encode.format);
		expect(result.encode.quality).toBe(100);
	});

	it('clamps numbers into range rather than rejecting the file', () => {
		expect(validateSettings({ encode: { quality: -5 } }).encode.quality).toBe(1);
		expect(validateSettings({ resize: { width: 999999 } }).resize.width).toBe(20000);
		expect(validateSettings({ resize: { width: 12.7 } }).resize.width).toBe(13);
	});

	it('caps the memory-relevant limits so a corrupt file cannot cause a huge allocation', () => {
		expect(validateSettings({ encode: { maxSourceBytes: 1e12 } }).encode.maxSourceBytes).toBe(
			200_000_000,
		);
		expect(validateSettings({ encode: { maxSourcePixels: 1e12 } }).encode.maxSourcePixels).toBe(
			500_000_000,
		);
		expect(validateSettings({ encode: { maxSourceBytes: -1 } }).encode.maxSourceBytes).toBe(100_000);
	});

	it('preserves an explicit null resize dimension', () => {
		expect(validateSettings({ resize: { width: null } }).resize.width).toBeNull();
	});

	it('rejects unknown enum members', () => {
		expect(validateSettings({ link: { format: 'html' } }).link.format).toBe('wikilink');
		expect(validateSettings({ storage: { mode: '../escape' } }).storage.mode).toBe(
			DEFAULT_SETTINGS.storage.mode,
		);
	});

	it('ignores unknown keys', () => {
		expect(validateSettings({ evil: true })).toEqual(DEFAULT_SETTINGS);
	});
});

describe('normalizePropertyNames', () => {
	it('trims, drops blanks and de-duplicates case-insensitively', () => {
		expect(normalizePropertyNames([' cover ', 'Cover', '', 'banner'], ['x'])).toEqual([
			'cover',
			'banner',
		]);
	});

	it('falls back when nothing usable survives', () => {
		expect(normalizePropertyNames([], ['cover'])).toEqual(['cover']);
		expect(normalizePropertyNames([1, {}, null], ['cover'])).toEqual(['cover']);
		expect(normalizePropertyNames('cover', ['cover'])).toEqual(['cover']);
	});

	it('caps the number of names', () => {
		expect(
			normalizePropertyNames(
				Array.from({ length: 100 }, (_, i) => `p${i}`),
				['x'],
			),
		).toHaveLength(32);
	});
});

describe('normalizeFolder', () => {
	it('strips traversal segments', () => {
		expect(normalizeFolder('../../etc', 'fallback')).toBe('etc');
		expect(normalizeFolder('a/../b', 'fallback')).toBe('a/b');
		expect(normalizeFolder('./assets', 'fallback')).toBe('assets');
	});

	it('normalises separators and stray slashes', () => {
		expect(normalizeFolder('a\\b', 'fallback')).toBe('a/b');
		expect(normalizeFolder('/assets//covers/', 'fallback')).toBe('assets/covers');
	});

	it('rejects absolute Windows paths', () => {
		expect(normalizeFolder('C:/Users/x', 'fallback')).toBe('fallback');
	});

	it('falls back for empty or non-string input', () => {
		expect(normalizeFolder('', 'fallback')).toBe('fallback');
		expect(normalizeFolder('   ', 'fallback')).toBe('fallback');
		expect(normalizeFolder(null, 'fallback')).toBe('fallback');
	});
});
