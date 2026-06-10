import { compileScript } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';
import {
	type ResolvedConfig,
	type TransformResult,
	transformWithOxc,
} from 'vite';
import { parseVueFile, type VueFileData } from './file.js';
import { getScriptLang, type ScriptLang } from './script.js';
import { createStyleImportName, createStyleRequest } from './style.js';
import { cleanUrl, normalizePath } from './utils.js';

/** Rewrites the compiled SFC default export to kit10 custom-element wiring. */
export function wrapCompiledScript(
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

		const import_var = `element_${file.scope_id}`;
		const sfc_var = `sfc_${file.scope_id}`;
		const css_var = `css_${file.scope_id}`;

		contents_result.push(
			`import * as ${import_var} from "@kit10/vue/element";`,
			...style_imports,
			contents_script_ts.slice(0, node.start),
			`const ${sfc_var} = ${contents_script_ts.slice(
				node.declaration.start,
				node.declaration.end,
			)};`,
			contents_script_ts.slice(node.end),
			`${sfc_var}.__name = ${JSON.stringify(file.name_generic)};`,
			...(has_styles && has_scoped_styles
				? [`${sfc_var}.__scopeId = "data-v-${file.scope_id}";`]
				: []),
			...(has_styles
				? [`const ${css_var} = [${style_import_names.join(', ')}].join("\\n");`]
				: []),
			`if (${sfc_var}.customElement) {`,
			`\tclass _Element extends ${import_var}.VueCustomElement {`,
			'\t\tconstructor() {',
			`\t\t\tsuper(${sfc_var});`,
			'\t\t}',
			'\t}',
			`\t${import_var}.defineElement(${sfc_var}.customElement, _Element${has_styles ? `, ${css_var}` : ''});`,
			'} else {',
			...(has_styles
				? [`\t${import_var}.addStyles(${sfc_var}.__name, ${css_var});`]
				: []),
			'}',
			`export default ${sfc_var};`,
		);

		break;
	}

	if (contents_result.length === 0) {
		throw new Error(`No default export found in ${file.filename}.`);
	}

	return contents_result.join('\n');
}

/** Compiles a Vue SFC into the same custom-element wrapper used by old kit10. */
export async function transformVue(
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
