import { TFile, type App } from 'obsidian';
import { CoverImageError } from '../core/errors';
import { buildLinkValue } from '../core/link-format';
import type { InsertionTarget } from '../core/types';
import type { FrontmatterPort } from '../core/pipeline';
import type { CoverImagePickerSettings } from '../settings/schema';

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
