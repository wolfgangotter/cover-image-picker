import type { EncodedImage, OutputFormat } from '../core/types';

export interface ImageEncoder {
	/** Whether this encoder can produce `format` on the current platform. */
	supports(format: OutputFormat): boolean;
	encode(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<EncodedImage>;
}

export const MIME_BY_FORMAT: Record<OutputFormat, string> = {
	webp: 'image/webp',
	jpeg: 'image/jpeg',
	png: 'image/png',
};

export const EXTENSION_BY_FORMAT: Record<OutputFormat, string> = {
	webp: 'webp',
	jpeg: 'jpg',
	png: 'png',
};

/**
 * Pure format negotiation, so the fallback rule is testable without a canvas.
 *
 * Probe-confirmed (D1): WebKit cannot encode WebP, so on iOS a `webp` request
 * lands on JPEG. PNG is the last resort because every engine must support it.
 */
export function pickFormat(
	requested: OutputFormat,
	supports: (format: OutputFormat) => boolean,
): OutputFormat {
	if (supports(requested)) return requested;
	if (requested === 'webp' && supports('jpeg')) return 'jpeg';
	return 'png';
}
