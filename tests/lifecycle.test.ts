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
import type { InsertionTarget } from '../src/core/types';
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

/** Counts full sweeps: decorateAll starts by enumerating the markdown leaves. */
let leafQueries = 0;

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
			getLeavesOfType: () => {
				leafQueries++;
				return [{ view }];
			},
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

async function loadPlugin(view: MarkdownView, stored?: unknown): Promise<CoverImagePickerPlugin> {
	const plugin = new CoverImagePickerPlugin(makeApp(view) as never, { id: 'cover-image-picker' } as never);
	(plugin as unknown as { _loaded: boolean })._loaded = true;
	if (stored !== undefined) plugin.loadData = () => Promise.resolve(stored);
	await plugin.onload();
	loaded.push(plugin);
	return plugin;
}

/**
 * Records what the pipeline was asked to do, instead of letting it run: jsdom
 * has no canvas, and what these tests care about is which property was
 * targeted, not the encoding.
 */
function captureRuns(plugin: CoverImagePickerPlugin): InsertionTarget[] {
	const seen: InsertionTarget[] = [];
	plugin.pipeline = {
		run: async (_file: Blob, _name: string, target: InsertionTarget) => {
			seen.push(target);
			return { imagePath: 'x.webp', format: 'webp', bytes: 1, width: 1, height: 1 };
		},
	} as unknown as CoverImagePickerPlugin['pipeline'];
	return seen;
}

/** Dispatches a drop carrying one image; true if the plugin claimed it. */
function dropImageOn(row: Element): boolean {
	const evt = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
		dataTransfer: unknown;
	};
	const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' });
	Object.defineProperty(evt, 'dataTransfer', {
		value: { files: [file], types: ['Files'] },
	});
	row.dispatchEvent(evt);
	return evt.defaultPrevented;
}

const rowFor = (key: string) => document.querySelector(`[data-property-key="${key}"]`);
const buttons = () => document.querySelectorAll('.cip-insert-button');
const dropZones = () => document.querySelectorAll('.cip-drop-zone');
const fileInputs = () => document.querySelectorAll('input[type=file]');

beforeEach(() => {
	document.body.innerHTML = '';
	leafQueries = 0;
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

	/**
	 * The MutationObserver path re-runs decoration constantly with no removal
	 * in between, so the `!button` / `!hasClass` guards are what stop buttons
	 * stacking up. Driving refresh() instead would remove-then-re-add and pass
	 * even with those guards deleted.
	 */
	it('never decorates the same row twice on repeated rescans', async () => {
		await loadPlugin(makeView(['cover']));

		for (let i = 0; i < 3; i++) {
			document.body.appendChild(document.createElement('div'));
			await new Promise((r) => setTimeout(r, 0));
		}

		expect(buttons()).toHaveLength(1);
		expect(dropZones()).toHaveLength(1);
	});

	/**
	 * The regression this filter must never cause: a property added to a note
	 * after load still has to be picked up from the DOM alone, with no
	 * workspace event to fall back on.
	 */
	it('decorates a property row added after load', async () => {
		await loadPlugin(makeView(['title']));
		expect(buttons()).toHaveLength(0);

		document.querySelector('.metadata-container')?.appendChild(makePropertyRow('cover'));
		await new Promise((r) => setTimeout(r, 0));

		expect(buttons()).toHaveLength(1);
	});

	it('ignores editor mutations that cannot have touched a property row', async () => {
		await loadPlugin(makeView(['cover']));

		// Stand in for typing: churn well away from the properties block.
		const editor = document.createElement('div');
		editor.className = 'cm-content';
		document.body.appendChild(editor);
		await new Promise((r) => setTimeout(r, 0));

		const sweepsBefore = leafQueries;
		for (let i = 0; i < 20; i++) {
			editor.appendChild(document.createElement('span'));
			await new Promise((r) => setTimeout(r, 0));
		}

		// Not "the buttons look unchanged" - decorateAll is idempotent, so that
		// would pass with the filter removed. No sweep may have run at all.
		expect(leafQueries).toBe(sweepsBefore);
		expect(buttons()).toHaveLength(1);
	});

	it('does sweep when the properties block itself changes', async () => {
		await loadPlugin(makeView(['cover']));
		await new Promise((r) => setTimeout(r, 0));

		const sweepsBefore = leafQueries;
		document.querySelector('.metadata-container')?.appendChild(makePropertyRow('banner'));
		await new Promise((r) => setTimeout(r, 0));

		expect(leafQueries).toBeGreaterThan(sweepsBefore);
	});

	/**
	 * Obsidian renames a property in place, changing data-property-key on the
	 * existing node. A target captured at decoration time would keep writing to
	 * the old property.
	 */
	it('follows a property renamed in place', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		const runs = captureRuns(plugin);
		const row = rowFor('cover') as Element;

		// cover -> banner: still configured, so the row stays live - but it must
		// now write to `banner`, not to the key captured when it was decorated.
		row.setAttribute('data-property-key', 'banner');
		expect(dropImageOn(row)).toBe(true);
		expect(runs.at(-1)?.propertyKey).toBe('banner');

		// banner -> title: no longer ours, so the drop must fall through.
		row.setAttribute('data-property-key', 'title');
		expect(dropImageOn(row)).toBe(false);
		expect(runs).toHaveLength(1);
	});

	/**
	 * Every settings write calls refresh, including each step of a slider drag.
	 * Rebuilding the rows for a change that cannot affect them is wasted DOM
	 * work in the foreground, so the same button element must survive.
	 */
	it('does not rebuild rows for a setting that cannot affect them', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		const before = buttons()[0];

		plugin.settings.encode.quality = 42;
		plugin.refreshPropertyRows();

		expect(buttons()).toHaveLength(1);
		expect(buttons()[0]).toBe(before);
	});

	it('undecorates a row that stops matching, drop zone included', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		captureRuns(plugin);
		expect(dropZones()).toHaveLength(1);

		plugin.settings.propertyNames = ['banner'];
		plugin.refreshPropertyRows();

		expect(buttons()).toHaveLength(0);
		expect(dropZones()).toHaveLength(0);
		expect(dropImageOn(rowFor('cover') as Element)).toBe(false);
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

	it('stops responding to drops, so no listener survives', async () => {
		const plugin = await loadPlugin(makeView(['cover']));
		const runs = captureRuns(plugin);
		const row = rowFor('cover') as Element;
		expect(dropImageOn(row)).toBe(true);

		plugin.unload();

		expect(dropImageOn(row)).toBe(false);
		expect(runs).toHaveLength(1);
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
		const first = await loadPlugin(view);
		expect(buttons()).toHaveLength(0);

		first.unload();

		// A fresh instance reading the settings that were saved meanwhile,
		// which is what enabling the plugin again actually does.
		const second = await loadPlugin(view, { propertyNames: ['hero'] });

		expect(buttons()).toHaveLength(1);
		expect(second.settings.propertyNames).toEqual(['hero']);
	});
});
