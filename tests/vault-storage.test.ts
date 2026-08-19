/**
 * Storage modes decide where files land in someone's vault, which makes them
 * the highest-consequence branch in the plugin: a wrong answer scatters files
 * somewhere the user did not ask for and may not find.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { VaultStorage, isInsideFolder } from '../src/obsidian/vault-port';
import { DEFAULT_SETTINGS, type CoverImagePickerSettings } from '../src/settings/schema';
import type { InsertionTarget } from '../src/core/types';
import { TFile, TFolder, type MockApp } from './stubs/obsidian';

/** Minimal in-memory vault: enough for the port to make its decisions against. */
interface FakeVault {
	files: Set<string>;
	folders: Set<string>;
	created: { path: string; bytes: number }[];
	modified: string[];
	attachmentFolder: string;
	app: () => MockApp;
}

function makeVault(): FakeVault {
	const files = new Set<string>();
	const folders = new Set<string>();
	const created: { path: string; bytes: number }[] = [];
	const modified: string[] = [];
	const attachmentFolder = 'Attachments';

	const asFile = (path: string): TFile => {
		const file = new TFile();
		file.path = path;
		return file;
	};
	const asFolder = (path: string): TFolder => {
		const folder = new TFolder();
		folder.path = path;
		return folder;
	};

	const app = (): MockApp =>
		({
			workspace: {},
			vault: {
				getFolderByPath: (path: string) => (folders.has(path) ? asFolder(path) : null),
				getAbstractFileByPath: (path: string) => (files.has(path) ? asFile(path) : null),
				getFileByPath: (path: string) => (files.has(path) ? asFile(path) : null),
				createFolder: async (path: string) => {
					folders.add(path);
					return asFolder(path);
				},
				createBinary: async (path: string, data: ArrayBuffer) => {
					files.add(path);
					created.push({ path, bytes: data.byteLength });
					return asFile(path);
				},
				modifyBinary: async (file: TFile) => {
					modified.push(file.path);
				},
			},
			metadataCache: {},
			fileManager: {
				getNewFileParent: () => asFolder(attachmentFolder),
				// Obsidian suffixes rather than returning a path that is taken;
				// mirroring that is what makes the overwrite interaction visible.
				getAvailablePathForAttachment: async (name: string) => {
					const dot = name.lastIndexOf('.');
					const base = name.slice(0, dot);
					const ext = name.slice(dot + 1);
					let candidate = `${attachmentFolder}/${name}`;
					for (let i = 1; files.has(candidate); i++) {
						candidate = `${attachmentFolder}/${base} ${i}.${ext}`;
					}
					return candidate;
				},
			},
		}) as unknown as MockApp;

	return { files, folders, created, modified, attachmentFolder, app };
}

const target: InsertionTarget = {
	notePath: 'Journal/2026/Trip.md',
	noteName: 'Trip',
	propertyKey: 'cover',
};

let vault: FakeVault;

function storage(
	over: Partial<CoverImagePickerSettings['storage']> = {},
	naming: Partial<CoverImagePickerSettings['naming']> = {},
) {
	const settings: CoverImagePickerSettings = {
		...DEFAULT_SETTINGS,
		storage: { ...DEFAULT_SETTINGS.storage, ...over },
		naming: { ...DEFAULT_SETTINGS.naming, ...naming },
	};
	return new VaultStorage(vault.app() as never, () => settings);
}

const write = (s: VaultStorage, basename = 'Trip_cover') =>
	s.write({ data: new ArrayBuffer(8), basename, extension: 'webp', target });

beforeEach(() => {
	vault = makeVault();
});

