/**
 * Reads an image's pixel dimensions from its header, without decoding it.
 *
 * The pixel budget exists to stop a small, highly compressed file from
 * expanding into hundreds of megabytes of bitmap. Checking it after decoding
 * is too late - the allocation has already happened, and on iOS that is the
 * difference between a rejection and the app being killed. Parsing the header
 * first lets the budget do the job it was added for.
 *
 * Returns null whenever the size cannot be established. Callers must treat
 * that as "unknown", never as "safe": the post-decode check remains the
 * backstop for formats and variants this does not recognise.
 *
 * EXIF orientation is deliberately ignored. A rotated image swaps width and
 * height, but the product - which is all the budget cares about - is the same.
 */

import type { Size } from './types';

/** Enough for a JPEG's SOF segment to appear after any EXIF thumbnail. */
export const HEADER_BYTES = 64 * 1024;

function byteAt(bytes: Uint8Array, index: number): number | null {
	const value = bytes[index];
	return value === undefined ? null : value;
}

function u16be(bytes: Uint8Array, index: number): number | null {
	const hi = byteAt(bytes, index);
	const lo = byteAt(bytes, index + 1);
	return hi === null || lo === null ? null : (hi << 8) | lo;
}

function u32be(bytes: Uint8Array, index: number): number | null {
	const a = byteAt(bytes, index);
	const b = byteAt(bytes, index + 1);
	const c = byteAt(bytes, index + 2);
	const d = byteAt(bytes, index + 3);
	if (a === null || b === null || c === null || d === null) return null;
	// >>> 0 keeps a top-bit-set length unsigned rather than negative.
	return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function u16le(bytes: Uint8Array, index: number): number | null {
	const lo = byteAt(bytes, index);
	const hi = byteAt(bytes, index + 1);
	return lo === null || hi === null ? null : lo | (hi << 8);
}

function u24le(bytes: Uint8Array, index: number): number | null {
	const a = byteAt(bytes, index);
	const b = byteAt(bytes, index + 1);
	const c = byteAt(bytes, index + 2);
	return a === null || b === null || c === null ? null : a | (b << 8) | (c << 16);
}

function u32le(bytes: Uint8Array, index: number): number | null {
	const lo = u16le(bytes, index);
	const hi = u16le(bytes, index + 2);
	return lo === null || hi === null ? null : (lo | (hi << 16)) >>> 0;
}

function ascii(bytes: Uint8Array, index: number, length: number): string {
	let out = '';
	for (let i = index; i < index + length; i++) {
		const value = byteAt(bytes, i);
		if (value === null) return '';
		out += String.fromCharCode(value);
	}
	return out;
}

function sized(width: number | null, height: number | null): Size | null {
	if (width === null || height === null) return null;
	if (width <= 0 || height <= 0) return null;
	return { width, height };
}

/* --------------------------------------------------------------- PNG */

function pngSize(bytes: Uint8Array): Size | null {
	// The IHDR chunk is mandatory and must come first.
	if (ascii(bytes, 12, 4) !== 'IHDR') return null;
	return sized(u32be(bytes, 16), u32be(bytes, 20));
}

/* --------------------------------------------------------------- GIF */

function gifSize(bytes: Uint8Array): Size | null {
	// Logical screen descriptor, immediately after the 6-byte signature.
	return sized(u16le(bytes, 6), u16le(bytes, 8));
}

/* -------------------------------------------------------------- WebP */

function webpSize(bytes: Uint8Array): Size | null {
	const chunk = ascii(bytes, 12, 4);

	if (chunk === 'VP8X') {
		// Extended format: canvas size is stored minus one.
		const width = u24le(bytes, 24);
		const height = u24le(bytes, 27);
		return width === null || height === null ? null : sized(width + 1, height + 1);
	}

	if (chunk === 'VP8L') {
		if (byteAt(bytes, 20) !== 0x2f) return null;
		const packed = u32le(bytes, 21);
		if (packed === null) return null;
		// 14 bits each, both stored minus one.
		return sized((packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1);
	}

	if (chunk === 'VP8 ') {
		// Lossy: a keyframe starts with a 3-byte tag then this start code.
		for (let i = 20; i < Math.min(bytes.length - 9, 64); i++) {
			if (byteAt(bytes, i) !== 0x9d) continue;
			if (byteAt(bytes, i + 1) !== 0x01 || byteAt(bytes, i + 2) !== 0x2a) continue;
			const width = u16le(bytes, i + 3);
			const height = u16le(bytes, i + 5);
			if (width === null || height === null) return null;
			// The top two bits are the scaling factor, not part of the size.
			return sized(width & 0x3fff, height & 0x3fff);
		}
	}

	return null;
}

/* -------------------------------------------------------------- JPEG */

/** Frame headers that carry the size. Excludes DHT (C4), JPG (C8) and DAC (CC). */
const JPEG_FRAME_MARKERS = new Set([
	0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Markers that stand alone, carrying no length field. */
function isStandalone(marker: number): boolean {
	return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

function jpegSize(bytes: Uint8Array): Size | null {
	let index = 2; // past the SOI
	while (index + 9 < bytes.length) {
		if (byteAt(bytes, index) !== 0xff) {
			index++; // resynchronise rather than give up
			continue;
		}
		const marker = byteAt(bytes, index + 1);
		if (marker === null) return null;
		if (marker === 0xff) {
			index++; // fill byte
			continue;
		}
		if (isStandalone(marker)) {
			index += 2;
			continue;
		}
		// Start of scan: past this point is entropy-coded data, not headers.
		if (marker === 0xda) return null;

		const length = u16be(bytes, index + 2);
		if (length === null || length < 2) return null;

		if (JPEG_FRAME_MARKERS.has(marker)) {
			// length, precision, then height before width.
			return sized(u16be(bytes, index + 7), u16be(bytes, index + 5));
		}
		index += 2 + length;
	}
	return null;
}

/* ------------------------------------------------------------ dispatch */

export function readImageSize(bytes: Uint8Array): Size | null {
	if (byteAt(bytes, 0) === 0xff && byteAt(bytes, 1) === 0xd8) return jpegSize(bytes);
	if (ascii(bytes, 0, 4) === '\x89PNG') return pngSize(bytes);
	if (ascii(bytes, 0, 4) === 'GIF8') return gifSize(bytes);
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpSize(bytes);
	return null;
}
