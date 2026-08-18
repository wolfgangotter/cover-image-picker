import { Notice, PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { overridableNames } from '../core/overrides';
import type { CoverImagePickerSettings } from './schema';
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

	/**
	 * Dotted keys address nested settings to any depth, including array
	 * indices - the per-property overrides use keys like
	 * `overrides.0.resize.width`.
	 */
	override getControlValue(key: string): unknown {
		// Stored as an array, edited as a comma-separated list.
		if (key === 'propertyNames') return this.plugin.settings.propertyNames.join(', ');
		return readPath(this.plugin.settings, key.split('.'));
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'propertyNames') {
			this.plugin.settings.propertyNames = String(value)
				.split(',')
				.map((name) => name.trim());
		} else {
			writePath(this.plugin.settings, key.split('.'), value);
		}

		// Re-validate the whole object so a single edit can never leave the rest
		// out of range, then persist.
		this.plugin.settings = validateSettings(this.plugin.settings);
		await this.plugin.saveSettings();
		// The conditional controls below depend on what just changed.
		this.update();
	}

	/**
	 * Closing the settings tab re-syncs the property-row decorations.
	 *
	 * The adapter's MutationObserver watches `workspace.containerEl`, but the
	 * settings modal lives outside it, so toggling a setting produces no
	 * mutation it can see. Relying only on the write path left a stale button
	 * on screen after "Show a button on property rows" was turned off; this
	 * makes the resync independent of how the value got persisted.
	 */
	override hide(): void {
		super.hide();
		this.plugin.refreshPropertyRows();
	}

	/**
	 * Per-property resize overrides.
	 *
	 * Only resize is overridable: it is the one axis that genuinely differs
	 * per property (a banner is wide and short, a cover is 16:9), and keeping
	 * it to one axis keeps the list readable.
	 */
	private overridesList(): SettingDefinitionItem {
		const settings = this.plugin.settings;

		return {
			type: 'list',
			heading: 'Per-property sizes',
			emptyState: 'Every property uses the size above. Add one to give a property its own.',
			addItem: {
				name: 'Add a per-property size',
				action: () => void this.addOverride(),
			},
			onDelete: (index) => void this.removeOverride(index),
			// Each override is an inline sub-page, which is what a list accepts
			// and also keeps the summary readable at a glance.
			items: settings.overrides.map((override, index) => ({
				type: 'page' as const,
				name: override.property,
				displayValue: () => describeResize(this.plugin.settings.overrides[index]?.resize),
				items: [
					{
						name: 'Resize',
						control: {
							type: 'dropdown' as const,
							key: `overrides.${index}.resize.mode`,
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
						visible: () => {
							const mode = this.plugin.settings.overrides[index]?.resize.mode;
							return mode === 'box' || mode === 'width';
						},
						control: {
							type: 'number' as const,
							key: `overrides.${index}.resize.width`,
							defaultValue: 1600,
						},
					},
					{
						name: 'Height',
						visible: () => {
							const mode = this.plugin.settings.overrides[index]?.resize.mode;
							return mode === 'box' || mode === 'height';
						},
						control: {
							type: 'number' as const,
							key: `overrides.${index}.resize.height`,
							defaultValue: 900,
						},
					},
					{
						name: 'Fit',
						visible: () => this.plugin.settings.overrides[index]?.resize.mode === 'box',
						control: {
							type: 'dropdown' as const,
							key: `overrides.${index}.resize.fit`,
							options: { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' },
						},
					},
				],
			})),
		};
	}

	private async addOverride(): Promise<void> {
		const settings = this.plugin.settings;
		const available = overridableNames(
			settings.propertyNames,
			settings.overrides,
			settings.caseSensitive,
		);
		const next = available[0];
		if (next === undefined) {
			new Notice('Every configured property already has its own size.');
			return;
		}

		settings.overrides.push({
			property: next,
			// Seeded from the vault-wide setting so the row starts somewhere sane.
			resize: { ...settings.resize },
		});
		await this.plugin.saveSettings();
		this.update();
	}

	private async removeOverride(index: number): Promise<void> {
		this.plugin.settings.overrides.splice(index, 1);
		await this.plugin.saveSettings();
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
			this.overridesList(),
			{
				type: 'group',
				heading: 'Property rows',
				items: [
					{
						name: 'Show a button on property rows',
						desc: 'Adds an image button to matching properties in Live Preview.',
						control: { type: 'toggle', key: 'showPropertyButton' },
					},
					{
						name: 'Accept images dropped or pasted on property rows',
						desc: 'Drag or paste an image onto a matching property to set it. Dropping and pasting elsewhere in the note is unaffected.',
						control: { type: 'toggle', key: 'acceptDroppedImages' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Output',
				items: [
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

type Indexable = Record<string, unknown>;

function readPath(root: unknown, path: readonly string[]): unknown {
	let current: unknown = root;
	for (const segment of path) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Indexable)[segment];
	}
	return current;
}

/** Writes only into containers that already exist; never invents structure. */
function writePath(root: unknown, path: readonly string[], value: unknown): void {
	const last = path.at(-1);
	if (last === undefined) return;

	let current: unknown = root;
	for (const segment of path.slice(0, -1)) {
		if (current === null || typeof current !== 'object') return;
		current = (current as Indexable)[segment];
	}
	if (current === null || typeof current !== 'object') return;
	(current as Indexable)[last] = value;
}

/** One-line summary of an override, shown on its list entry. */
function describeResize(resize: CoverImagePickerSettings['resize'] | undefined): string {
	if (!resize) return '';
	switch (resize.mode) {
		case 'none':
			return 'Original size';
		case 'width':
			return `${resize.width ?? '?'} px wide`;
		case 'height':
			return `${resize.height ?? '?'} px tall`;
		case 'box':
			return `${resize.width ?? '?'}×${resize.height ?? '?'} ${resize.fit}`;
	}
}
