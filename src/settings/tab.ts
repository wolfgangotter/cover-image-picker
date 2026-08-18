import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { validateSettings } from './validate';
import type CoverImagePickerPlugin from '../main';

/**
 * Declarative settings (Obsidian 1.13+). Obsidian renders the controls and
 * indexes them for settings search; we only describe the shape and bridge
 * get/set into our nested settings object.
 */
export class CoverImagePickerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: CoverImagePickerPlugin,
	) {
		super(app, plugin);
	}

	/** Keys are dotted to address our nested settings; one level is enough. */
	override getControlValue(key: string): unknown {
		const settings = this.plugin.settings;
		// Stored as an array, edited as a comma-separated list.
		if (key === 'propertyNames') return settings.propertyNames.join(', ');

		const [group, leaf] = key.split('.');
		const record = settings as unknown as Record<string, unknown>;
		if (leaf === undefined) return record[key];

		const section = record[group ?? ''] as Record<string, unknown> | undefined;
		return section?.[leaf];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const record = this.plugin.settings as unknown as Record<string, unknown>;

		if (key === 'propertyNames') {
			record.propertyNames = String(value)
				.split(',')
				.map((name) => name.trim());
		} else {
			const [group, leaf] = key.split('.');
			if (leaf === undefined) {
				record[key] = value;
			} else {
				const section = record[group ?? ''] as Record<string, unknown> | undefined;
				if (section) section[leaf] = value;
			}
		}

		// Re-validate the whole object so a single edit can never leave the rest
		// out of range, then persist.
		this.plugin.settings = validateSettings(this.plugin.settings);
		await this.plugin.saveSettings();
		// The conditional controls below depend on what just changed.
		this.update();
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const s = () => this.plugin.settings;

		return [
			{
				type: 'group',
				heading: 'Properties',
				items: [
					{
						name: 'Property names',
						desc: 'Comma-separated, for example: cover, banner. Nothing outside these properties is ever touched.',
						control: {
							type: 'text',
							key: 'propertyNames',
							validate: (value) =>
								value.trim() ? undefined : 'Enter at least one property name.',
						},
					},
					{
						name: 'Match mode',
						desc: 'Prefix also matches names such as "cover-wide".',
						control: {
							type: 'dropdown',
							key: 'matchMode',
							options: { exact: 'Exact', prefix: 'Prefix' },
						},
					},
					{
						name: 'Case sensitive',
						control: { type: 'toggle', key: 'caseSensitive' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Storage',
				items: [
					{
						name: 'Location',
						control: {
							type: 'dropdown',
							key: 'storage.mode',
							options: {
								'fixed-folder': 'Specific folder',
								'note-folder': 'Same folder as the note',
								'vault-root': 'Vault root',
								'obsidian-attachments': "Obsidian's attachment folder",
							},
						},
					},
					{
						name: 'Folder',
						desc: 'Vault-relative, for example: assets/covers.',
						visible: () => s().storage.mode === 'fixed-folder',
						control: { type: 'folder', key: 'storage.fixedFolder' },
					},
					{
						name: 'Create the folder if it is missing',
						visible: () => s().storage.mode === 'fixed-folder',
						control: { type: 'toggle', key: 'storage.createFolderIfMissing' },
					},
					{
						name: 'Filename',
						desc: 'Tokens: {{noteName}}, {{property}}, {{originalName}}, {{date}}, {{time}}, {{timestamp}}',
						control: {
							type: 'text',
							key: 'naming.template',
							validate: (value) => (value.trim() ? undefined : 'Enter a filename template.'),
						},
					},
					{
						name: 'If the filename is taken',
						control: {
							type: 'dropdown',
							key: 'naming.onCollision',
							options: { suffix: 'Add a number', overwrite: 'Overwrite' },
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Image processing',
				items: [
					{
						name: 'Resize',
						control: {
							type: 'dropdown',
							key: 'resize.mode',
							options: {
								box: 'Fit a width and height',
								width: 'Width only',
								height: 'Height only',
								none: 'Do not resize',
							},
						},
					},
					{
						name: 'Width',
						visible: () => s().resize.mode === 'box' || s().resize.mode === 'width',
						control: { type: 'number', key: 'resize.width', defaultValue: 1600 },
					},
					{
						name: 'Height',
						visible: () => s().resize.mode === 'box' || s().resize.mode === 'height',
						control: { type: 'number', key: 'resize.height', defaultValue: 900 },
					},
					{
						name: 'Fit',
						desc: 'Cover fills the box and crops. Contain fits inside it. Stretch ignores aspect ratio.',
						visible: () => s().resize.mode === 'box',
						control: {
							type: 'dropdown',
							key: 'resize.fit',
							options: { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' },
						},
					},
					{
						name: 'Allow upscaling',
						desc: 'Off by default: enlarging a small photo adds no detail.',
						visible: () => s().resize.mode !== 'none',
						control: { type: 'toggle', key: 'resize.allowUpscale' },
					},
					{
						name: 'Format',
						desc: 'WebP cannot be encoded on iOS, where JPEG is used instead.',
						control: {
							type: 'dropdown',
							key: 'encode.format',
							options: {
								webp: 'WebP (falls back to JPEG on iOS)',
								jpeg: 'JPEG',
								png: 'PNG',
							},
						},
					},
					{
						name: 'Quality',
						desc: 'Ignored for PNG.',
						visible: () => s().encode.format !== 'png',
						control: {
							type: 'slider',
							key: 'encode.quality',
							min: 1,
							max: 100,
							step: 1,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Output',
				items: [
					{
						name: 'Show a button on property rows',
						desc: 'Adds an image button to matching properties in Live Preview. Turn off to use only the command.',
						control: { type: 'toggle', key: 'showPropertyButton' },
					},
					{
						name: 'Link format',
						desc: 'Wikilinks let Obsidian track renames. The other formats do not.',
						control: {
							type: 'dropdown',
							key: 'link.format',
							options: {
								wikilink: 'Wikilink — [[image.jpg]]',
								markdown: 'Markdown — ![](image.jpg)',
								path: 'Plain path',
							},
						},
					},
					{
						name: 'Delete the previous image when replacing',
						desc: 'Moves the old file to trash. Off by default, because it removes a file you may still be using elsewhere.',
						control: { type: 'toggle', key: 'deleteReplacedFile' },
					},
				],
			},
		];
	}
}
