/**
 * The scope guard.
 *
 * The spec's hard "do not do": nothing outside the configured property names
 * may be touched. This lives in core and is enforced inside the pipeline, not
 * only at the UI layer, so no trigger can route around it.
 */

import type { MatchMode } from '../settings/schema';

export interface MatchConfig {
	propertyNames: string[];
	matchMode: MatchMode;
	caseSensitive: boolean;
}

export function isTargetProperty(key: string, config: MatchConfig): boolean {
	const candidate = config.caseSensitive ? key : key.toLowerCase();
	return config.propertyNames.some((raw) => {
		const name = config.caseSensitive ? raw : raw.toLowerCase();
		if (!name) return false;
		return config.matchMode === 'prefix' ? candidate.startsWith(name) : candidate === name;
	});
}

/** Configured names that are not yet present, for the "create a property" path. */
export function missingPropertyNames(existingKeys: string[], config: MatchConfig): string[] {
	const existing = new Set(existingKeys.map((k) => (config.caseSensitive ? k : k.toLowerCase())));
	return config.propertyNames.filter(
		(name) => !existing.has(config.caseSensitive ? name : name.toLowerCase()),
	);
}
