import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stubbed wholesale: the point of these tests is the order of the checks, and
 * decoding needs a DOM the assertions do not.
 */
const decodeImage = vi.fn<(blob: Blob) => Promise<unknown>>();
const drawResized = vi.fn<() => HTMLCanvasElement>(
	() => ({ width: 10, height: 10 }) as unknown as HTMLCanvasElement,
);
vi.mock('../src/core/raster', () => ({
	decodeImage: (blob: Blob) => decodeImage(blob),
	drawResized: () => drawResized(),
}));

const { InsertionPipeline } = await import('../src/core/pipeline');
const { CoverImageError } = await import('../src/core/errors');
const { DEFAULT_SETTINGS } = await import('../src/settings/schema');

function fixture(name: string): Uint8Array {
	return new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
}

/** A PNG header rewritten to claim a size it does not have. */
function pngClaiming(width: number, height: number): Blob {
	const bytes = Uint8Array.from(fixture('64x32.png'));
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return new Blob([bytes], { type: 'image/png' });
}

const target = { notePath: 'Note.md', noteName: 'Note', propertyKey: 'cover' };

function makePipeline(over: Partial<typeof DEFAULT_SETTINGS> = {}) {
	const settings = { ...DEFAULT_SETTINGS, ...over };
	const encoder = {
		supports: () => true,
		encode: vi.fn(async () => ({
			data: new ArrayBuffer(4),
			mime: 'image/webp',
			extension: 'webp',
			format: 'webp' as const,
		})),
	};
	const storage = { write: vi.fn(async () => 'assets/Note_cover.webp') };
	const frontmatter = { write: vi.fn(async () => undefined) };
	const pipeline = new InsertionPipeline(() => settings, encoder, storage, frontmatter);
	return { pipeline, encoder, storage, frontmatter };
}

beforeEach(() => {
	decodeImage.mockReset();
	decodeImage.mockResolvedValue({
		source: {},
		size: { width: 64, height: 32 },
		release: vi.fn(),
	});
	drawResized.mockClear();
});

describe('pixel budget', () => {
	/**
	 * The whole reason the header parser exists: rejecting after decoding is
	 * too late, because the allocation the budget guards against has already
	 * happened.
	 */
	it('rejects an oversized image without decoding it', async () => {
		const { pipeline } = makePipeline();

		await expect(pipeline.run(pngClaiming(30_000, 30_000), 'bomb.png', target)).rejects.toThrow(
			CoverImageError,
		);
		expect(decodeImage).not.toHaveBeenCalled();
	});

	it('reports it as a pixel-count problem, not a generic failure', async () => {
		const { pipeline } = makePipeline();
		await expect(pipeline.run(pngClaiming(30_000, 30_000), 'bomb.png', target)).rejects.toMatchObject({
			code: 'too-many-pixels',
		});
	});

	it('lets an image within budget through to decoding', async () => {
		const { pipeline, storage, frontmatter } = makePipeline();

		await pipeline.run(pngClaiming(64, 32), 'fine.png', target);

		expect(decodeImage).toHaveBeenCalledTimes(1);
		expect(storage.write).toHaveBeenCalledTimes(1);
		expect(frontmatter.write).toHaveBeenCalledTimes(1);
	});

	it('still catches an oversized image whose header could not be read', async () => {
		const { pipeline } = makePipeline();
		// A JPEG the parser gives up on, but which decodes huge.
		decodeImage.mockResolvedValue({
			source: {},
			size: { width: 30_000, height: 30_000 },
			release: vi.fn(),
		});
		const opaque = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0, 0, 0, 0, 0, 0])], {
			type: 'image/jpeg',
		});

		await expect(pipeline.run(opaque, 'opaque.jpg', target)).rejects.toMatchObject({
			code: 'too-many-pixels',
		});
		expect(decodeImage).toHaveBeenCalledTimes(1);
	});
});

describe('scope guard', () => {
	it('refuses a property that is not configured, before touching the file', async () => {
		const { pipeline } = makePipeline();

		await expect(
			pipeline.run(pngClaiming(64, 32), 'fine.png', { ...target, propertyKey: 'title' }),
		).rejects.toMatchObject({ code: 'no-target' });
		expect(decodeImage).not.toHaveBeenCalled();
	});
});

describe('source validation', () => {
	it('rejects a file that is not a supported image', async () => {
		const { pipeline } = makePipeline();
		const text = new Blob(['just some text, not an image at all'], { type: 'image/png' });

		await expect(pipeline.run(text, 'note.png', target)).rejects.toMatchObject({
			code: 'unsupported-type',
		});
		expect(decodeImage).not.toHaveBeenCalled();
	});

	it('rejects a file over the size limit before reading it', async () => {
		const { pipeline } = makePipeline({
			encode: { ...DEFAULT_SETTINGS.encode, maxSourceBytes: 100 },
		});

		await expect(pipeline.run(pngClaiming(64, 32), 'fine.png', target)).rejects.toMatchObject({
			code: 'too-large',
		});
		expect(decodeImage).not.toHaveBeenCalled();
	});
});
