import { compileScript } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';
import {
	type Plugin,
	type ResolvedConfig,
	type TransformResult,
	transformWithOxc,
} from 'vite';
import { parseVueFile, type VueFileData, vue_files } from './file.js';
import { getScriptLang, type ScriptLang } from './script.js';
import {
	createStyleImportName,
	createStyleRequest,
	loadStyle,
	parseStyleRequest,
	transformStyle,
} from './style.js';
import { cleanUrl, normalizePath } from './utils.js';

/** Returns whether the id points to a Vue SFC file. */
function isVueRequest(id: string): boolean {
	return cleanUrl(id).endsWith('.vue');
}

/** Rewrites the compiled SFC default export to kit10 custom-element wiring. */
function wrapCompiledScript(
	file: VueFileData,
	contents_script_ts: string,
	script_lang: ScriptLang,
): string {
	const style_imports = file.descriptor.styles.map(
		(style, index) =>
			`import ${createStyleImportName(index)} from ${JSON.stringify(
				createStyleRequest(file.filename, index, style),
			)};`,
	);
	const style_import_names = Array.from(
		{ length: file.descriptor.styles.length },
		(_unused, index) => createStyleImportName(index),
	);
	const has_styles = style_imports.length > 0;
	const has_scoped_styles = file.descriptor.styles.some(
		(style) => style.scoped,
	);

	const oxc = parseSync(
		script_lang === 'jsx' || script_lang === 'tsx'
			? 'anonymous.tsx'
			: 'anonymous.ts',
		contents_script_ts,
	);
	const contents_result: string[] = [];

	for (const node of oxc.program.body) {
		if (node.type !== 'ExportDefaultDeclaration') {
			continue;
		}

		contents_result.push(
			'import { VueCustomElement as _VueCustomElement, defineElement as _defineElement } from "@kit10/vue/element";',
			...style_imports,
			contents_script_ts.slice(0, node.start),
			`const __sfc__ = ${contents_script_ts.slice(
				node.declaration.start,
				node.declaration.end,
			)};`,
			contents_script_ts.slice(node.end),
			`__sfc__.name ??= ${JSON.stringify(file.name_generic)};`,
			...(has_styles && has_scoped_styles
				? [`__sfc__.__scopeId = "data-v-${file.scope_id}";`]
				: []),
			...(has_styles
				? [`const __css = [${style_import_names.join(', ')}].join("\\n");`]
				: []),
			'if (__sfc__.customElement === true) {',
			'\tclass _Element extends _VueCustomElement {',
			'\t\tconstructor() {',
			'\t\t\tsuper(__sfc__);',
			'\t\t}',
			'\t}',
			`\t_defineElement(__sfc__.name, _Element${has_styles ? ', __css' : ''});`,
			'}',
			...(has_styles
				? [
						'else {',
						'\tconst element = document.createElement("style");',
						'\telement.dataset.element = __sfc__.name;',
						'\telement.textContent += __css;',
						'\tdocument.head.append(element);',
						'}',
					]
				: []),
			'export default __sfc__;',
		);

		break;
	}

	if (contents_result.length === 0) {
		throw new Error(`No default export found in ${file.filename}.`);
	}

	return contents_result.join('\n');
}

/** Compiles a Vue SFC into the same custom-element wrapper used by old kit10. */
async function transformVue(
	code: string,
	id: string,
	config: ResolvedConfig,
): Promise<TransformResult> {
	const filename = normalizePath(cleanUrl(id));
	const file = parseVueFile(filename, code, config.root);
	const script_lang = getScriptLang(file.descriptor);
	const contents_script_ts = compileScript(file.descriptor, {
		id: file.scope_id,
		inlineTemplate: true,
		isProd: config.isProduction,
		templateOptions: {
			filename: file.filename,
			id: file.scope_id,
			compilerOptions: {
				hoistStatic: true,
				cacheHandlers: true,
				isTS: script_lang === 'ts' || script_lang === 'tsx',
			},
		},
	}).content;
	const wrapped = wrapCompiledScript(file, contents_script_ts, script_lang);

	if (script_lang === 'js') {
		return {
			code: wrapped,
			map: null,
		};
	}

	const transformed = await transformWithOxc(
		wrapped,
		`${file.filename}.${script_lang}`,
		{ lang: script_lang },
		undefined,
		config,
	);

	return {
		code: transformed.code,
		map: null,
	};
}

export const vuePlugin: Plugin = {
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

let resolved_config: ResolvedConfig | null = null;
