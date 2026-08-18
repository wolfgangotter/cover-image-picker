import { Plugin } from 'obsidian';
import { InsertionPipeline } from './core/pipeline';
import { NativeCanvasEncoder } from './encode/native-canvas';
import { ObsidianFrontmatter } from './obsidian/frontmatter-port';
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

	async onload(): Promise<void> {
		await this.loadSettings();

		this.filePicker = this.addChild(new FilePicker());

		const current = () => this.settings;
		this.pipeline = new InsertionPipeline(
			current,
			new NativeCanvasEncoder(),
			new VaultStorage(this.app, current),
			new ObsidianFrontmatter(this.app, current),
		);

		registerCommands(this);
		this.addSettingTab(new CoverImagePickerSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = validateSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
