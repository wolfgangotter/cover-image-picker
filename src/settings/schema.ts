import type { CollisionPolicy, LinkFormat, OutputFormat, ResizeFit, ResizeMode } from '../core/types';

export type StorageMode = 'vault-root' | 'fixed-folder' | 'note-folder' | 'obsidian-attachments';
export type MatchMode = 'exact' | 'prefix';

export interface CoverImagePickerSettings {
	schemaVersion: 1;

	/** Scope guard: nothing outside these property names is ever touched. */
	propertyNames: string[];
	matchMode: MatchMode;
	caseSensitive: boolean;

	storage: {
		mode: StorageMode;
		fixedFolder: string;
		createFolderIfMissing: boolean;
	};

	naming: {
		template: string;
		onCollision: CollisionPolicy;
	};

	resize: {
		mode: ResizeMode;
		width: number | null;
		height: number | null;
		fit: ResizeFit;
		allowUpscale: boolean;
	};

	encode: {
		format: OutputFormat;
		/** 1-100. Ignored for PNG. */
		quality: number;
		maxSourceBytes: number;
		maxSourcePixels: number;
	};

	link: {
		format: LinkFormat;
	};

	/** Independent affordances that share an attachment point on the row. */
	showPropertyButton: boolean;
	acceptDroppedImages: boolean;
	// Both off detaches the internal-DOM adapter entirely (the F1 kill switch).

	/** Destructive; opt-in only. */
	deleteReplacedFile: boolean;
}

export const DEFAULT_SETTINGS: CoverImagePickerSettings = {
	schemaVersion: 1,
	propertyNames: ['cover', 'banner'],
	matchMode: 'exact',
	caseSensitive: false,
	storage: {
		mode: 'fixed-folder',
		fixedFolder: 'assets/covers',
		createFolderIfMissing: true,
	},
	naming: {
		template: '{{noteName}}_{{property}}',
		onCollision: 'suffix',
	},
	resize: {
		mode: 'box',
		width: 1600,
		height: 900,
		fit: 'cover',
		allowUpscale: false,
	},
	encode: {
		format: 'webp',
		quality: 75,
		maxSourceBytes: 25_000_000,
		maxSourcePixels: 100_000_000,
	},
	link: {
		format: 'wikilink',
	},
	showPropertyButton: true,
	acceptDroppedImages: true,
	deleteReplacedFile: false,
};
