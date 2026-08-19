/**
 * The single code path every trigger funnels into.
 *
 * Ports are injected, so the whole thing is exercisable without Obsidian.
 */

import { CoverImageError } from './errors';
import { buildBasename } from './naming';
import { HEADER_BYTES, readImageSize } from './image-dimensions';
import { resolveResizeSpec } from './overrides';
import { isTargetProperty, type MatchConfig } from './property-match';
import { decodeImage, drawResized } from './raster';
import { computeResizePlan } from './resize';
import { assertPixelBudget, validateSource } from './validate-source';
import type { InsertionTarget } from './types';
import type { CoverImagePickerSettings } from '../settings/schema';
import type { ImageEncoder } from '../encode/port';

/** Where the processed bytes go. Implemented by `obsidian/vault-port.ts`. */
export interface StoragePort {
	/**
	 * Write `data` near `target`, honouring the storage/naming settings.
	 * Returns the vault-relative path actually written.
	 */
	write(args: {
		data: ArrayBuffer;
		basename: string;
		extension: string;
		target: InsertionTarget;
	}): Promise<string>;
}

/** Reads and writes the note's frontmatter. Implemented by `obsidian/frontmatter-port.ts`. */
export interface FrontmatterPort {
	write(target: InsertionTarget, imagePath: string): Promise<void>;
}

export interface PipelineProgress {
	(stage: 'validating' | 'decoding' | 'resizing' | 'encoding' | 'saving' | 'linking'): void;
}

export interface PipelineResult {
	imagePath: string;
	format: string;
	bytes: number;
	width: number;
	height: number;
}

export class InsertionPipeline {
	constructor(
		private readonly settings: () => CoverImagePickerSettings,
		private readonly encoder: ImageEncoder,
		private readonly storage: StoragePort,
		private readonly frontmatter: FrontmatterPort,
	) {}

	async run(
		file: Blob,
		originalName: string,
		target: InsertionTarget,
		onProgress?: PipelineProgress,
	): Promise<PipelineResult> {
		const settings = this.settings();

		// Scope guard lives here, not in the UI, so no trigger can bypass it.
		const matchConfig: MatchConfig = {
			propertyNames: settings.propertyNames,
			matchMode: settings.matchMode,
			caseSensitive: settings.caseSensitive,
		};
		if (!isTargetProperty(target.propertyKey, matchConfig)) {
			throw new CoverImageError('no-target', `"${target.propertyKey}" is not a configured property`);
		}

		onProgress?.('validating');
		const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
		validateSource(header, file.size, {
			maxBytes: settings.encode.maxSourceBytes,
			maxPixels: settings.encode.maxSourcePixels,
		});

		/*
		 * Enforce the pixel budget from the header, before decoding allocates
		 * for it. A small, heavily compressed file can expand into hundreds of
		 * megabytes of bitmap, and on iOS that is the difference between a
		 * rejection and the app being killed. Formats this cannot read fall
		 * through to the post-decode check below.
		 */
		const declared = readImageSize(header);
		if (declared) {
			assertPixelBudget(declared.width, declared.height, settings.encode.maxSourcePixels);
		}

		onProgress?.('decoding');
		const decoded = await decodeImage(file);
		let canvas: HTMLCanvasElement;
		try {
			// Backstop for anything the header parser could not read.
			assertPixelBudget(decoded.size.width, decoded.size.height, settings.encode.maxSourcePixels);
			onProgress?.('resizing');
			const spec = resolveResizeSpec(
				target.propertyKey,
				settings.overrides,
				settings.resize,
				settings.caseSensitive,
			);
			canvas = drawResized(decoded, computeResizePlan(decoded.size, spec));
		} finally {
			decoded.release();
		}

		onProgress?.('encoding');
		const encoded = await this.encoder.encode(canvas, settings.encode.format, settings.encode.quality);
		const width = canvas.width;
		const height = canvas.height;
		canvas.width = canvas.height = 0;

		onProgress?.('saving');
		const basename = buildBasename(settings.naming.template, {
			noteName: target.noteName,
			propertyKey: target.propertyKey,
			originalName,
			now: new Date(),
		});
		const imagePath = await this.storage.write({
			data: encoded.data,
			basename,
			extension: encoded.extension,
			target,
		});

		onProgress?.('linking');
		await this.frontmatter.write(target, imagePath);

		return {
			imagePath,
			format: encoded.format,
			bytes: encoded.data.byteLength,
			width,
			height,
		};
	}
}
