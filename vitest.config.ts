import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			// The load smoke test exercises real plugin code, which imports
			// `obsidian`. Everything else under core/ imports nothing at all.
			obsidian: fileURLToPath(new URL('./tests/stubs/obsidian.ts', import.meta.url)),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		restoreMocks: true,
		clearMocks: true,
	},
});
