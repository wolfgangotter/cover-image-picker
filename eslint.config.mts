import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		// Hand-written throwaway diagnostics, not part of the plugin build.
		'probes',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'vitest.config.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Tests run in Node under vitest, where `window` does not exist and
		// nothing is shipped to a mobile device, so the Obsidian runtime rules
		// do not apply. The stub deliberately mimics Obsidian's own shapes.
		files: ['tests/**/*.ts'],
		rules: {
			'obsidianmd/prefer-window-timers': 'off',
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			// The stub installs Obsidian's own globals, which is the thing
			// under test; there is no popout window in a vitest run.
			'obsidianmd/no-global-this': 'off',
		},
	},
	{
		// Build tooling, never bundled into main.js.
		files: ['vitest.config.ts', 'esbuild.config.mjs'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
