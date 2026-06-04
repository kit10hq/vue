import { compileScript, compileStyle, parse } from "@vue/compiler-sfc";
import { parseSync } from "oxc-parser";
//#region src/plugin/main.ts
/**
* Generates a random string.
* @returns -
*/
function randomString() {
	return Math.random().toString(36).slice(2, 9);
}
const vuePlugin = {
	filter: /\.vue$/u,
	async transform(artifact, options) {
		artifact.meta.vue = true;
		const id = randomString();
		const name_generic = artifact.path.replace(/\.vue$/u, "").replaceAll("/", "-");
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
					isTS: true
				}
			}
		}).content;
		const has_styles = sfc.descriptor.styles.length > 0;
		let has_scoped_styles = false;
		const cssArtifacts = /* @__PURE__ */ new Set();
		const promises = [];
		for (const style of sfc.descriptor.styles) {
			if (style.scoped) has_scoped_styles = true;
			const cssArtifact = artifact.create(style.content, { ext: style.lang ?? "css" });
			cssArtifact.meta.scoped = style.scoped;
			cssArtifacts.add(cssArtifact);
			promises.push(cssArtifact.process());
		}
		await Promise.all(promises);
		let css = "";
		for (const cssArtifact of cssArtifacts) {
			css += compileStyle({
				source: cssArtifact.text(),
				filename: artifact.path,
				id: artifact.id,
				scoped: cssArtifact.meta.scoped === true
			}).code;
			cssArtifact.delete();
		}
		const oxc = parseSync("anonymous.ts", contents_script_ts);
		const contents_result = [];
		for (const node of oxc.program.body) if (node.type === "ExportDefaultDeclaration") {
			contents_result.push("import { VueCustomElement as _VueCustomElement, defineElement as _defineElement } from \"@kit10/vue/element\";", contents_script_ts.slice(0, node.start), `const __sfc__ = ${contents_script_ts.slice(node.declaration.start, node.declaration.end)};`, contents_script_ts.slice(node.end), `__sfc__.name ??= ${JSON.stringify(name_generic)};`, ...has_styles && has_scoped_styles ? [`__sfc__.__scopeId = "data-v-${id}";`] : [], ...has_styles ? [`const __css = ${JSON.stringify(css)};`] : [], "if (__sfc__.customElement === true) {", "	class _Element extends _VueCustomElement {", "		constructor() {", "			super(__sfc__);", "		}", "	}", `\t_defineElement(__sfc__.name, _Element${has_styles ? `, __css` : ""});`, "}", ...has_styles ? [
				"else {",
				"	const element = document.createElement(\"style\");",
				`\telement.dataset.element = __sfc__.name;`,
				`\telement.textContent += __css;`,
				"	document.head.append(element);",
				"}"
			] : [], "export default __sfc__;");
			break;
		}
		if (contents_result.length === 0) throw new Error("No default export found in Vue script.");
		artifact.updateExt("ts");
		artifact.update(contents_result.join("\n"));
	}
};
//#endregion
export { vuePlugin };
