import nodePath from "node:path";
import { compileScript, compileStyle, parse } from "@vue/compiler-sfc";
import { parseSync } from "oxc-parser";
import vm from "node:vm";
//#region src/plugin/options.ts
/** Returns options declared using `defineOptions` in a Vue component. */
function getComponentOptions(sfc_descriptor) {
	return {
		...sfc_descriptor.script ? extractOptionsFromScript(sfc_descriptor.script.content) : void 0,
		...sfc_descriptor.scriptSetup ? extractOptionsFromScript(sfc_descriptor.scriptSetup.content) : void 0
	};
}
/** Returns options declared using `defineOptions` in a Vue component. */
function extractOptionsFromScript(scriptContent) {
	const { body } = parseSync("component.vue.ts", scriptContent, { sourceType: "module" }).program;
	for (const stmt of body) {
		if (stmt.type !== "ExpressionStatement" || stmt.expression.type !== "CallExpression") continue;
		const call = stmt.expression;
		if (call.callee.type !== "Identifier" || call.callee.name !== "defineOptions") continue;
		const arg = call.arguments[0];
		if (!arg) return;
		const code = scriptContent.slice(arg.start, arg.end);
		return vm.runInNewContext(`(${code})`, Object.create(null), { timeout: 50 });
	}
}
//#endregion
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
		const id = randomString();
		const content = await artifact.text();
		const sfc = artifact.meta.vue_sfc ?? parse(content);
		if (artifact.is_page) {
			var _sfc$descriptor$custo;
			const component_options = getComponentOptions(sfc.descriptor);
			if (typeof component_options.name !== "string") throw new TypeError("Each vue component used as a page must have name defined in defineOptions macro.");
			if (component_options.customElement !== true) throw new TypeError("Each vue component used as a page must have customElement set to true in defineOptions macro.");
			const vueArtifact = artifact.create(artifact.filename.replace(/\+page\.vue$/u, ".vue"));
			vueArtifact.update(content);
			vueArtifact.meta.sfc = sfc;
			artifact.updateExt("html");
			artifact.update("");
			const kit10_head = (_sfc$descriptor$custo = sfc.descriptor.customBlocks) === null || _sfc$descriptor$custo === void 0 ? void 0 : _sfc$descriptor$custo.find((block) => block.type === "kit10:head");
			if (kit10_head) {
				artifact.append("<kit10:head>\n");
				artifact.append(kit10_head.content);
				artifact.append("</kit10:head>\n");
			}
			artifact.append(`<${component_options.name}>\n<script type="module" src="./${vueArtifact.filename}"><\/script>\n</${component_options.name}>`);
			return;
		}
		const name_generic = artifact.project_path.replace(/\.vue$/u, "").replaceAll(nodePath.sep, "-");
		const contents_script_ts = compileScript(sfc.descriptor, {
			id,
			inlineTemplate: true,
			isProd: options.is_prod,
			templateOptions: {
				filename: artifact.project_path,
				id,
				compilerOptions: {
					hoistStatic: true,
					cacheHandlers: true,
					isTS: true
				}
			}
		}).content;
		let has_scoped_styles = false;
		const cssArtifacts = [];
		for (const style of sfc.descriptor.styles) {
			if (style.scoped) has_scoped_styles = true;
			const cssArtifact = artifact.create({
				ext: `vue.${style.lang ?? "css"}`,
				content: style.content
			});
			cssArtifact.meta.id = id;
			cssArtifact.meta.scoped = style.scoped;
			cssArtifacts.push(cssArtifact);
		}
		const has_styles = cssArtifacts.length > 0;
		const oxc = parseSync("anonymous.ts", contents_script_ts);
		const contents_result = [];
		for (const node of oxc.program.body) if (node.type === "ExportDefaultDeclaration") {
			const var_module = `module_${randomString()}`;
			const var_sfc = `sfc_${randomString()}`;
			const var_css = `css_${randomString()}`;
			contents_result.push(`import * as ${var_module} from "@kit10/vue/element";`, ...cssArtifacts.map((cssArtifact) => `import css_${cssArtifact.id} from "./${cssArtifact.filename}" with { type: "text" };`), contents_script_ts.slice(0, node.start), `const ${var_sfc} = ${contents_script_ts.slice(node.declaration.start, node.declaration.end)};`, contents_script_ts.slice(node.end), `${var_sfc}.name ??= ${JSON.stringify(name_generic)};`, ...has_styles && has_scoped_styles ? [`${var_sfc}.__scopeId = "data-v-${id}";`] : [], ...has_styles ? [`const ${var_css} = ${cssArtifacts.map((cssArtifact) => `css_${cssArtifact.id}`).join(" + ")};`] : [], `if (${var_sfc}.customElement) {`, `\tclass _Element extends ${var_module}.VueCustomElement {`, "		constructor() {", `\t\t\tsuper(${var_sfc});`, "		}", "	}", `\t${var_module}.defineElement(${var_sfc}.name, _Element${has_styles ? `, ${var_css}` : ""});`, "}", ...has_styles ? [
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
const vueStylePlugin = {
	filter: /\.vue\.css$/u,
	async transform(artifact) {
		let content = await artifact.text();
		content = compileStyle({
			source: content,
			filename: artifact.absolute_path,
			id: artifact.meta.id,
			scoped: artifact.meta.scoped === true
		}).code;
		artifact.update(content);
	}
};
//#endregion
export { vuePlugin, vueStylePlugin };
