/**
 * @vitest-environment jsdom
 *
 * Load smoke test.
 *
 * "Failed to load plugin" is the worst thing we can ship and no other test
 * sees it: every unit test here imports pure modules that never run onload.
 * This walks the real wiring in main.ts against a stubbed Obsidian.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import CoverImagePickerPlugin from '../src/main';
import { createMockApp, type MockApp } from './stubs/obsidian';

/** The stub Plugin records these; the real `Plugin` type does not expose them. */
interface Recorded {
	commands: { id: string; name: string }[];
	settingTabs: { getSettingDefinitions: () => unknown[] }[];
}
const recorded = (plugin: CoverImagePickerPlugin) => plugin as unknown as Recorded;

function makePlugin(): CoverImagePickerPlugin {
	const app: MockApp = createMockApp();
	// Obsidian's globals, which the plugin uses for DOM work.
	const g = globalThis as unknown as Record<string, unknown>;
	g.activeDocument = document;
	g.activeWindow = window;
	g.createEl = (tag: string, o?: { cls?: string }) => {
		const el = document.createElement(tag);
		if (o?.cls) el.className = o.cls;
		return el;
	};
	g.createDiv = (o?: { cls?: string }) => (g.createEl as (t: string, o?: unknown) => HTMLElement)('div', o);

	const plugin = new CoverImagePickerPlugin(app as never, { id: 'cover-image-picker' } as never);
	// Obsidian calls onload() on an already-loaded Component, so addChild()
	// loads its children immediately. Without this the child onloads - where
	// all the DOM work lives - would silently never run in the test.
	(plugin as unknown as { _loaded: boolean })._loaded = true;
	return plugin;
}

beforeEach(() => {
	// Obsidian augments the DOM prototypes; the few we call need to exist.
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.addClass = function (this: HTMLElement, cls: string) {
		this.classList.add(cls);
	};
	proto.removeClass = function (this: HTMLElement, cls: string) {
		this.classList.remove(cls);
	};
	proto.removeClasses = function (this: HTMLElement, classes: string[]) {
		this.classList.remove(...classes);
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	proto.hasClass = function (this: HTMLElement, cls: string) {
		return this.classList.contains(cls);
	};
	proto.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
});

describe('plugin load', () => {
	it('loads without throwing', async () => {
		const plugin = makePlugin();
		await expect(plugin.onload()).resolves.not.toThrow();
	});

	it('registers both insertion commands', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		expect(recorded(plugin).commands.map((c) => c.id)).toEqual([
			'insert-cover-image',
			'insert-cover-image-camera',
		]);
	});

	it('starts from validated defaults when there is no data.json', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		expect(plugin.settings.propertyNames).toEqual(['cover', 'banner']);
		expect(plugin.settings.overrides).toEqual([]);
	});

	it('builds its settings definitions without throwing', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		const tab = recorded(plugin).settingTabs[0];
		expect(() => tab?.getSettingDefinitions()).not.toThrow();
		expect(tab?.getSettingDefinitions().length).toBeGreaterThan(0);
	});

	it('builds settings definitions when overrides exist', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		plugin.settings.overrides = [{ property: 'banner', resize: plugin.settings.resize }];
		const tab = recorded(plugin).settingTabs[0];
		expect(() => tab?.getSettingDefinitions()).not.toThrow();
	});

	it('loads its child components, which is where the DOM work happens', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		// The file picker owns a real input element in the document.
		expect(document.querySelector('input[type=file]')).not.toBeNull();
	});

	/**
	 * Regression: a vault copied or synced mid-write can leave data.json as
	 * invalid JSON. loadData() then throws, and letting that escape onload
	 * fails the entire plugin with "failed to load plugin" - over settings.
	 */
	it('still loads when data.json is unreadable', async () => {
		const plugin = makePlugin();
		plugin.loadData = () => Promise.reject(new SyntaxError('Unexpected end of JSON input'));

		await expect(plugin.onload()).resolves.not.toThrow();
		expect(plugin.settings.propertyNames).toEqual(['cover', 'banner']);
	});

	it('still loads when the workspace DOM is not what the adapter expects', async () => {
		const plugin = makePlugin();
		// The one part coupled to Obsidian's internals must degrade, not throw.
		const app = plugin.app as unknown as { workspace: Record<string, unknown> };
		app.workspace.containerEl = undefined;

		await expect(plugin.onload()).resolves.not.toThrow();
	});

	it('unloads cleanly', async () => {
		const plugin = makePlugin();
		await plugin.onload();
		expect(() => plugin.unload()).not.toThrow();
	});
});