describe('storage modes', () => {
	it('vault-root writes beside nothing else', async () => {
		expect(await write(storage({ mode: 'vault-root' }))).toBe('Trip_cover.webp');
	});

	it('note-folder writes next to the note', async () => {
		expect(await write(storage({ mode: 'note-folder' }))).toBe('Journal/2026/Trip_cover.webp');
	});

	it('note-folder handles a note at the vault root', async () => {
		const s = storage({ mode: 'note-folder' });
		const path = await s.write({
			data: new ArrayBuffer(8),
			basename: 'Note_cover',
			extension: 'webp',
			target: { notePath: 'Note.md', noteName: 'Note', propertyKey: 'cover' },
		});
		expect(path).toBe('Note_cover.webp');
	});

	it('fixed-folder writes into the configured folder', async () => {
		vault.folders.add('assets/covers');
		expect(await write(storage({ mode: 'fixed-folder', fixedFolder: 'assets/covers' }))).toBe(
			'assets/covers/Trip_cover.webp',
		);
	});

	it('creates a missing folder when allowed', async () => {
		await write(storage({ mode: 'fixed-folder', fixedFolder: 'assets/covers' }));
		expect(vault.folders.has('assets/covers')).toBe(true);
	});

	it('refuses to write when the folder is missing and creation is off', async () => {
		await expect(
			write(
				storage({ mode: 'fixed-folder', fixedFolder: 'assets/covers', createFolderIfMissing: false }),
			),
		).rejects.toThrow();
		expect(vault.created).toHaveLength(0);
	});

	it('obsidian-attachments defers to Obsidian for the path', async () => {
		expect(await write(storage({ mode: 'obsidian-attachments' }))).toBe('Attachments/Trip_cover.webp');
	});

	it('creates the attachment folder if Obsidian points at a missing one', async () => {
		await write(storage({ mode: 'obsidian-attachments' }));
		expect(vault.folders.has('Attachments')).toBe(true);
	});
});

describe('collisions', () => {
	it('suffixes rather than clobbering an existing file', async () => {
		vault.folders.add('assets/covers');
		vault.files.add('assets/covers/Trip_cover.webp');
		expect(await write(storage({ mode: 'fixed-folder', fixedFolder: 'assets/covers' }))).toBe(
			'assets/covers/Trip_cover-1.webp',
		);
	});

	it('overwrites in place when asked, without creating a second file', async () => {
		vault.folders.add('assets/covers');
		vault.files.add('assets/covers/Trip_cover.webp');
		const s = storage(
			{ mode: 'fixed-folder', fixedFolder: 'assets/covers' },
			{ onCollision: 'overwrite' },
		);
		expect(await write(s)).toBe('assets/covers/Trip_cover.webp');
		expect(vault.modified).toEqual(['assets/covers/Trip_cover.webp']);
		expect(vault.created).toHaveLength(0);
	});

	/**
	 * Attachments mode hands the whole path decision to Obsidian, which resolves
	 * collisions itself - so our own overwrite policy does not apply there.
	 * Asserted rather than left implicit, because the two settings look like
	 * they should interact and do not.
	 */
	it('leaves collision handling to Obsidian in attachments mode', async () => {
		vault.files.add('Attachments/Trip_cover.webp');
		const s = storage({ mode: 'obsidian-attachments' }, { onCollision: 'overwrite' });

		// Note the asymmetry: "overwrite" is ignored here, because Obsidian has
		// already picked a free path. Attachments mode accumulates files rather
		// than replacing one, which is the price of deferring to the user's own
		// attachment settings.
		expect(await write(s)).toBe('Attachments/Trip_cover 1.webp');
		expect(vault.modified).toEqual([]);
	});
});

describe('isInsideFolder', () => {
	it('accepts a file directly inside the folder', () => {
		expect(isInsideFolder('assets/covers/a.webp', 'assets/covers')).toBe(true);
		expect(isInsideFolder('a.webp', '')).toBe(true);
	});

	it('rejects traversal and escapes', () => {
		expect(isInsideFolder('assets/../../a.webp', 'assets')).toBe(false);
		expect(isInsideFolder('elsewhere/a.webp', 'assets')).toBe(false);
		expect(isInsideFolder('assetsX/a.webp', 'assets')).toBe(false);
		expect(isInsideFolder('nested/a.webp', '')).toBe(false);
	});

	it('rejects the folder itself', () => {
		expect(isInsideFolder('assets', 'assets')).toBe(false);
		expect(isInsideFolder('', '')).toBe(false);
	});
});
