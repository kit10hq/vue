import type { Kit10Plugin } from '@kit10/vite';
import { vueVitePlugin } from './vite/main.js';

export const vuePlugin: Kit10Plugin = {
	kit10: true,
	htmlPreprocessor(path) {
		return '???';
	},
	vitePlugins: [vueVitePlugin],
};
