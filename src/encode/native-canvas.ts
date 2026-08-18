import { CoverImageError } from '../core/errors';
import type { EncodedImage, OutputFormat } from '../core/types';
import { EXTENSION_BY_FORMAT, MIME_BY_FORMAT, pickFormat, type ImageEncoder } from './port';

/**
 * Canvas-native encoding.
 *
 * The WebP capability probe is the one from the Phase 0 probe plugin, which
 * reported `NO` on iOS and `YES` on desktop exactly as expected. It is cached
 * per instance rather than module-level so tests get a clean slate.
 */
export class NativeCanvasEncoder implements ImageEncoder {
	private cache = new Map<OutputFormat, boolean>();

	supports(format: OutputFormat): boolean {
		const cached = this.cache.get(format);
		if (cached !== undefined) return cached;

		let supported = false;
		try {
			const probe = createEl('canvas');
			probe.width = 1;
			probe.height = 1;
			supported = probe.toDataURL(MIME_BY_FORMAT[format]).startsWith(`data:${MIME_BY_FORMAT[format]}`);
		} catch {
			supported = format === 'png';
		}
		this.cache.set(format, supported);
		return supported;
	}

	async encode(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<EncodedImage> {
		const resolved = pickFormat(format, (f) => this.supports(f));
		const mime = MIME_BY_FORMAT[resolved];
		// PNG ignores the quality argument; passing it is harmless but pointless.
		const q = resolved === 'png' ? undefined : Math.min(1, Math.max(0.01, quality / 100));

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, mime, q);
		});
		if (!blob) {
			throw new CoverImageError('encode-failed', `toBlob returned null for ${mime}`);
		}

		return {
			data: await blob.arrayBuffer(),
			mime,
			extension: EXTENSION_BY_FORMAT[resolved],
			format: resolved,
		};
	}
}
