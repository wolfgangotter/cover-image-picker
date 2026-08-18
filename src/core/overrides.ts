/**
 * Per-property resize overrides.
 *
 * The motivating case: `banner` wants something wide and short, `cover` wants
 * 16:9, and everything else should inherit. Only resize is overridable —
 * storage, naming and format are vault-wide decisions in practice, and one
 * override axis keeps the settings comprehensible.
 */

import type { ResizeSpec } from './types';

export interface PropertyOverride {
	/** The property this applies to; matched the same way as `propertyNames`. */
	property: string;
	resize: ResizeSpec;
}

/**
 * The resize spec for a property: its override if one exists, otherwise the
 * vault-wide default. Case sensitivity follows the same setting as property
 * matching, so an override cannot become unreachable by casing alone.
 */
export function resolveResizeSpec(
	propertyKey: string,
	overrides: readonly PropertyOverride[],
	fallback: ResizeSpec,
	caseSensitive: boolean,
): ResizeSpec {
	const needle = caseSensitive ? propertyKey : propertyKey.toLowerCase();
	const match = overrides.find((entry) => {
		const name = caseSensitive ? entry.property : entry.property.toLowerCase();
		return name === needle;
	});
	return match?.resize ?? fallback;
}

/** Configured names with no override yet, for the "add an override" affordance. */
export function overridableNames(
	propertyNames: readonly string[],
	overrides: readonly PropertyOverride[],
	caseSensitive: boolean,
): string[] {
	const taken = new Set(
		overrides.map((entry) => (caseSensitive ? entry.property : entry.property.toLowerCase())),
	);
	return propertyNames.filter((name) => !taken.has(caseSensitive ? name : name.toLowerCase()));
}
