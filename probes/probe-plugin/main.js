/*
 * Cover Image Picker — Phase 0 probe plugin.
 *
 * Throwaway diagnostic plugin. Hand-written CommonJS: NO build step.
 * Copy this folder to <Vault>/.obsidian/plugins/cip-probe/ and enable it.
 *
 * Answers the three Phase 0 questions from docs/implementation-plan.md:
 *   Q2  — does iOS WKWebView apply EXIF orientation when decoding to canvas?
 *   D2  — does processFrontMatter emit a YAML-safe wikilink?
 *   F9  — does Obsidian's iOS webview require a synchronous user gesture
 *         for the file picker?
 *
 * Results are shown in a modal (there is no console on iOS without a Mac)
 * and also logged to console on desktop.
 */

const { Plugin, Modal, Notice, TFile, getFrontMatterInfo } = require('obsidian');

/*
 * 64x32 JPEG: left half red, right half blue, EXIF Orientation = 6.
 *
 * Orientation 6 means "rotate 90 degrees clockwise to display correctly".
 * Rotating 90 CW maps the LEFT edge to the TOP edge, so a decoder that
 * honours the tag must report 32x64 with red on top. A decoder that ignores
 * it reports 64x32 with red on the left. The dimensions alone are an
 * unambiguous discriminator.
 */
const EXIF_ORIENT_6_JPEG_B64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/' +
	'2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoK' +
	'BggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK' +
	'CgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAgAEADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEA' +
	'AAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJx' +
	'FDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNk' +
	'ZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJ' +
	'ytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF' +
	'BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMz' +
	'UvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3' +
	'eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna' +
	'4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4vr+Uz/fwKACgAoA+Q6/6qD/mvCgAoAKA' +
	'Pryv+Vc/6UAoAKACgD5Dr/qoP+a8KACgAoA+vK/5Vz/pQCgAoAKAPkOv+qg/5rwoAKACgD68r/lX' +
	'P+lAKACgAoA+Q6/6qD/mvCgAoAKAP//Z';

const PROBE_KEYS = [
	'cipProbePlain',
	'cipProbeWiki',
	'cipProbeWikiSpace',
	'cipProbeWikiHash',
	'cipProbeMarkdown',
	'cipProbeUnicode',
];

/* ------------------------------------------------------------------ utils */

function b64ToBlob(b64, type) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type });
}

function describePixels(ctx, w, h) {
	const top = ctx.getImageData(Math.floor(w / 2), Math.floor(h * 0.25), 1, 1).data;
	const bottom = ctx.getImageData(Math.floor(w / 2), Math.floor(h * 0.75), 1, 1).data;
	const name = (p) => (p[0] > 150 && p[2] < 100 ? 'RED' : p[2] > 150 && p[0] < 100 ? 'BLUE' : `rgb(${p[0]},${p[1]},${p[2]})`);
	return `top=${name(top)} bottom=${name(bottom)}`;
}

function verdict(w, h) {
	if (w === 32 && h === 64) return 'ORIENTATION APPLIED';
	if (w === 64 && h === 32) return 'orientation IGNORED';
	return `unexpected ${w}x${h}`;
}

/* ------------------------------------------------------------- Q2 : EXIF */

async function probeExif() {
	const lines = [];
	const blob = b64ToBlob(EXIF_ORIENT_6_JPEG_B64, 'image/jpeg');
	lines.push('Fixture: 64x32 JPEG, left RED / right BLUE, EXIF Orientation=6.');
	lines.push('Correct handling => 32x64 with RED on top.');
	lines.push('');

	// Path A: HTMLImageElement + drawImage (what most plugins do)
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.naturalWidth;
		c.height = img.naturalHeight;
		const ctx = c.getContext('2d');
		ctx.drawImage(img, 0, 0);
		lines.push(`A. <img> + drawImage`);
		lines.push(`   naturalWidth x naturalHeight = ${img.naturalWidth}x${img.naturalHeight}`);
		lines.push(`   ${describePixels(ctx, c.width, c.height)}`);
		lines.push(`   => ${verdict(img.naturalWidth, img.naturalHeight)}`);
	} catch (e) {
		lines.push(`A. <img> + drawImage — FAILED: ${e && e.message}`);
	} finally {
		URL.revokeObjectURL(url);
	}
	lines.push('');

	// Path B: createImageBitmap with explicit imageOrientation
	try {
		const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		const c = document.createElement('canvas');
		c.width = bmp.width;
		c.height = bmp.height;
		const ctx = c.getContext('2d');
		ctx.drawImage(bmp, 0, 0);
		lines.push(`B. createImageBitmap({imageOrientation:'from-image'})`);
		lines.push(`   ${bmp.width}x${bmp.height}`);
		lines.push(`   ${describePixels(ctx, c.width, c.height)}`);
		lines.push(`   => ${verdict(bmp.width, bmp.height)}`);
		bmp.close();
	} catch (e) {
		lines.push(`B. createImageBitmap({from-image}) — FAILED: ${e && e.message}`);
		lines.push('   (option unsupported here => must use path A or rotate manually)');
	}
	lines.push('');

	// Path C: createImageBitmap with no options (spec default changed over time)
	try {
		const bmp = await createImageBitmap(blob);
		lines.push(`C. createImageBitmap(blob) default`);
		lines.push(`   ${bmp.width}x${bmp.height} => ${verdict(bmp.width, bmp.height)}`);
		bmp.close();
	} catch (e) {
		lines.push(`C. createImageBitmap(blob) — FAILED: ${e && e.message}`);
	}
	lines.push('');

	// Capability probe we will ship in encode/native-canvas.ts (D1)
	const c = document.createElement('canvas');
	c.width = c.height = 8;
	const webp = c.toDataURL('image/webp').startsWith('data:image/webp');
	lines.push(`Bonus — canvas WebP encode supported: ${webp ? 'YES' : 'NO (expect NO on iOS)'}`);

	return lines.join('\n');
}

