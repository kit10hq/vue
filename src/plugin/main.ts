import { randomUUID } from 'node:crypto';
import { compileScript, compileStyle, parse } from '@vue/compiler-sfc';
import type { Plugin } from 'kit10';
import { parseSync } from 'oxc-parser';

const CSS_PLACEHOLDER = randomUUID();

/**
 * Generates a random string.
 * @returns -
 */
function randomString(): string {
	return Math.random().toString(36).slice(2, 9);
}

export const compileVuePlugin: Plugin = {
	filter: /\.vue$/u,
	transform(artifact, options) {
		artifact.meta.vue = true;

		const id = randomString();
		const name_generic = artifact.path
			.replace(/\.vue$/u, '')
			.replaceAll('/', '-');
		const sfc = parse(artifact.text());

		const contents_script_ts = compileScript(sfc.descriptor, {
			id,
			inlineTemplate: true,
			isProd: options.is_prod,
			templateOptions: {
				filename: artifact.path,
				id,
				compilerOptions: {
					hoistStatic: true,
					cacheHandlers: true,
					isTS: true,
				},
			},
		}).content;

		// let is_style_scoped = false;
		// const result_style: string[] = [];
		const has_styles = sfc.descriptor.styles.length > 0;
		let has_scoped_styles = false;
		for (const style of sfc.descriptor.styles) {
			if (style.scoped) {
				has_scoped_styles = true;
			}

			const cssArtifact = artifact.create(style.lang ?? 'css', style.content);
			cssArtifact.meta.scoped = style.scoped;

			// let { content } = style;
			// if (style.lang === 'scss') {
			// 	content = compileScssString(path, content);
			// }

			// content = lightningCss(content, path);

			// is_style_scoped ||= style.scoped ?? false;
		}

		const oxc = parseSync('anonymous.ts', contents_script_ts);
		const contents_result: string[] = [];
		for (const node of oxc.program.body) {
			if (node.type === 'ExportDefaultDeclaration') {
				contents_result.push(
					'import { VueCustomElement as _VueCustomElement, defineElement as _defineElement } from "@kit10/vue/element";',
					contents_script_ts.slice(0, node.start),
					`const __sfc__ = ${contents_script_ts.slice(node.declaration.start, node.declaration.end)};`,
					contents_script_ts.slice(node.end),
					`__sfc__.name ??= ${JSON.stringify(name_generic)};`,
					...(has_styles && has_scoped_styles
						? [`__sfc__.__scopeId = "data-v-${id}";`]
						: []),
					...(has_styles ? [`const __css = "${CSS_PLACEHOLDER}";`] : []),
					// 'console.log(__sfc__.name , __sfc__.customElement);',
					'if (__sfc__.customElement === true) {',
					// '\tconsole.log("register", __sfc__.name , "as custom element");',
					'\tclass _Element extends _VueCustomElement {',
					'\t\tconstructor() {',
					'\t\t\tsuper(__sfc__);',
					'\t\t}',
					'\t}',
					`\t_defineElement(__sfc__.name, _Element${has_styles ? `, __css` : ''});`,
					'}',
					...(has_styles
						? [
								'else {',
								// '\tconsole.log("NOT register", __sfc__.name , "as custom element (WITH css)");',
								'\tconst element = document.createElement("style");',
								`\telement.dataset.element = __sfc__.name;`,
								`\telement.textContent += __css;`,
								'\tdocument.head.append(element);',
								'}',
							]
						: [
								// 'else {',
								// '\tconsole.log("NOT register", __sfc__.name , "as custom element (with NO css)");',
								// '}',
							]),
					'export default __sfc__;',
				);

				break;
			}
		}

		if (contents_result.length === 0) {
			throw new Error('No default export found in Vue script.');
		}

		// console.log('----------', path, '----------');
		// console.log(contents_result.join('\n'));

		artifact.updateExt('ts');
		artifact.update(contents_result.join('\n'));
	},
};

export const vueCssPlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		if (artifact.meta.vue !== true) {
			return;
		}

		const [cssArtifact] = artifact.dependencies;
		if (!cssArtifact) {
			return;
		}

		const css = compileStyle({
			source: cssArtifact.text(),
			filename: cssArtifact.path,
			id: artifact.id,
			scoped: cssArtifact.meta.scoped === true,
		}).code;

		let css_escaped = JSON.stringify(css).slice(1, -1);
		artifact.update(artifact.text().replace(CSS_PLACEHOLDER, css_escaped));

		cssArtifact.delete();
	},
};
