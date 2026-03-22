import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			fs: 'node:fs',
			path: 'node:path',
			os: 'node:os',
			crypto: 'node:crypto',
		}
	},
});
