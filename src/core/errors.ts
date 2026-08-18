/**
 * Typed error taxonomy.
 *
 * Every failure the user can hit carries a short, safe message. Internal
 * detail belongs in `cause` and goes to the console only - never into a
 * Notice, and never into the note.
 */

export type ErrorCode =
	| 'no-target'
	| 'unsupported-type'
	| 'heic-source'
	| 'too-large'
	| 'too-many-pixels'
	| 'decode-failed'
	| 'encode-failed'
	| 'write-failed'
	| 'frontmatter-failed'
	| 'cancelled';

const MESSAGES: Record<ErrorCode, string> = {
	'no-target': 'No cover property to insert into.',
	'unsupported-type': 'That file is not a supported image (use JPEG, PNG, WebP or GIF).',
	'heic-source':
		'HEIC photos cannot be read here. On iPhone set Settings → Camera → Formats to "Most Compatible", then try again.',
	'too-large': 'That image is too large. Raise the size limit in settings if this is intentional.',
	'too-many-pixels': 'That image has too many pixels to process safely.',
	'decode-failed': 'That image could not be read.',
	'encode-failed': 'The image could not be converted.',
	'write-failed': 'The image could not be saved to your vault.',
	'frontmatter-failed': 'The note’s properties could not be updated. Check its YAML for errors.',
	cancelled: 'Cancelled.',
};

export class CoverImageError extends Error {
	readonly code: ErrorCode;
	/** Safe to show to the user. */
	readonly userMessage: string;

	constructor(code: ErrorCode, detail?: string, options?: { cause?: unknown }) {
		super(detail ?? code, options);
		this.name = 'CoverImageError';
		this.code = code;
		this.userMessage = MESSAGES[code];
	}
}

/** Narrow an unknown thrown value to a user-safe message without leaking internals. */
export function toUserMessage(err: unknown): string {
	if (err instanceof CoverImageError) return err.userMessage;
	return 'Something went wrong inserting the image.';
}
