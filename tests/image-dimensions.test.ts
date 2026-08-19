import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readImageSize } from '../src/core/image-dimensions';

/** Real encoder output, so the parser is tested against actual layouts. */
function fixture(name: string): Uint8Array {
	return new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
}

const EXPECTED = { width: 64, height: 32 };

describe('readImageSize', () => {
	it('reads PNG', () => {
		expect(readImageSize(fixture('64x32.png'))).toEqual(EXPECTED);
	});

	it('reads GIF', () => {
		expect(readImageSize(fixture('64x32.gif'))).toEqual(EXPECTED);
	});

	it('reads lossy WebP', () => {
		expect(readImageSize(fixture('64x32-lossy.webp'))).toEqual(EXPECTED);
	});

	it('reads lossless WebP', () => {
		expect(readImageSize(fixture('64x32-lossless.webp'))).toEqual(EXPECTED);
	});

	it('reads baseline JPEG, skipping the EXIF segment', () => {
		expect(readImageSize(fixture('64x32-exif.jpg'))).toEqual(EXPECTED);
	});

	it('reads progressive JPEG, whose frame header is a different marker', () => {
		expect(readImageSize(fixture('64x32-progressive.jpg'))).toEqual(EXPECTED);
	});

	/**
	 * The fixture is stored 64x32 with EXIF orientation 6, so it displays as
	 * 32x64. We report the stored size on purpose: the budget cares about the
	 * product, which is identical either way, and rotating here would only
	 * invite disagreement with what the decoder later reports.
	 */
	it('reports stored dimensions, not EXIF-oriented ones', () => {
		const size = readImageSize(fixture('64x32-exif.jpg'));
		expect(size).toEqual({ width: 64, height: 32 });
		expect((size?.width ?? 0) * (size?.height ?? 0)).toBe(2048);
	});
});

describe('readImageSize on input it cannot use', () => {
	const bytes = (...values: number[]) => new Uint8Array(values);

	it('returns null rather than guessing', () => {
		expect(readImageSize(bytes(0, 1, 2, 3, 4, 5, 6, 7))).toBeNull();
		expect(readImageSize(new Uint8Array(0))).toBeNull();
		expect(readImageSize(new Uint8Array([...'not an image'].map((c) => c.charCodeAt(0))))).toBeNull();
	});

	it('survives truncation at every offset of a real file', () => {
		const png = fixture('64x32.png');
		for (let length = 0; length < png.length; length++) {
			expect(() => readImageSize(png.subarray(0, length))).not.toThrow();
		}
	});

	it('survives truncation of a JPEG, where the parser scans forward', () => {
		const jpeg = fixture('64x32-exif.jpg');
		for (let length = 0; length < jpeg.length; length++) {
			expect(() => readImageSize(jpeg.subarray(0, length))).not.toThrow();
		}
	});

	it('does not loop forever on a JPEG of pure marker bytes', () => {
		expect(readImageSize(new Uint8Array(4096).fill(0xff))).toBeNull();
	});

	it('does not loop forever on a JPEG with a zero-length segment', () => {
		const evil = new Uint8Array(64);
		evil.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
		expect(readImageSize(evil)).toBeNull();
	});

	it('gives up at the start of scan rather than reading pixel data', () => {
		const noFrame = new Uint8Array(64);
		noFrame.set([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
		expect(readImageSize(noFrame)).toBeNull();
	});

	it('rejects a header that claims a zero dimension', () => {
		const png = Uint8Array.from(fixture('64x32.png'));
		png.set([0, 0, 0, 0], 16); // width = 0
		expect(readImageSize(png)).toBeNull();
	});

	it('reads a very large declared size without overflowing', () => {
		const png = Uint8Array.from(fixture('64x32.png'));
		png.set([0x7f, 0xff, 0xff, 0xff], 16);
		expect(readImageSize(png)?.width).toBe(0x7fffffff);
	});
});
