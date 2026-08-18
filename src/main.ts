import { Plugin } from 'obsidian';
import { InsertionPipeline } from './core/pipeline';
import { NativeCanvasEncoder } from './encode/native-canvas';
import { PropertyFocusTracker } from './obsidian/focus-tracker';
import { ObsidianFrontmatter } from './obsidian/frontmatter-port';
import { PropertyDomAdapter } from './obsidian/property-dom';
import { VaultStorage } from './obsidian/vault-port';
import { DEFAULT_SETTINGS, type CoverImagePickerSettings } from './settings/schema';
import { CoverImagePickerSettingTab } from './settings/tab';
import { validateSettings } from './settings/validate';
import { registerCommands } from './triggers/command';
import { FilePicker } from './ui/file-picker';

export default class CoverImagePickerPlugin extends Plugin {
	settings: CoverImagePickerSettings = DEFAULT_SETTINGS;
	filePicker!: FilePicker;
	pipeline!: InsertionPipeline;
	frontmatter!: ObsidianFrontmatter;
	focusTracker!: PropertyFocusTracker;
	private propertyDom!: PropertyDomAdapter;

	async onload(): Promise<void> {
		await this.loadSettings();

		const current = () => this.settings;
		this.filePicker = this.addChild(new FilePicker());
		this.frontmatter = new ObsidianFrontmatter(this.app, current);
		this.pipeline = new InsertionPipeline(
			current,
			new NativeCanvasEncoder(),
			new VaultStorage(this.app, current),
			this.frontmatter,
		);

		// Both of these read Obsidian's internal property DOM and both degrade
		// to no-ops if it changes. The command path touches neither.
		this.focusTracker = this.addChild(new PropertyFocusTracker(this));
		this.propertyDom = this.addChild(new PropertyDomAdapter(this));

		registerCommands(this);
		this.addSettingTab(new CoverImagePickerSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = validateSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshPropertyButtons();
	}

	/**
	 * Re-sync the property-row buttons with the current settings.
	 *
	 * Called both after a write and when the settings tab closes, because the
	 * settings modal is outside the DOM subtree the adapter observes and a
	 * toggle there produces no mutation it would otherwise notice.
	 */
	refreshPropertyButtons(): void {
		this.propertyDom.refresh();
		this.focusTracker.forget();
	}
}
