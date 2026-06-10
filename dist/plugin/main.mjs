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
			const var_module = `module_${randomString()}`;
			const var_sfc = `sfc_${randomString()}`;
			const var_css = `css_${randomString()}`;
			contents_result.push(`import * as ${var_module} from "@kit10/vue/element";`, contents_script_ts.slice(0, node.start), `const ${var_sfc} = ${contents_script_ts.slice(node.declaration.start, node.declaration.end)};`, contents_script_ts.slice(node.end), `${var_sfc}.name ??= ${JSON.stringify(name_generic)};`, ...has_styles && has_scoped_styles ? [`${var_sfc}.__scopeId = "data-v-${id}";`] : [], ...has_styles ? [`const ${var_css} = ${JSON.stringify(css)};`] : [], `if (${var_sfc}.customElement) {`, `\tclass _Element extends ${var_module}.VueCustomElement {`, "		constructor() {", `\t\t\tsuper(${var_sfc});`, "		}", "	}", `\t${var_module}.defineElement(${var_sfc}.name, _Element${has_styles ? `, ${var_css}` : ""});`, "}", ...has_styles ? [
				"else {",
				`\t${var_module}.addStyles(${var_sfc}.name, ${var_css})`,
				"}"
			] : [], `export default ${var_sfc};`);
			break;
		}
		if (contents_result.length === 0) throw new Error("No default export found in Vue script.");
		artifact.updateExt("ts");
		artifact.update(contents_result.join("\n"));
	}
};
//#endregion
export { vuePlugin };
