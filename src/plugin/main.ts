import type { Kit10Plugin } from '@kit10/vite';
import { transformVuePage } from './kit10.js';
import { vueVitePlugin } from './vite.js';

export const vuePlugin: Kit10Plugin = {
	kit10: true,
	htmlPreprocessor: {
		filter: /\.vue/u,
		transform: transformVuePage,
	},
	vitePlugins: [vueVitePlugin],
};
