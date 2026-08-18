/** Shared vocabulary for the insertion pipeline. No Obsidian imports here. */

export type ResizeMode = 'none' | 'width' | 'height' | 'box';
export type ResizeFit = 'cover' | 'contain' | 'stretch';
export type OutputFormat = 'webp' | 'jpeg' | 'png';
export type LinkFormat = 'wikilink' | 'markdown' | 'path';
export type CollisionPolicy = 'suffix' | 'overwrite';

export interface Size {
	width: number;
	height: number;
}

export interface ResizeSpec {
	mode: ResizeMode;
	width: number | null;
	height: number | null;
	fit: ResizeFit;
	allowUpscale: boolean;
}

/** Region of the source image to read from, in source pixels. */
export interface SourceRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Fully resolved instruction for the raster step: draw `source` into `target`. */
export interface ResizePlan {
	source: SourceRect;
	target: Size;
}

export interface NamingContext {
	noteName: string;
	propertyKey: string;
	originalName: string;
	/** Injected rather than read from the clock, so naming stays pure. */
	now: Date;
}

export interface EncodedImage {
	data: ArrayBuffer;
	mime: string;
	extension: string;
	format: OutputFormat;
}

/** What the pipeline needs to know about where the image is going. */
export interface InsertionTarget {
	/** Vault-relative path of the note being edited. */
	notePath: string;
	/** Note basename, without extension. */
	noteName: string;
	/** Frontmatter property to write. */
	propertyKey: string;
}
