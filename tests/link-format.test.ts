import { describe, expect, it } from 'vitest';
import { buildLinkValue, needsYamlQuoting, toYamlScalar } from '../src/core/link-format';
import { pickFormat } from '../src/encode/port';
import { isTargetProperty, missingPropertyNames } from '../src/core/property-match';

const base = {
	linktext: 'covers/my cover',
	vaultPath: 'assets/covers/my cover.jpg',
};

describe('buildLinkValue', () => {
	it('builds a wikilink from the short link text', () => {
		expect(buildLinkValue({ ...base, format: 'wikilink' })).toBe('[[covers/my cover]]');
	});

	it('builds a markdown embed with an encoded target', () => {
		expect(buildLinkValue({ ...base, format: 'markdown' })).toBe('![](assets/covers/my%20cover.jpg)');
	});

	it('encodes parentheses, which would otherwise end the markdown link early', () => {
		expect(
			buildLinkValue({
				...base,
				format: 'markdown',
				vaultPath: 'a/b(1).jpg',
			}),
		).toBe('![](a/b%281%29.jpg)');
	});

	it('emits the raw path for the plain format', () => {
		expect(buildLinkValue({ ...base, format: 'path' })).toBe('assets/covers/my cover.jpg');
	});

	it('supports an alias', () => {
		expect(buildLinkValue({ ...base, format: 'wikilink', alias: 'Cover' })).toBe(
			'[[covers/my cover|Cover]]',
		);
	});
});

describe('needsYamlQuoting', () => {
	it('flags wikilinks, which would otherwise parse as a nested sequence', () => {
		expect(needsYamlQuoting('[[image.jpg]]')).toBe(true);
	});

	it('flags values that would change type or truncate', () => {
		expect(needsYamlQuoting('')).toBe(true);
		expect(needsYamlQuoting('true')).toBe(true);
		expect(needsYamlQuoting('no')).toBe(true);
		expect(needsYamlQuoting('123')).toBe(true);
		expect(needsYamlQuoting('a: b')).toBe(true);
		expect(needsYamlQuoting('a #comment')).toBe(true);
		expect(needsYamlQuoting('*anchor')).toBe(true);
		expect(needsYamlQuoting('line\nbreak')).toBe(true);
	});

	it('leaves ordinary paths alone', () => {
		expect(needsYamlQuoting('assets/cover.jpg')).toBe(false);
		expect(needsYamlQuoting('assets/my cover.jpg')).toBe(false);
	});
});

describe('toYamlScalar', () => {
	it('quotes and escapes when needed', () => {
		expect(toYamlScalar('[[a.jpg]]')).toBe('"[[a.jpg]]"');
		// A leading quote forces quoting, and the inner quotes then get escaped.
		expect(toYamlScalar('"hi" there')).toBe('"\\"hi\\" there"');
		expect(toYamlScalar('[[a "b".jpg]]')).toBe('"[[a \\"b\\".jpg]]"');
	});

	it('leaves an embedded quote alone - a plain scalar may contain one', () => {
		expect(toYamlScalar('say "hi"')).toBe('say "hi"');
	});

	it('leaves safe scalars unquoted', () => {
		expect(toYamlScalar('assets/cover.jpg')).toBe('assets/cover.jpg');
	});
});

describe('pickFormat', () => {
	const only =
		(...formats: string[]) =>
		(f: string) =>
			formats.includes(f);

	it('uses the requested format when it is available', () => {
		expect(pickFormat('webp', only('webp', 'jpeg', 'png'))).toBe('webp');
	});

	it('falls back from WebP to JPEG, which is the iOS case', () => {
		expect(pickFormat('webp', only('jpeg', 'png'))).toBe('jpeg');
	});

	it('falls back to PNG when nothing else is available', () => {
		expect(pickFormat('webp', only('png'))).toBe('png');
		expect(pickFormat('jpeg', only('png'))).toBe('png');
	});
});

describe('isTargetProperty', () => {
	const config = {
		propertyNames: ['cover', 'banner'],
		matchMode: 'exact' as const,
		caseSensitive: false,
	};

	it('matches configured names case-insensitively by default', () => {
		expect(isTargetProperty('cover', config)).toBe(true);
		expect(isTargetProperty('Cover', config)).toBe(true);
		expect(isTargetProperty('banner', config)).toBe(true);
	});

	it('rejects everything else - this is the scope guard', () => {
		expect(isTargetProperty('title', config)).toBe(false);
		expect(isTargetProperty('cover-wide', config)).toBe(false);
		expect(isTargetProperty('', config)).toBe(false);
	});

	it('honours case sensitivity when enabled', () => {
		expect(isTargetProperty('Cover', { ...config, caseSensitive: true })).toBe(false);
	});

	it('matches by prefix when configured', () => {
		expect(isTargetProperty('cover-wide', { ...config, matchMode: 'prefix' })).toBe(true);
		expect(isTargetProperty('title', { ...config, matchMode: 'prefix' })).toBe(false);
	});

	it('never matches when no names are configured', () => {
		expect(isTargetProperty('cover', { ...config, propertyNames: [] })).toBe(false);
	});
});

describe('missingPropertyNames', () => {
	const config = {
		propertyNames: ['cover', 'banner'],
		matchMode: 'exact' as const,
		caseSensitive: false,
	};

	it('reports configured names not present in the note', () => {
		expect(missingPropertyNames(['cover'], config)).toEqual(['banner']);
		expect(missingPropertyNames([], config)).toEqual(['cover', 'banner']);
		expect(missingPropertyNames(['Cover', 'BANNER'], config)).toEqual([]);
	});
});
