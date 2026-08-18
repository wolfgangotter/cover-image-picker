import { normalizePath, TFile, type App } from 'obsidian';
import { CoverImageError } from '../core/errors';
import { resolveCollision } from '../core/naming';
import type { InsertionTarget } from '../core/types';
import type { StoragePort } from '../core/pipeline';
import type { CoverImagePickerSettings } from '../settings/schema';

function parentOf(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

function trimFolder(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

/**
 * Path containment check, run after normalisation.
 *
 * The second of two independent traversal defences - the first is filename
 * sanitisation in `core/naming.ts`. Deliberately redundant.
 */
export function isInsideFolder(path: string, folder: string): boolean {
	if (path.includes('..')) return false;
	if (!folder) return path.length > 0 && !path.includes('/');
	return path.startsWith(`${folder}/`) && path.slice(folder.length + 1).length > 0;
}

export class VaultStorage implements StoragePort {
	constructor(
		private readonly app: App,
		private readonly settings: () => CoverImagePickerSettings,
	) {}

	/** Vault-relative folder the image lands in, for every mode except attachments. */
	resolveFolder(target: InsertionTarget): string {
		const { storage } = this.settings();
		switch (storage.mode) {
			case 'vault-root':
				return '';
			case 'note-folder':
				return parentOf(target.notePath);
			case 'fixed-folder':
				return trimFolder(normalizePath(storage.fixedFolder));
			case 'obsidian-attachments':
				return trimFolder(this.app.fileManager.getNewFileParent(target.notePath).path);
		}
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		if (this.app.vault.getFolderByPath(folder)) return;

		if (!this.settings().storage.createFolderIfMissing) {
			throw new CoverImageError('write-failed', `folder "${folder}" does not exist`);
		}
		try {
			await this.app.vault.createFolder(folder);
		} catch (err) {
			// A concurrent write may have created it; only genuine absence is fatal.
			if (!this.app.vault.getFolderByPath(folder)) {
				throw new CoverImageError('write-failed', 'could not create folder', { cause: err });
			}
		}
	}

	/**
	 * Attachments mode defers entirely to Obsidian: `getAvailablePathForAttachment`
	 * honours the user's attachment-folder setting and resolves collisions itself,
	 * so we must not second-guess it with our own naming logic.
	 */
	private async attachmentPath(basename: string, extension: string, notePath: string): Promise<string> {
		const path = normalizePath(
			await this.app.fileManager.getAvailablePathForAttachment(`${basename}.${extension}`, notePath),
		);
		await this.ensureFolder(parentOf(path));
		return path;
	}

	private async plainPath(basename: string, extension: string, folder: string): Promise<string> {
		await this.ensureFolder(folder);
		const prefix = folder ? `${folder}/` : '';
		const filename =
			this.settings().naming.onCollision === 'overwrite'
				? `${basename}.${extension}`
				: resolveCollision(
						basename,
						extension,
						(candidate) => this.app.vault.getAbstractFileByPath(`${prefix}${candidate}`) !== null,
					);

		const path = normalizePath(`${prefix}${filename}`);
		if (!isInsideFolder(path, folder)) {
			throw new CoverImageError('write-failed', 'refusing to write outside the target folder');
		}
		return path;
	}

	async write(args: {
		data: ArrayBuffer;
		basename: string;
		extension: string;
		target: InsertionTarget;
	}): Promise<string> {
		const path =
			this.settings().storage.mode === 'obsidian-attachments'
				? await this.attachmentPath(args.basename, args.extension, args.target.notePath)
				: await this.plainPath(args.basename, args.extension, this.resolveFolder(args.target));

		try {
			const existing = this.app.vault.getFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modifyBinary(existing, args.data);
			} else {
				await this.app.vault.createBinary(path, args.data);
			}
		} catch (err) {
			throw new CoverImageError('write-failed', 'vault write failed', {
				cause: err,
			});
		}
		return path;
	}
}
