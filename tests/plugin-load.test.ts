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
import { installObsidianDom } from './stubs/dom';

/** The stub Plugin records these; the real `Plugin` type does not expose them. */
interface Recorded {
	commands: { id: string; name: string }[];
	settingTabs: { getSettingDefinitions: () => unknown[] }[];
}
const recorded = (plugin: CoverImagePickerPlugin) => plugin as unknown as Recorded;

function makePlugin(): CoverImagePickerPlugin {
	const app: MockApp = createMockApp();
	installObsidianDom();
	const plugin = new CoverImagePickerPlugin(app as never, { id: 'cover-image-picker' } as never);
	// Obsidian calls onload() on an already-loaded Component, so addChild()
	// loads its children immediately. Without this the child onloads - where
	// all the DOM work lives - would silently never run in the test.
	(plugin as unknown as { _loaded: boolean })._loaded = true;
	return plugin;
}

beforeEach(() => {
	installObsidianDom();
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
