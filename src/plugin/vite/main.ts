import type { ResolvedConfig, Plugin as VitePlugin } from 'vite';
import { vue_files } from './file.js';
import { transformVue } from './sfc.js';
import { loadStyle, parseStyleRequest, transformStyle } from './style.js';
import { isVueRequest, normalizePath } from './utils.js';

let resolved_config: ResolvedConfig | null = null;

export const vueVitePlugin: VitePlugin = {
	name: 'kit10:vue',
	config() {
		return {
			css: {
				transformer: 'lightningcss',
			},
		};
	},
	configResolved(config) {
		vue_files.clear();
		resolved_config = config;
	},
	resolveId(id) {
		if (parseStyleRequest(id)) {
			return id;
		}
	},
	async load(id) {
		const style_request = parseStyleRequest(id);
		if (!style_request || !resolved_config) {
			return;
		}

		this.addWatchFile(style_request.filename);

		return await loadStyle(style_request, resolved_config);
	},
	async transform(code, id) {
		if (!resolved_config) {
			return;
		}

		const style_request = parseStyleRequest(id);
		if (style_request) {
			return await transformStyle(code, style_request, resolved_config);
		}

		if (!isVueRequest(id)) {
			return;
		}

		return await transformVue(code, id, resolved_config);
	},
	handleHotUpdate(context) {
		vue_files.delete(normalizePath(context.file));
	},
};
