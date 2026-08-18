import { describe, expect, it } from 'vitest';
import { CoverImageError, type ErrorCode } from '../src/core/errors';
import { assertPixelBudget, sniffImageType, validateSource } from '../src/core/validate-source';

/** Asserts both the error type and its code, which `objectContaining` cannot. */
function expectCode(fn: () => unknown, code: ErrorCode): void {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(CoverImageError);
		expect((err as CoverImageError).code).toBe(code);
		return;
	}
	expect.fail(`expected a ${code} error to be thrown`);
}

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const GIF = ascii('GIF89a______');
const WEBP = ascii('RIFF____WEBPVP8 ');
const HEIC = ascii('____ftypheic');
const LIMITS = { maxBytes: 1000, maxPixels: 1000 };

describe('sniffImageType', () => {
	it('identifies the decodable formats', () => {
		expect(sniffImageType(JPEG)).toBe('jpeg');
		expect(sniffImageType(PNG)).toBe('png');
		expect(sniffImageType(GIF)).toBe('gif');
		expect(sniffImageType(WEBP)).toBe('webp');
	});

	it('identifies HEIF containers by brand', () => {
		expect(sniffImageType(HEIC)).toBe('heic');
		expect(sniffImageType(ascii('____ftypmif1'))).toBe('heic');
	});

	it('does not mistake other ISO-BMFF files for HEIC', () => {
		expect(sniffImageType(ascii('____ftypmp42'))).toBe('unknown');
	});

	it('identifies SVG so it can be rejected', () => {
		expect(sniffImageType(ascii('<svg xmlns="http://x">'))).toBe('svg');
		expect(sniffImageType(ascii('<?xml version="1.0"?><svg/>'))).toBe('svg');
		expect(sniffImageType(ascii('  <svg />'))).toBe('svg');
	});

	it('reports unknown for anything else', () => {
		expect(sniffImageType(ascii('not an image at all'))).toBe('unknown');
		expect(sniffImageType(new Uint8Array(0))).toBe('unknown');
		expect(sniffImageType(bytes(0xff))).toBe('unknown');
	});

	it('does not read past the end of a truncated buffer', () => {
		expect(() => sniffImageType(bytes(0x52, 0x49))).not.toThrow();
	});
});

describe('validateSource', () => {
	it('accepts a supported image within the limits', () => {
		expect(validateSource(JPEG, 500, LIMITS)).toBe('jpeg');
	});

	it('rejects an empty file', () => {
		expect(() => validateSource(JPEG, 0, LIMITS)).toThrow(CoverImageError);
	});

	it('rejects oversize files before any decoding happens', () => {
		expectCode(() => validateSource(JPEG, 5000, LIMITS), 'too-large');
	});

	it('gives HEIC its own actionable error', () => {
		expectCode(() => validateSource(HEIC, 500, LIMITS), 'heic-source');
	});

	it('rejects SVG', () => {
		expectCode(() => validateSource(ascii('<svg/>'), 500, LIMITS), 'unsupported-type');
	});

	it('trusts the bytes, not the extension', () => {
		// A .jpg that is really a script must not get through.
		expectCode(() => validateSource(ascii('#!/bin/sh\nrm -rf /'), 500, LIMITS), 'unsupported-type');
	});
});

describe('assertPixelBudget', () => {
	it('allows images within budget', () => {
		expect(() => assertPixelBudget(10, 10, 1000)).not.toThrow();
	});

	it('rejects decompression bombs', () => {
		expectCode(() => assertPixelBudget(50_000, 50_000, 100_000_000), 'too-many-pixels');
	});

	it('rejects nonsensical dimensions', () => {
		expect(() => assertPixelBudget(0, 10, 1000)).toThrow();
		expect(() => assertPixelBudget(Number.NaN, 10, 1000)).toThrow();
		expect(() => assertPixelBudget(Number.POSITIVE_INFINITY, 10, 1000)).toThrow();
	});
});
