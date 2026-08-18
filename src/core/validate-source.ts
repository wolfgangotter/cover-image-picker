/**
 * Source validation. Never trust `File.type` or the extension - both are
 * attacker- and iOS-controlled. Sniff the magic bytes.
 */

import { CoverImageError } from './errors';

export type SniffedType = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'svg' | 'unknown';

/** Types the raster pipeline can actually decode. */
const DECODABLE: ReadonlySet<SniffedType> = new Set<SniffedType>(['jpeg', 'png', 'gif', 'webp']);

/** ISO-BMFF brands that mean "HEIF/HEIC still image". */
const HEIF_BRANDS: ReadonlySet<string> = new Set([
	'heic',
	'heix',
	'hevc',
	'hevx',
	'heim',
	'heis',
	'hevm',
	'hevs',
	'mif1',
	'msf1',
]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
	let out = '';
	for (let i = start; i < start + length; i++) {
		const b = bytes[i];
		if (b === undefined) return out;
		out += String.fromCharCode(b);
	}
	return out;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
	if (bytes.length < signature.length) return false;
	return signature.every((v, i) => bytes[i] === v);
}

export function sniffImageType(bytes: Uint8Array): SniffedType {
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (ascii(bytes, 0, 4) === 'GIF8') return 'gif';
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
	if (ascii(bytes, 4, 4) === 'ftyp' && HEIF_BRANDS.has(ascii(bytes, 8, 4))) return 'heic';

	// SVG is XML, not raster. Explicitly rejected: it can carry script and
	// external references, and there is nothing for us to resize.
	const head = ascii(bytes, 0, 256).trimStart().toLowerCase();
	if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';

	return 'unknown';
}

export interface SourceLimits {
	maxBytes: number;
	/** Guards against decompression bombs: a 100 MP image is ~400 MB decoded. */
	maxPixels: number;
}

/**
 * Validate the picked file before any decoding happens.
 *
 * @param header - first bytes of the file; 32 is plenty for every signature.
 */
export function validateSource(header: Uint8Array, byteLength: number, limits: SourceLimits): SniffedType {
	if (byteLength <= 0) {
		throw new CoverImageError('unsupported-type', 'empty file');
	}
	if (byteLength > limits.maxBytes) {
		throw new CoverImageError('too-large', `${byteLength} > ${limits.maxBytes}`);
	}

	const type = sniffImageType(header);
	if (type === 'heic') {
		throw new CoverImageError('heic-source', 'HEIF container');
	}
	if (!DECODABLE.has(type)) {
		throw new CoverImageError('unsupported-type', `sniffed as ${type}`);
	}
	return type;
}

/** Checked after decode, once real dimensions are known. */
export function assertPixelBudget(width: number, height: number, maxPixels: number): void {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new CoverImageError('decode-failed', `bad dimensions ${width}x${height}`);
	}
	if (width * height > maxPixels) {
		throw new CoverImageError('too-many-pixels', `${width}x${height}`);
	}
}
