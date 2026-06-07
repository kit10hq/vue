import fs from "node:fs/promises";
import nodePath from "node:path";
import { compileScript, compileStyle, parse } from "@vue/compiler-sfc";
import { parseSync } from "oxc-parser";
import crypto from "node:crypto";
import { transformWithOxc } from "vite";
//#region src/plugin/utils.ts
/** Returns whether the value is an object record. */
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
/** Formats compiler errors with file context. */
function formatCompilerErrors(filename, errors) {
	return [`Failed to compile ${filename}.`, ...errors.map((error) => error instanceof Error ? error.message : String(error))].join("\n");
}
//#endregion
//#region src/plugin/vite/script.ts
/** Returns the language that must be stripped by OXC after SFC compilation. */
function getScriptLang(descriptor) {
	var _descriptor$scriptSet, _descriptor$script;
	const lang = ((_descriptor$scriptSet = descriptor.scriptSetup) === null || _descriptor$scriptSet === void 0 ? void 0 : _descriptor$scriptSet.lang) ?? ((_descriptor$script = descriptor.script) === null || _descriptor$script === void 0 ? void 0 : _descriptor$script.lang);
	if (lang === "jsx" || lang === "tsx" || lang === "ts") return lang;
	return "js";
}
//#endregion
//#region src/plugin/kit10.ts
/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** Extracts <kit10:head> contents from Vue custom blocks. */
function getKit10Head(descriptor) {
	return descriptor.customBlocks.filter((block) => block.type === "kit10:head").map((block) => block.content.trim()).filter((content) => content.length > 0).join("\n");
}
/** Returns the object passed to defineComponent(), or the expression itself. */
function getComponentOptionsExpression(expression) {
	if (!isRecord(expression) || expression.type !== "CallExpression") return expression;
	const args = expression.arguments;
	if (!Array.isArray(args)) return expression;
	return args[0] ?? expression;
}
/** Returns whether an object property key is the customElement key. */
function isCustomElementKey(key) {
	if (!isRecord(key)) return false;
	if (key.type === "Identifier") return key.name === "customElement";
	return key.type === "Literal" && key.value === "customElement";
}
/** Reads customElement from a component options object. */
function readCustomElementFromOptions(options, filename) {
	if (!isRecord(options) || options.type !== "ObjectExpression") return null;
	const { properties } = options;
	if (!Array.isArray(properties)) return null;
	for (let index = properties.length - 1; index >= 0; index--) {
		const property = properties[index];
		if (!isRecord(property)) continue;
		if (property.type === "SpreadElement") {
			const custom_element = readCustomElementFromOptions(property.argument, filename);
			if (custom_element !== null) return custom_element;
			continue;
		}
		if (property.type !== "Property" || !isCustomElementKey(property.key)) continue;
		const { value } = property;
		if (isRecord(value) && value.type === "Literal" && typeof value.value === "string") return value.value;
		throw new Error(`Vue page "${filename}" must use a static string customElement option.`);
	}
	return null;
}
/** Extracts customElement from compiled SFC options. */
function getCustomElementName(descriptor, filename) {
	const script_lang = getScriptLang(descriptor);
	const script = compileScript(descriptor, { id: "kit10-vue-page" }).content;
	const ast = parseSync(script_lang === "jsx" || script_lang === "tsx" ? "anonymous.tsx" : "anonymous.ts", script);
	for (const node of ast.program.body) {
		if (node.type !== "ExportDefaultDeclaration") continue;
		const custom_element = readCustomElementFromOptions(getComponentOptionsExpression(node.declaration), filename);
		if (custom_element !== null) return custom_element;
	}
	throw new Error(`Vue page "${filename}" must define a static customElement option.`);
}
/** Compiles a Vue page SFC into a Kit10 HTML fragment. */
async function transformVuePage(filename) {
	const parsed = parse(await fs.readFile(filename, "utf8"), { filename });
	if (parsed.errors.length > 0) throw new Error(formatCompilerErrors(filename, parsed.errors));
	const { descriptor } = parsed;
	const custom_element = getCustomElementName(descriptor, filename);
	const kit10_head = getKit10Head(descriptor);
	const component_html = `<${custom_element}><script type="module" src="${escapeAttribute(`./${nodePath.basename(filename)}`)}"><\/script></${custom_element}>`;
	if (kit10_head.length === 0) return component_html;
	return `<kit10:head>\n${kit10_head}\n</kit10:head>\n${component_html}`;
}
//#endregion
//#region src/plugin/vite/utils.ts
/** Returns the path without query/hash parts. */
function cleanUrl(id) {
	return id.replace(/[?#].*$/u, "");
}
/** Normalizes ids so cache keys match Vite's POSIX-style paths. */
function normalizePath(path) {
	return path.replaceAll(nodePath.win32.sep, "/");
}
/** Creates the stable scope id used by Vue template and style compilers. */
function createScopeId(filename) {
	return crypto.createHash("sha256").update(normalizePath(filename)).digest("hex").slice(0, 8);
}
/** Creates the fallback component/custom-element name. */
function createGenericName(filename, root) {
	return normalizePath(nodePath.relative(root, filename)).replace(/\.vue$/u, "").replaceAll("/", "-");
}
/** Returns whether the id points to a Vue SFC file. */
function isVueRequest(id) {
	return cleanUrl(id).endsWith(".vue");
}
//#endregion
//#region src/plugin/vite/file.ts
const vue_files = /* @__PURE__ */ new Map();
/** Loads a cached Vue SFC or reads it from disk. */
async function getVueFileData(filename, root) {
	const cached = vue_files.get(filename);
	if (cached) return cached;
	return parseVueFile(filename, await fs.readFile(filename, "utf8"), root);
}
/** Parses and caches a Vue SFC. */
function parseVueFile(filename, source, root) {
	const parsed = parse(source, { filename });
	if (parsed.errors.length > 0) throw new Error(formatCompilerErrors(filename, parsed.errors));
	const data = {
		descriptor: parsed.descriptor,
		filename,
		name_generic: createGenericName(filename, root),
		scope_id: createScopeId(filename)
	};
	vue_files.set(filename, data);
	return data;
}
//#endregion
//#region src/plugin/vite/style.ts
const STYLE_QUERY = "kit10-vue-style";
const STYLE_REQUEST_RE = /^(?<filename>.+\.vue)\.__kit10_style_(?<index>\d+)__\.(?<lang>css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/u;
/** Returns whether a style language is processed by Vite's CSS pipeline. */
function isCssLang(lang) {
	return lang === "css" || lang === "less" || lang === "sass" || lang === "scss" || lang === "styl" || lang === "stylus" || lang === "pcss" || lang === "postcss" || lang === "sss";
}
/** Creates a virtual module id for a style block. */
function createStyleRequest(filename, index, style) {
	return `${filename}.__kit10_style_${index}__.${getStyleLang(style, filename)}?${STYLE_QUERY}&index=${index}&inline`;
}
/** Returns whether the id points to an SFC style virtual module. */
function isStyleRequest(id) {
	return id.includes(STYLE_QUERY);
}
/** Parses a virtual style module id. */
function parseStyleRequest(id) {
	if (!isStyleRequest(id)) return null;
	const match = STYLE_REQUEST_RE.exec(cleanUrl(id));
	if (!(match === null || match === void 0 ? void 0 : match.groups)) return null;
	return {
		filename: normalizePath(match.groups.filename),
		index: Number.parseInt(match.groups.index, 10),
		lang: match.groups.lang
	};
}
/** Creates the local import binding name for a style block. */
function createStyleImportName(index) {
	return `__kit10_vue_style_${index}`;
}
/** Returns the Vite-supported CSS language for a style block. */
function getStyleLang(style, filename) {
	const lang = style.lang ?? "css";
	if (isCssLang(lang)) return lang;
	throw new Error(`Unsupported <style lang="${lang}"> in ${filename}. Vite can inline css, less, sass, scss, styl, stylus, pcss, postcss, and sss styles.`);
}
/** Loads the raw style content for Vite's CSS pipeline. */
async function loadStyle(request, config) {
	const style = (await getVueFileData(request.filename, config.root)).descriptor.styles[request.index];
	if (!style) throw new Error(`Missing <style> block #${request.index} in ${request.filename}.`);
	if (style.src) return `@import ${JSON.stringify(style.src)};`;
	return style.content;
}
/** Compiles a loaded style virtual module after Vite CSS processing. */
async function transformStyle(code, request, config) {
	const file = await getVueFileData(request.filename, config.root);
	const style = file.descriptor.styles[request.index];
	if (!style) throw new Error(`Missing <style> block #${request.index} in ${request.filename}.`);
	const compiled = compileStyle({
		source: code,
		filename: request.filename,
		id: file.scope_id,
		scoped: style.scoped,
		isProd: config.isProduction
	});
	assertNoStyleErrors(request.filename, compiled.errors);
	return {
		code: compiled.code,
		map: null
	};
}
/** Throws when the Vue style compiler reports errors. */
function assertNoStyleErrors(filename, errors) {
	if (errors.length > 0) throw new Error(formatCompilerErrors(filename, errors));
}
//#endregion
//#region src/plugin/vite/sfc.ts
/** Rewrites the compiled SFC default export to kit10 custom-element wiring. */
function wrapCompiledScript(file, contents_script_ts, script_lang) {
	const style_imports = file.descriptor.styles.map((style, index) => `import ${createStyleImportName(index)} from ${JSON.stringify(createStyleRequest(file.filename, index, style))};`);
	const style_import_names = Array.from({ length: file.descriptor.styles.length }, (_unused, index) => createStyleImportName(index));
	const has_styles = style_imports.length > 0;
	const has_scoped_styles = file.descriptor.styles.some((style) => style.scoped);
	const oxc = parseSync(script_lang === "jsx" || script_lang === "tsx" ? "anonymous.tsx" : "anonymous.ts", contents_script_ts);
	const contents_result = [];
	for (const node of oxc.program.body) {
		if (node.type !== "ExportDefaultDeclaration") continue;
		const import_name = `element_${file.scope_id}`;
		const sfc_name = `sfc_${file.scope_id}`;
		const css_name = `css_${file.scope_id}`;
		contents_result.push(`import * as ${import_name} from "@kit10/vue/element";`, ...style_imports, contents_script_ts.slice(0, node.start), `const ${sfc_name} = ${contents_script_ts.slice(node.declaration.start, node.declaration.end)};`, contents_script_ts.slice(node.end), `${sfc_name}.__name = ${JSON.stringify(file.name_generic)};`, ...has_styles && has_scoped_styles ? [`${sfc_name}.__scopeId = "data-v-${file.scope_id}";`] : [], ...has_styles ? [`const ${css_name} = [${style_import_names.join(", ")}].join("\\n");`] : [], `if (${sfc_name}.customElement === undefined) {`, ...has_styles ? [`\t${import_name}.addStyles(${sfc_name}.__name, ${css_name});`] : [], "} else {", `\tclass _Element extends ${import_name}.VueCustomElement {`, "		constructor() {", `\t\t\tsuper(${sfc_name});`, "		}", "	}", `\t${import_name}.defineElement(${sfc_name}.customElement, _Element${has_styles ? `, ${css_name}` : ""});`, "}", `export default ${sfc_name};`);
		break;
	}
	if (contents_result.length === 0) throw new Error(`No default export found in ${file.filename}.`);
	return contents_result.join("\n");
}
/** Compiles a Vue SFC into the same custom-element wrapper used by old kit10. */
async function transformVue(code, id, config) {
	const file = parseVueFile(normalizePath(cleanUrl(id)), code, config.root);
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
				isTS: script_lang === "ts" || script_lang === "tsx"
			}
		}
	}).content;
	const wrapped = wrapCompiledScript(file, contents_script_ts, script_lang);
	if (script_lang === "js") return {
		code: wrapped,
		map: null
	};
	return {
		code: (await transformWithOxc(wrapped, `${file.filename}.${script_lang}`, { lang: script_lang }, void 0, config)).code,
		map: null
	};
}
//#endregion
//#region src/plugin/vite.ts
let resolved_config = null;
//#endregion
//#region src/plugin/main.ts
const vuePlugin = {
	kit10: true,
	htmlPreprocessor: {
		filter: /\.vue/u,
		transform: transformVuePage
	},
	vitePlugins: [{
		name: "kit10:vue",
		config() {
			return { css: { transformer: "lightningcss" } };
		},
		configResolved(config) {
			vue_files.clear();
			resolved_config = config;
		},
		resolveId(id) {
			if (parseStyleRequest(id)) return id;
		},
		async load(id) {
			const style_request = parseStyleRequest(id);
			if (!style_request || !resolved_config) return;
			this.addWatchFile(style_request.filename);
			return await loadStyle(style_request, resolved_config);
		},
		async transform(code, id) {
			if (!resolved_config) return;
			const style_request = parseStyleRequest(id);
			if (style_request) return await transformStyle(code, style_request, resolved_config);
			if (!isVueRequest(id)) return;
			return await transformVue(code, id, resolved_config);
		},
		handleHotUpdate(context) {
			vue_files.delete(normalizePath(context.file));
		}
	}]
};
//#endregion
export { vuePlugin };
