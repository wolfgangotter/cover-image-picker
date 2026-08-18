/*
 * Uses the imperative `display()` form rather than the declarative
 * getSettingDefinitions API, which would raise minAppVersion to 1.13. Revisit
 * once that floor is acceptable; it would also add settings-search support.
 */
import { PluginSettingTab, Setting, type App } from 'obsidian';
import { FolderSuggest } from './folder-suggest';
import { normalizeFolder, normalizePropertyNames } from './validate';
import type CoverImagePickerPlugin from '../main';

export class CoverImagePickerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: CoverImagePickerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl).setName('Properties').setHeading();

		new Setting(containerEl)
			.setName('Property names')
			.setDesc(
				'Comma-separated, for example: cover, banner. Nothing outside these properties is ever touched.',
			)
			.addText((text) =>
				text.setValue(s.propertyNames.join(', ')).onChange(async (value) => {
					s.propertyNames = normalizePropertyNames(
						value.split(',').map((v) => v.trim()),
						['cover'],
					);
					await save();
				}),
			);

		new Setting(containerEl)
			.setName('Match mode')
			.setDesc('Prefix also matches names such as "cover-wide".')
			.addDropdown((drop) =>
				drop
					.addOptions({ exact: 'Exact', prefix: 'Prefix' })
					.setValue(s.matchMode)
					.onChange(async (value) => {
						s.matchMode = value === 'prefix' ? 'prefix' : 'exact';
						await save();
					}),
			);

		new Setting(containerEl).setName('Storage').setHeading();

		new Setting(containerEl).setName('Location').addDropdown((drop) =>
			drop
				.addOptions({
					'fixed-folder': 'Specific folder',
					'note-folder': 'Same folder as the note',
					'vault-root': 'Vault root',
					'obsidian-attachments': "Obsidian's attachment folder",
				})
				.setValue(s.storage.mode)
				.onChange(async (value) => {
					s.storage.mode = value as typeof s.storage.mode;
					await save();
					this.display();
				}),
		);

		if (s.storage.mode === 'fixed-folder') {
			new Setting(containerEl)
				.setName('Folder')
				.setDesc('Vault-relative, for example: assets/covers.')
				.addSearch((search) => {
					new FolderSuggest(this.app, search.inputEl);
					search.setValue(s.storage.fixedFolder).onChange(async (value) => {
						s.storage.fixedFolder = normalizeFolder(value, 'assets/covers');
						await save();
					});
				});
		}

		new Setting(containerEl)
			.setName('Filename')
			.setDesc(
				'Tokens: {{noteName}}, {{property}}, {{originalName}}, {{date}}, {{time}}, {{timestamp}}',
			)
			.addText((text) =>
				text
					.setPlaceholder('{{noteName}}_{{property}}')
					.setValue(s.naming.template)
					.onChange(async (value) => {
						s.naming.template = value || '{{noteName}}_{{property}}';
						await save();
					}),
			);

		new Setting(containerEl).setName('Image processing').setHeading();

		new Setting(containerEl).setName('Resize').addDropdown((drop) =>
			drop
				.addOptions({
					box: 'Fit a width and height',
					width: 'Width only',
					height: 'Height only',
					none: 'Do not resize',
				})
				.setValue(s.resize.mode)
				.onChange(async (value) => {
					s.resize.mode = value as typeof s.resize.mode;
					await save();
					this.display();
				}),
		);

		if (s.resize.mode === 'box' || s.resize.mode === 'width') {
			new Setting(containerEl).setName('Width (px)').addText((text) =>
				text.setValue(String(s.resize.width ?? 1600)).onChange(async (value) => {
					const n = Number(value);
					if (Number.isFinite(n) && n > 0) {
						s.resize.width = Math.min(20000, Math.round(n));
						await save();
					}
				}),
			);
		}

		if (s.resize.mode === 'box' || s.resize.mode === 'height') {
			new Setting(containerEl).setName('Height (px)').addText((text) =>
				text.setValue(String(s.resize.height ?? 900)).onChange(async (value) => {
					const n = Number(value);
					if (Number.isFinite(n) && n > 0) {
						s.resize.height = Math.min(20000, Math.round(n));
						await save();
					}
				}),
			);
		}

		if (s.resize.mode === 'box') {
			new Setting(containerEl)
				.setName('Fit')
				.setDesc(
					'Cover fills the box and crops. Contain fits inside it. Stretch ignores aspect ratio.',
				)
				.addDropdown((drop) =>
					drop
						.addOptions({
							cover: 'Cover',
							contain: 'Contain',
							stretch: 'Stretch',
						})
						.setValue(s.resize.fit)
						.onChange(async (value) => {
							s.resize.fit = value as typeof s.resize.fit;
							await save();
						}),
				);
		}

		new Setting(containerEl).setName('Format').addDropdown((drop) =>
			drop
				.addOptions({
					webp: 'WebP (falls back to JPEG on iOS)',
					jpeg: 'JPEG',
					png: 'PNG',
				})
				.setValue(s.encode.format)
				.onChange(async (value) => {
					s.encode.format = value as typeof s.encode.format;
					await save();
				}),
		);

		new Setting(containerEl)
			.setName('Quality')
			.setDesc('Ignored for PNG.')
			.addSlider((slider) =>
				slider
					.setLimits(1, 100, 1)
					.setValue(s.encode.quality)
					.onChange(async (value) => {
						s.encode.quality = value;
						await save();
					}),
			);

		new Setting(containerEl).setName('Output').setHeading();

		new Setting(containerEl)
			.setName('Link format')
			.setDesc('Wikilinks let Obsidian track renames. The other formats do not.')
			.addDropdown((drop) =>
				drop
					.addOptions({
						wikilink: 'Wikilink — [[image.jpg]]',
						markdown: 'Markdown — ![](image.jpg)',
						path: 'Plain path',
					})
					.setValue(s.link.format)
					.onChange(async (value) => {
						s.link.format = value as typeof s.link.format;
						await save();
					}),
			);
	}
}
