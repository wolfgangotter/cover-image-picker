/**
 * @vitest-environment jsdom
 *
 * The frontmatter write path, which is the only place the plugin can destroy
 * something the user made.
 */
import { describe, expect, it, vi } from 'vitest';
import { ObsidianFrontmatter } from '../src/obsidian/frontmatter-port';
import { DEFAULT_SETTINGS } from '../src/settings/schema';
import { MarkdownView, TFile, type MockApp } from './stubs/obsidian';

const target = { notePath: 'Note.md', noteName: 'Note', propertyKey: 'cover' };

function setup(options: { openInEditor?: boolean; otherFileOpen?: boolean } = {}) {
	const order: string[] = [];

	const note = new TFile();
	note.path = 'Note.md';
	note.basename = 'Note';

	const image = new TFile();
	image.path = 'assets/Note_cover.webp';

	const view = new MarkdownView();
	view.file = note;
	const save = vi.fn(async () => {
		order.push('save');
	});
	(view as unknown as { save: () => Promise<void> }).save = save;

	const otherView = new MarkdownView();
	const otherFile = new TFile();
	otherFile.path = 'Elsewhere.md';
	otherView.file = otherFile;
	const otherSave = vi.fn(async () => {
		order.push('save:other');
	});
	(otherView as unknown as { save: () => Promise<void> }).save = otherSave;

	const leaves: { view: MarkdownView }[] = [];
	if (options.openInEditor !== false) leaves.push({ view });
	if (options.otherFileOpen) leaves.push({ view: otherView });

	const processFrontMatter = vi.fn(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
		order.push('processFrontMatter');
		fn(frontmatter);
	});
	const frontmatter: Record<string, unknown> = {};

	const app = {
		workspace: { getLeavesOfType: () => leaves },
		vault: {
			getFileByPath: (path: string) => (path === note.path ? note : path === image.path ? image : null),
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter }),
			fileToLinktext: (file: TFile) => file.path.replace(/\.[^.]+$/, ''),
			getFirstLinkpathDest: () => image,
		},
		fileManager: { processFrontMatter },
	} as unknown as MockApp;

	const port = new ObsidianFrontmatter(app as never, () => DEFAULT_SETTINGS);
	return { port, order, save, otherSave, frontmatter, processFrontMatter };
}

describe('flushing pending editor changes', () => {
	/**
	 * requestSave is debounced by two seconds while processFrontMatter works on
	 * disk. Writing without flushing first means the editor's later save lands
	 * with its stale in-memory copy and quietly drops the property.
	 */
	it('saves the open editor before touching the file', async () => {
		const { port, order, save } = setup();

		await port.write(target, 'assets/Note_cover.webp');

		expect(save).toHaveBeenCalledTimes(1);
		expect(order).toEqual(['save', 'processFrontMatter']);
	});

	it('flushes before clearing a property too', async () => {
		const { port, order, save } = setup();

		await port.clear(target);

		expect(save).toHaveBeenCalledTimes(1);
		expect(order).toEqual(['save', 'processFrontMatter']);
	});

	it('only flushes editors showing this note', async () => {
		const { port, save, otherSave } = setup({ otherFileOpen: true });

		await port.write(target, 'assets/Note_cover.webp');

		expect(save).toHaveBeenCalledTimes(1);
		expect(otherSave).not.toHaveBeenCalled();
	});

	it('writes fine when the note is not open at all', async () => {
		const { port, order } = setup({ openInEditor: false });

		await port.write(target, 'assets/Note_cover.webp');

		expect(order).toEqual(['processFrontMatter']);
	});

	it('still writes when the flush fails', async () => {
		const { port, save, order } = setup();
		save.mockRejectedValueOnce(new Error('read only'));
		// The failure is reported to the console on purpose; keep it out of the run.
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await port.write(target, 'assets/Note_cover.webp');

		expect(order).toContain('processFrontMatter');
		expect(logged).toHaveBeenCalledTimes(1);
	});
});

describe('the value written', () => {
	it('writes a wikilink built from the vault-relative link text', async () => {
		const { port, frontmatter } = setup();

		await port.write(target, 'assets/Note_cover.webp');

		expect(frontmatter.cover).toBe('[[assets/Note_cover]]');
	});

	it('removes only the targeted property when clearing', async () => {
		const { port, frontmatter } = setup();
		frontmatter.cover = 'x';
		frontmatter.title = 'keep me';

		await port.clear(target);

		expect(frontmatter).toEqual({ title: 'keep me' });
	});

	it('reports a YAML failure as a frontmatter problem', async () => {
		const { port, processFrontMatter } = setup();
		processFrontMatter.mockRejectedValueOnce(new Error('YAMLParseError'));

		await expect(port.write(target, 'assets/Note_cover.webp')).rejects.toMatchObject({
			code: 'frontmatter-failed',
		});
	});
});
