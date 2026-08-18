import { TFile, type App } from 'obsidian';
import { CoverImageError } from '../core/errors';
import { buildLinkValue } from '../core/link-format';
import type { InsertionTarget } from '../core/types';
import type { FrontmatterPort } from '../core/pipeline';
import type { CoverImagePickerSettings } from '../settings/schema';

/** Recovers a linkpath from the plain and markdown formats, which are not tracked. */
function asPlainPath(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const markdown = /^!?\[[^\]]*\]\(([^)]+)\)$/.exec(value.trim());
	if (markdown?.[1]) return decodeURI(markdown[1]);
	const wiki = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(value.trim());
	if (wiki?.[1]) return wiki[1];
	return value.trim();
}

export class ObsidianFrontmatter implements FrontmatterPort {
	constructor(
		private readonly app: App,
		private readonly settings: () => CoverImagePickerSettings,
	) {}

	private fileFor(target: InsertionTarget): TFile {
		const file = this.app.vault.getFileByPath(target.notePath);
		if (!(file instanceof TFile)) {
			throw new CoverImageError('frontmatter-failed', 'note not found');
		}
		return file;
	}

	/** Current raw value of the property, for the replace/remove decisions. */
	read(target: InsertionTarget): unknown {
		const file = this.app.vault.getFileByPath(target.notePath);
		if (!(file instanceof TFile)) return undefined;
		return this.app.metadataCache.getFileCache(file)?.frontmatter?.[target.propertyKey];
	}

	/**
	 * The file the property currently points at, if it resolves.
	 *
	 * Works because Obsidian registers our wikilinks in `frontmatterLinks`
	 * (probe-confirmed, D2), so link resolution is reliable and we never have
	 * to string-match paths.
	 */
	resolveLinkedFile(target: InsertionTarget): TFile | null {
		const note = this.app.vault.getFileByPath(target.notePath);
		if (!(note instanceof TFile)) return null;

		const cache = this.app.metadataCache.getFileCache(note);
		const link = cache?.frontmatterLinks?.find((entry) => entry.key === target.propertyKey);
		const raw = link?.link ?? asPlainPath(cache?.frontmatter?.[target.propertyKey]);
		if (!raw) return null;

		return this.app.metadataCache.getFirstLinkpathDest(raw, note.path);
	}

	/** Removes the property entirely, leaving the rest of the frontmatter alone. */
	async clear(target: InsertionTarget): Promise<void> {
		const file = this.fileFor(target);
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				delete frontmatter[target.propertyKey];
			});
		} catch (err) {
			throw new CoverImageError('frontmatter-failed', 'processFrontMatter failed', { cause: err });
		}
	}

	async write(target: InsertionTarget, imagePath: string): Promise<void> {
		const file = this.fileFor(target);
		const image = this.app.vault.getFileByPath(imagePath);

		const value = buildLinkValue({
			format: this.settings().link.format,
			// Shortest unique form, honouring the vault's own link settings.
			linktext:
				image instanceof TFile ? this.app.metadataCache.fileToLinktext(image, file.path) : imagePath,
			vaultPath: imagePath,
		});

		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[target.propertyKey] = value;
			});
		} catch (err) {
			// Most likely a YAMLParseError from frontmatter the user broke by hand.
			throw new CoverImageError('frontmatter-failed', 'processFrontMatter failed', { cause: err });
		}
	}
}
