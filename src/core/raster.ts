/**
 * Decoding and canvas drawing - the only part of `core/` that needs a DOM.
 * The geometry it obeys is computed by the pure code in `resize.ts`.
 */

import { CoverImageError } from './errors';
import { halvingSteps } from './resize';
import type { ResizePlan, Size } from './types';

const DECODE_TIMEOUT_MS = 20_000;

export interface DecodedImage {
	source: CanvasImageSource;
	size: Size;
	/** Must be called when done: iOS webviews are memory-tight. */
	release: () => void;
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(
			() => reject(new CoverImageError('decode-failed', `${label} timed out`)),
			ms,
		);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			},
		);
	});
}

/**
 * Probe-confirmed (Q2): both paths apply EXIF orientation on desktop and iOS,
 * so no manual orientation handling is needed. `createImageBitmap` is preferred
 * because it decodes off the main thread and frees deterministically.
 */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await timeout(
				createImageBitmap(blob, { imageOrientation: 'from-image' }),
				DECODE_TIMEOUT_MS,
				'createImageBitmap',
			);
			return {
				source: bitmap,
				size: { width: bitmap.width, height: bitmap.height },
				release: () => bitmap.close(),
			};
		} catch {
			// Fall through to the <img> path, which the probe also verified.
		}
	}

	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await timeout(img.decode(), DECODE_TIMEOUT_MS, 'img.decode');
		if (!img.naturalWidth || !img.naturalHeight) {
			throw new CoverImageError('decode-failed', 'zero natural size');
		}
		return {
			source: img,
			size: { width: img.naturalWidth, height: img.naturalHeight },
			release: () => URL.revokeObjectURL(url),
		};
	} catch (err) {
		URL.revokeObjectURL(url);
		if (err instanceof CoverImageError) throw err;
		throw new CoverImageError('decode-failed', 'image decode failed', {
			cause: err,
		});
	}
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = createEl('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new CoverImageError('encode-failed', 'no 2d context');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	return ctx;
}

/**
 * Draw the planned crop at the planned size.
 *
 * Large downscales go through iterative halving: a single `drawImage` that
 * shrinks by more than 2x aliases visibly in WebKit.
 */
export function drawResized(image: DecodedImage, plan: ResizePlan): HTMLCanvasElement {
	const { source } = plan;
	const steps = halvingSteps(source.width, plan.target.width);

	let current = makeCanvas(source.width, source.height);
	context2d(current).drawImage(
		image.source,
		source.x,
		source.y,
		source.width,
		source.height,
		0,
		0,
		source.width,
		source.height,
	);

	for (const width of steps) {
		const height = Math.max(1, Math.round(current.height * (width / current.width)));
		const next = makeCanvas(width, height);
		context2d(next).drawImage(current, 0, 0, current.width, current.height, 0, 0, width, height);
		current.width = current.height = 0; // hint the collector on iOS
		current = next;
	}

	const out = makeCanvas(plan.target.width, plan.target.height);
	context2d(out).drawImage(
		current,
		0,
		0,
		current.width,
		current.height,
		0,
		0,
		plan.target.width,
		plan.target.height,
	);
	if (current !== out) current.width = current.height = 0;
	return out;
}
