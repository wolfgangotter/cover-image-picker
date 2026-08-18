/**
 * Pure resize geometry. No DOM, no canvas - so every mode and edge case is
 * unit-testable. The canvas work lives in `raster.ts`.
 */

import type { ResizePlan, ResizeSpec, Size, SourceRect } from './types';

function whole(n: number): number {
	return Math.max(1, Math.round(n));
}

function fullFrame(src: Size): SourceRect {
	return { x: 0, y: 0, width: src.width, height: src.height };
}

function scaled(src: Size, factor: number): ResizePlan {
	return {
		source: fullFrame(src),
		target: {
			width: whole(src.width * factor),
			height: whole(src.height * factor),
		},
	};
}

/**
 * Work out what to draw where.
 *
 * `contain` fits the image inside the box and may return something smaller
 * than the box - it does not pad, because a letterboxed cover image is
 * almost never what someone wants.
 *
 * `cover` fills the box exactly and centre-crops the overflow. When
 * upscaling is disallowed and the source is too small to fill the box, the
 * target shrinks proportionally so the requested *aspect ratio* is still
 * honoured without inventing pixels.
 *
 * `stretch` ignores aspect ratio by definition; with upscaling disallowed
 * each axis is independently capped at the source size.
 */
export function computeResizePlan(src: Size, spec: ResizeSpec): ResizePlan {
	if (src.width <= 0 || src.height <= 0) {
		throw new Error(`invalid source size ${src.width}x${src.height}`);
	}

	const cap = (factor: number): number => (spec.allowUpscale ? factor : Math.min(1, factor));

	switch (spec.mode) {
		case 'none':
			return {
				source: fullFrame(src),
				target: { width: src.width, height: src.height },
			};

		case 'width': {
			if (!spec.width) return computeResizePlan(src, { ...spec, mode: 'none' });
			return scaled(src, cap(spec.width / src.width));
		}

		case 'height': {
			if (!spec.height) return computeResizePlan(src, { ...spec, mode: 'none' });
			return scaled(src, cap(spec.height / src.height));
		}

		case 'box': {
			if (!spec.width || !spec.height) {
				// A half-specified box degrades to the single-axis mode that was given.
				if (spec.width) return computeResizePlan(src, { ...spec, mode: 'width' });
				if (spec.height) return computeResizePlan(src, { ...spec, mode: 'height' });
				return computeResizePlan(src, { ...spec, mode: 'none' });
			}

			if (spec.fit === 'stretch') {
				return {
					source: fullFrame(src),
					target: {
						width: whole(spec.allowUpscale ? spec.width : Math.min(spec.width, src.width)),
						height: whole(spec.allowUpscale ? spec.height : Math.min(spec.height, src.height)),
					},
				};
			}

			if (spec.fit === 'contain') {
				return scaled(src, cap(Math.min(spec.width / src.width, spec.height / src.height)));
			}

			// cover
			const fill = Math.max(spec.width / src.width, spec.height / src.height);
			const factor = cap(fill);
			// If we had to clamp, shrink the box by the same amount to keep its aspect.
			const shrink = factor / fill;
			const target: Size = {
				width: whole(spec.width * shrink),
				height: whole(spec.height * shrink),
			};

			// Centre-crop the source region that maps onto the target.
			const cropWidth = Math.min(src.width, target.width / factor);
			const cropHeight = Math.min(src.height, target.height / factor);
			return {
				source: {
					x: Math.max(0, Math.round((src.width - cropWidth) / 2)),
					y: Math.max(0, Math.round((src.height - cropHeight) / 2)),
					width: whole(cropWidth),
					height: whole(cropHeight),
				},
				target,
			};
		}
	}
}

/**
 * Downscaling by more than 2x in one `drawImage` aliases badly in WebKit.
 * Returns the intermediate widths to step through, largest first.
 */
export function halvingSteps(from: number, to: number): number[] {
	const steps: number[] = [];
	let current = from;
	while (current / 2 > to) {
		current = Math.floor(current / 2);
		steps.push(current);
	}
	return steps;
}
