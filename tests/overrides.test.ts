import { describe, expect, it } from 'vitest';
import { overridableNames, resolveResizeSpec, type PropertyOverride } from '../src/core/overrides';
import { DEFAULT_SETTINGS } from '../src/settings/schema';
import { normalizeOverrides, validateSettings } from '../src/settings/validate';
import type { ResizeSpec } from '../src/core/types';

const fallback: ResizeSpec = DEFAULT_SETTINGS.resize;
const banner: ResizeSpec = { mode: 'box', width: 2000, height: 400, fit: 'cover', allowUpscale: false };
const overrides: PropertyOverride[] = [{ property: 'banner', resize: banner }];

describe('resolveResizeSpec', () => {
	it('uses the override when one matches', () => {
		expect(resolveResizeSpec('banner', overrides, fallback, false)).toEqual(banner);
	});

	it('falls back for properties without an override', () => {
		expect(resolveResizeSpec('cover', overrides, fallback, false)).toEqual(fallback);
	});

	it('matches case-insensitively by default, so an override cannot go unreachable', () => {
		expect(resolveResizeSpec('Banner', overrides, fallback, false)).toEqual(banner);
	});

	it('respects case sensitivity when enabled', () => {
		expect(resolveResizeSpec('Banner', overrides, fallback, true)).toEqual(fallback);
		expect(resolveResizeSpec('banner', overrides, fallback, true)).toEqual(banner);
	});

	it('falls back when there are no overrides at all', () => {
		expect(resolveResizeSpec('banner', [], fallback, false)).toEqual(fallback);
	});
});

describe('overridableNames', () => {
	it('lists configured names that have no override yet', () => {
		expect(overridableNames(['cover', 'banner'], overrides, false)).toEqual(['cover']);
		expect(overridableNames(['cover'], [], false)).toEqual(['cover']);
		expect(overridableNames(['banner'], overrides, false)).toEqual([]);
	});

	it('treats casing the same way matching does', () => {
		expect(overridableNames(['Banner'], overrides, false)).toEqual([]);
		expect(overridableNames(['Banner'], overrides, true)).toEqual(['Banner']);
	});
});

describe('normalizeOverrides', () => {
	it('keeps well-formed entries and repairs their resize block', () => {
		const result = normalizeOverrides(
			[{ property: 'banner', resize: { mode: 'box', width: 99999, height: 400, fit: 'bogus' } }],
			fallback,
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.property).toBe('banner');
		expect(result[0]?.resize.width).toBe(20000);
		expect(result[0]?.resize.fit).toBe(fallback.fit);
	});

	it('drops entries that name nothing usable', () => {
		expect(normalizeOverrides([{ property: '   ' }, { property: 42 }, null], fallback)).toEqual([]);
	});

	it('de-duplicates by property, keeping the first', () => {
		const result = normalizeOverrides(
			[
				{ property: 'banner', resize: { width: 100 } },
				{ property: 'BANNER', resize: { width: 200 } },
			],
			fallback,
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.resize.width).toBe(100);
	});

	it('inherits the fallback for a missing resize block', () => {
		expect(normalizeOverrides([{ property: 'banner' }], fallback)[0]?.resize).toEqual(fallback);
	});

	it('caps the list length', () => {
		const many = Array.from({ length: 100 }, (_, i) => ({ property: `p${i}` }));
		expect(normalizeOverrides(many, fallback)).toHaveLength(32);
	});

	it('returns an empty list for non-arrays', () => {
		expect(normalizeOverrides('nope', fallback)).toEqual([]);
		expect(normalizeOverrides(undefined, fallback)).toEqual([]);
	});
});

describe('validateSettings with overrides', () => {
	it('defaults to no overrides', () => {
		expect(validateSettings({}).overrides).toEqual([]);
	});

	it('survives a hostile overrides value', () => {
		expect(validateSettings({ overrides: { not: 'an array' } }).overrides).toEqual([]);
	});
});
