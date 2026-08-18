/**
 * Minimal stand-in for the `obsidian` module.
 *
 * Only covers what the plugin touches while loading, which is exactly what the
 * load smoke test needs: "failed to load plugin" is the worst failure mode we
 * can ship, and it is invisible to every other test we have.
 */

export class Events {
	on(): EventRef {
		return {};
	}
	off(): void {}
	offref(): void {}
	trigger(): void {}
}

export interface EventRef {
	__eventRef?: true;
}

export class Component {
	private children: Component[] = [];
	_loaded = false;

	load(): void {
		this._loaded = true;
		this.onload();
		for (const child of this.children) child.load();
	}
	onload(): void {}
	unload(): void {
		this._loaded = false;
		for (const child of this.children) child.unload();
		this.onunload();
	}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		if (this._loaded) child.load();
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		return child;
	}
	register(): void {}
	registerEvent(): void {}
	registerDomEvent(el: EventTarget, type: string, cb: EventListener): void {
		el.addEventListener(type, cb);
	}
	registerInterval(id: number): number {
		return id;
	}
}

export class TAbstractFile {
	path = '';
	name = '';
}
export class TFile extends TAbstractFile {
	basename = '';
	extension = 'md';
	stat = { ctime: 0, mtime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot(): boolean {
		return this.path === '';
	}
}

export class Notice {
	constructor(public message: string | DocumentFragment) {}
	setMessage(): this {
		return this;
	}
	hide(): void {}
}

export class Modal {
	contentEl = document.createElement('div');
	titleEl = document.createElement('div');
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export abstract class SuggestModal<T> extends Modal {
	inputEl = document.createElement('input');
	setPlaceholder(): void {}
	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export class Menu {
	addItem(cb: (item: MenuItem) => unknown): this {
		cb(new MenuItem());
		return this;
	}
	showAtMouseEvent(): this {
		return this;
	}
	showAtPosition(): this {
		return this;
	}
}
export class MenuItem {
	setTitle(): this {
		return this;
	}
	setIcon(): this {
		return this;
	}
	onClick(): this {
		return this;
	}
}

export class SettingTab {
	containerEl = document.createElement('div');
	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}
	display(): void {}
	hide(): void {}
	update(): void {}
	getSettingDefinitions(): unknown[] {
		return [];
	}
	getControlValue(_key: string): unknown {
		return undefined;
	}
	setControlValue(_key: string, _value: unknown): void | Promise<void> {}
}
export class PluginSettingTab extends SettingTab {}

export class Plugin extends Component {
	commands: { id: string; name: string }[] = [];
	settingTabs: unknown[] = [];
	private stored: unknown = undefined;

	constructor(
		public app: MockApp,
		public manifest: unknown,
	) {
		super();
	}
	addCommand<T extends { id: string; name: string }>(command: T): T {
		this.commands.push(command);
		return command;
	}
	addSettingTab(tab: unknown): void {
		this.settingTabs.push(tab);
	}
	addRibbonIcon(): HTMLElement {
		return document.createElement('div');
	}
	addStatusBarItem(): HTMLElement {
		return document.createElement('div');
	}
	async loadData(): Promise<unknown> {
		return this.stored;
	}
	async saveData(data: unknown): Promise<void> {
		this.stored = data;
	}
	registerEditorExtension(): void {}
	registerMarkdownPostProcessor(): void {}
}

export class MarkdownView {
	file: TFile | null = null;
	contentEl = document.createElement('div');
	editor = null;
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
	isIosApp: false,
	isAndroidApp: false,
	isPhone: false,
	isTablet: false,
	isMacOS: false,
	isWin: false,
	isLinux: true,
	isSafari: false,
};

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/|\/$/g, '');
}

export function setIcon(el: HTMLElement, icon: string): void {
	el.setAttribute('data-icon', icon);
}

export function setTooltip(el: HTMLElement, text: string): void {
	el.setAttribute('aria-label', text);
}

export function debounce<T extends unknown[]>(cb: (...args: T) => unknown): (...args: T) => void {
	return (...args: T) => cb(...args);
}

export function getFrontMatterInfo(): unknown {
	return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 };
}

/* ------------------------------------------------------------------ app */

export interface MockApp {
	workspace: {
		containerEl: HTMLElement;
		on: () => EventRef;
		off: () => void;
		offref: () => void;
		onLayoutReady: (cb: () => void) => void;
		getActiveFile: () => TFile | null;
		getActiveViewOfType: () => null;
		getLeavesOfType: () => { view: unknown }[];
		getLeaf: () => { openFile: () => Promise<void> };
	};
	vault: {
		on: () => EventRef;
		getFileByPath: () => TFile | null;
		getFolderByPath: () => TFolder | null;
		getAbstractFileByPath: () => TAbstractFile | null;
		getAllLoadedFiles: () => TAbstractFile[];
		createFolder: () => Promise<TFolder>;
		createBinary: () => Promise<TFile>;
		modifyBinary: () => Promise<void>;
		read: () => Promise<string>;
	};
	metadataCache: {
		on: () => EventRef;
		offref: () => void;
		getFileCache: () => null;
		fileToLinktext: (file: TFile) => string;
		getFirstLinkpathDest: () => TFile | null;
	};
	fileManager: {
		processFrontMatter: () => Promise<void>;
		getAvailablePathForAttachment: (name: string) => Promise<string>;
		getNewFileParent: () => TFolder;
		generateMarkdownLink: () => string;
		trashFile: () => Promise<void>;
	};
}

export function createMockApp(): MockApp {
	const noopRef = (): EventRef => ({});
	return {
		workspace: {
			containerEl: document.createElement('div'),
			on: noopRef,
			off: () => {},
			offref: () => {},
			onLayoutReady: (cb) => cb(),
			getActiveFile: () => null,
			getActiveViewOfType: () => null,
			getLeavesOfType: () => [],
			getLeaf: () => ({ openFile: async () => {} }),
		},
		vault: {
			on: noopRef,
			getFileByPath: () => null,
			getFolderByPath: () => null,
			getAbstractFileByPath: () => null,
			getAllLoadedFiles: () => [],
			createFolder: async () => new TFolder(),
			createBinary: async () => new TFile(),
			modifyBinary: async () => {},
			read: async () => '',
		},
		metadataCache: {
			on: noopRef,
			offref: () => {},
			getFileCache: () => null,
			fileToLinktext: (file) => file.path,
			getFirstLinkpathDest: () => null,
		},
		fileManager: {
			processFrontMatter: async () => {},
			getAvailablePathForAttachment: async (name) => name,
			getNewFileParent: () => new TFolder(),
			generateMarkdownLink: () => '',
			trashFile: async () => {},
		},
	};
}