/* --------------------------------------------------------- D2 : YAML I/O */

function waitForCacheUpdate(app, file, timeoutMs) {
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			app.metadataCache.offref(ref);
			resolve();
		};
		const ref = app.metadataCache.on('changed', (f) => {
			if (f.path === file.path) finish();
		});
		window.setTimeout(finish, timeoutMs);
	});
}

async function probeYaml(app) {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') {
		return 'Open a scratch markdown note first, then run this again.';
	}

	const values = {
		cipProbePlain: 'assets/cover.jpg',
		cipProbeWiki: '[[assets/cover.jpg]]',
		cipProbeWikiSpace: '[[assets/my cover.jpg]]',
		cipProbeWikiHash: '[[assets/cover #1.jpg]]',
		cipProbeMarkdown: '![](assets/my%20cover.jpg)',
		cipProbeUnicode: '[[assets/Übergröße_cover.jpg]]',
	};

	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const k of Object.keys(values)) fm[k] = values[k];
	});

	await waitForCacheUpdate(app, file, 2000);

	const raw = await app.vault.read(file);
	const info = getFrontMatterInfo(raw);
	const cache = app.metadataCache.getFileCache(file) || {};
	const fm = cache.frontmatter || {};
	const fmLinks = cache.frontmatterLinks || [];

	const lines = [];
	lines.push(`Note: ${file.path}`);
	lines.push('');
	lines.push('--- RAW YAML AS WRITTEN TO DISK ---');
	lines.push(info.exists ? info.frontmatter.trimEnd() : '(no frontmatter block!)');
	lines.push('');
	lines.push('--- READ BACK FROM METADATA CACHE ---');
	for (const k of Object.keys(values)) {
		const v = fm[k];
		const t = Array.isArray(v) ? 'array' : typeof v;
		lines.push(`${k}:`);
		lines.push(`   wrote  ${JSON.stringify(values[k])}`);
		lines.push(`   read   ${JSON.stringify(v)}  (${t})`);
		lines.push(`   ${JSON.stringify(v) === JSON.stringify(values[k]) ? 'OK round-trip' : '*** MISMATCH ***'}`);
	}
	lines.push('');
	lines.push('--- frontmatterLinks (drives rename-tracking) ---');
	lines.push(fmLinks.length ? fmLinks.map((l) => `${l.key} -> ${l.link}`).join('\n') : '(none — Obsidian did not treat any value as a link)');
	lines.push('');
	lines.push('Run "CIP probe: clean up YAML probe keys" when done.');
	return lines.join('\n');
}

async function cleanupYaml(app) {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') return 'No markdown note active.';
	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const k of PROBE_KEYS) delete fm[k];
	});
	return `Removed probe keys from ${file.path}.`;
}

/* ------------------------------------------------- F9 : gesture / picker */

function makeInput() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/jpeg,image/png,image/webp,image/gif';
	input.style.position = 'fixed';
	input.style.left = '-9999px';
	document.body.appendChild(input);
	input.addEventListener('change', () => {
		const f = input.files && input.files[0];
		new Notice(f ? `Picked: ${f.name} (${f.type || 'no type'}, ${f.size} bytes)` : 'No file');
		input.remove();
	});
	return input;
}

/* --------------------------------------------------------------- plugin */

class ResultModal extends Modal {
	constructor(app, title, text) {
		super(app);
		this.title = title;
		this.text = text;
	}
	onOpen() {
		this.titleEl.setText(this.title);
		const pre = this.contentEl.createEl('pre');
		pre.setText(this.text);
		pre.style.whiteSpace = 'pre-wrap';
		pre.style.userSelect = 'text';
		pre.style.fontSize = '12px';
		console.log(`[cip-probe] ${this.title}\n${this.text}`);
	}
	onClose() {
		this.contentEl.empty();
	}
}

module.exports = class ProbePlugin extends Plugin {
	onload() {
		const show = (title, fn) => async () => {
			try {
				new ResultModal(this.app, title, await fn()).open();
			} catch (e) {
				new ResultModal(this.app, `${title} — ERROR`, String((e && e.stack) || e)).open();
			}
		};

		this.addCommand({
			id: 'exif',
			name: 'CIP probe: EXIF orientation (Q2)',
			callback: show('EXIF orientation probe', () => probeExif()),
		});

		this.addCommand({
			id: 'yaml',
			name: 'CIP probe: YAML frontmatter round-trip (D2)',
			callback: show('YAML round-trip probe', () => probeYaml(this.app)),
		});

		this.addCommand({
			id: 'yaml-cleanup',
			name: 'CIP probe: clean up YAML probe keys',
			callback: show('Cleanup', () => cleanupYaml(this.app)),
		});

		// F9: the picker opens synchronously inside the gesture call stack.
		this.addCommand({
			id: 'picker-sync',
			name: 'CIP probe: file picker SYNC (should open)',
			callback: () => {
				makeInput().click();
			},
		});

		// F9: one await before click() — on WebKit the gesture is gone and
		// this is expected to do nothing at all. That silence is the finding.
		this.addCommand({
			id: 'picker-async',
			name: 'CIP probe: file picker ASYNC (expected to fail on iOS)',
			callback: async () => {
				const input = makeInput();
				await Promise.resolve();
				await new Promise((r) => window.setTimeout(r, 0));
				input.click();
				new Notice('Called click() after await — did the picker open?');
			},
		});
	}
};
