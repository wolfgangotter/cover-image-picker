/**
 * Obsidian augments the DOM prototypes and installs a few globals. jsdom has
 * neither, so the tests that drive real plugin code have to supply them.
 */

type Anything = Record<string, unknown>;

export function installObsidianDom(): void {
	const el = HTMLElement.prototype as unknown as Anything;
	el.addClass = function (this: HTMLElement, cls: string) {
		this.classList.add(cls);
	};
	el.removeClass = function (this: HTMLElement, cls: string) {
		this.classList.remove(cls);
	};
	el.removeClasses = function (this: HTMLElement, classes: string[]) {
		this.classList.remove(...classes);
	};
	el.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	el.hasClass = function (this: HTMLElement, cls: string) {
		return this.classList.contains(cls);
	};
	el.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};

	// Obsidian's cross-window-safe instanceof. This is the implementation of
	// that helper, so it necessarily uses the real operator.
	(Node.prototype as unknown as Anything).instanceOf = function (this: Node, type: unknown) {
		return this instanceof (type as new () => unknown);
	};

	const g = globalThis as unknown as Anything;
	g.activeDocument = document;
	g.activeWindow = window;
	g.createEl = (tag: string, o?: { cls?: string; text?: string }) => {
		const node = document.createElement(tag);
		if (o?.cls) node.className = o.cls;
		if (o?.text) node.textContent = o.text;
		return node;
	};
	g.createDiv = (o?: { cls?: string; text?: string }) =>
		(g.createEl as (t: string, o?: unknown) => HTMLElement)('div', o);
}

/** A `.metadata-property` row shaped the way Obsidian renders one. */
export function makePropertyRow(key: string): HTMLElement {
	const row = document.createElement('div');
	row.className = 'metadata-property';
	row.setAttribute('data-property-key', key);

	const keyCell = document.createElement('div');
	keyCell.className = 'metadata-property-key';
	const valueCell = document.createElement('div');
	valueCell.className = 'metadata-property-value';
	valueCell.appendChild(document.createElement('input'));

	row.append(keyCell, valueCell);
	return row;
}
