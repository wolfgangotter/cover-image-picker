/**
 * @vitest-environment jsdom
 *
 * Disable/enable behaviour.
 *
 * The plugin injects elements and listeners into DOM that Obsidian owns, so
 * unloading has to leave the vault exactly as it found it. A stray button or a
 * duplicated one after a re-enable is the kind of thing a catalogue reviewer
 * notices, and it is invisible to every other test here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CoverImagePickerPlugin from '../src/main';
import { MarkdownView, TFile, type MockApp } from './stubs/obsidian';
import { installObsidianDom, makePropertyRow } from './stubs/dom';

function makeView(keys: string[]): MarkdownView {
	const view = new MarkdownView();
	const file = new TFile();
	file.path = 'Note.md';
	file.basename = 'Note';
	view.file = file;

	const container = document.createElement('div');
	container.className = 'metadata-container';
	for (const key of keys) container.appendChild(makePropertyRow(key));
	view.contentEl.appendChild(container);

	// Obsidian renders views inside the workspace; mirror that so the adapter's
	// document-wide sweeps can see these rows too.
	document.body.appendChild(view.contentEl);
	return view;
}

function makeApp(view: MarkdownView): MockApp {
	const noopRef = () => ({});
	return {
		workspace: {
			containerEl: document.body,
			on: noopRef,
			off: () => {},
			offref: () => {},
			onLayoutReady: (cb: () => void) => cb(),
			getActiveFile: () => view.file,
			getActiveViewOfType: () => null,
			getLeavesOfType: () => [{ view }],
			getLeaf: () => ({ openFile: async () => {} }),
		},
		vault: { on: noopRef } as unknown as MockApp['vault'],
		metadataCache: { on: noopRef, getFileCache: () => null } as unknown as MockApp['metadataCache'],
		fileManager: {} as unknown as MockApp['fileManager'],
	};
}

/** Tracked so every plugin is unloaded, even the ones a test does not unload
 *  itself: a live MutationObserver outliving the test fires against a torn-down
 *  document and turns into unrelated noise. */
const loaded: CoverImagePickerPlugin[] = [];

async function loadPlugin(view: MarkdownView): Promise<CoverImagePickerPlugin> {
	const plugin = new CoverImagePickerPlugin(makeApp(view) as never, { id: 'cover-image-picker' } as never);
	(plugin as unknown as { _loaded: boolean })._loaded = true;
	await plugin.onload();
	loaded.push(plugin);
	return plugin;
}

const buttons = () => document.querySelectorAll('.cip-insert-button');
const dropZones = () => document.querySelectorAll('.cip-drop-zone');
const fileInputs = () => document.querySelectorAll('input[type=file]');

beforeEach(() => {
	document.body.innerHTML = '';
	installObsidianDom();
});

afterEach(() => {
	while (loaded.length) loaded.pop()?.unload();
});

describe('decoration', () => {
	it('decorates only the configured properties', async () => {
		await loadPlugin(makeView(['cover', 'title', 'banner']));

		expect(buttons()).toHaveLength(2);
		const decorated = Array.from(buttons(), (b) =>
			b.closest('.metadata-property')?.getAttribute('data-property-key'),
		);
		expect(decorated.sort()).toEqual(['banner', 'cover']);
	});

	it('leaves non-matching rows completely untouched', async () => {
		await loadPlugin(makeView(['title']));

		expect(buttons()).toHaveLength(0);
		expect(dropZones()).toHaveLength(0);
	});

	it('never decorates the same row twice', async () => {
		const plugin = await loadPlugin(makeView(['cover']));

		plugin.refreshPropertyRows();
		plugin.refreshPropertyRows();

		expect(buttons()).toHaveLength(1);
		expect(dropZones()).toHaveLength(1);
	});
});

describe('disable', () => {
	it('removes every button and drop zone it added', async () => {
		const plugin = await loadPlugin(makeView(['cover', 'banner']));
		expect(buttons()).toHaveLength(2);

		plugin.unload();

		expect(buttons()).toHaveLength(0);
		expect(dropZones()).toHaveLength(0);
	});

	it('removes its file input from the document', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		expect(fileInputs()).toHaveLength(1);

		plugin.unload();

		expect(fileInputs()).toHaveLength(0);
	});

	it('leaves the property rows themselves intact', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		plugin.unload();

		const row = document.querySelector('.metadata-property');
		expect(row).not.toBeNull();
		expect(row?.getAttribute('data-property-key')).toBe('cover');
		expect(row?.querySelector('.metadata-property-value')).not.toBeNull();
		// No leftover marker classes of ours.
		expect(row?.className).toBe('metadata-property');
	});
});

describe('re-enable', () => {
	it('does not duplicate anything', async () => {
		const view = makeView(['cover']);
		const first = await loadPlugin(view);
		first.unload();

		const second = await loadPlugin(view);

		expect(buttons()).toHaveLength(1);
		expect(dropZones()).toHaveLength(1);
		expect(fileInputs()).toHaveLength(1);
		second.unload();
	});

	it('picks up property names changed while it was off', async () => {
		const view = makeView(['hero']);
		const plugin = await loadPlugin(view);
		expect(buttons()).toHaveLength(0);

		plugin.settings.propertyNames = ['hero'];
		plugin.refreshPropertyRows();

		expect(buttons()).toHaveLength(1);
	});
});
