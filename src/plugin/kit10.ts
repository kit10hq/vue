import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { compileScript, parse, type SFCDescriptor } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';
import { formatCompilerErrors, isRecord } from './utils.js';
import { getScriptLang } from './vite/script.js';

/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Extracts <kit10:head> contents from Vue custom blocks. */
function getKit10Head(descriptor: SFCDescriptor): string {
	return descriptor.customBlocks
		.filter((block) => block.type === 'kit10:head')
		.map((block) => block.content.trim())
		.filter((content) => content.length > 0)
		.join('\n');
}

/** Returns the object passed to defineComponent(), or the expression itself. */
function getComponentOptionsExpression(expression: unknown): unknown {
	if (!isRecord(expression) || expression.type !== 'CallExpression') {
		return expression;
	}

	const args = expression.arguments;
	if (!Array.isArray(args)) {
		return expression;
	}

	return args[0] ?? expression;
}

/** Returns whether an object property key is the customElement key. */
function isCustomElementKey(key: unknown): boolean {
	if (!isRecord(key)) {
		return false;
	}

	if (key.type === 'Identifier') {
		return key.name === 'customElement';
	}

	return key.type === 'Literal' && key.value === 'customElement';
}

/** Reads customElement from a component options object. */
function readCustomElementFromOptions(
	options: unknown,
	filename: string,
): string | null {
	if (!isRecord(options) || options.type !== 'ObjectExpression') {
		return null;
	}

	const { properties } = options;
	if (!Array.isArray(properties)) {
		return null;
	}

	for (let index = properties.length - 1; index >= 0; index--) {
		const property = properties[index];
		if (!isRecord(property)) {
			continue;
		}

		if (property.type === 'SpreadElement') {
			const custom_element = readCustomElementFromOptions(
				property.argument,
				filename,
			);
			if (custom_element !== null) {
				return custom_element;
			}

			continue;
		}

		if (property.type !== 'Property' || !isCustomElementKey(property.key)) {
			continue;
		}

		const { value } = property;
		if (
			isRecord(value)
			&& value.type === 'Literal'
			&& typeof value.value === 'string'
		) {
			return value.value;
		}

		throw new Error(
			`Vue page "${filename}" must use a static string customElement option.`,
		);
	}

	return null;
}

/** Extracts customElement from compiled SFC options. */
function getCustomElementName(
	descriptor: SFCDescriptor,
	filename: string,
): string {
	const script_lang = getScriptLang(descriptor);
	const script = compileScript(descriptor, {
		id: 'kit10-vue-page',
	}).content;
	const ast = parseSync(
		script_lang === 'jsx' || script_lang === 'tsx'
			? 'anonymous.tsx'
			: 'anonymous.ts',
		script,
	);

	for (const node of ast.program.body) {
		if (node.type !== 'ExportDefaultDeclaration') {
			continue;
		}

		const custom_element = readCustomElementFromOptions(
			getComponentOptionsExpression(node.declaration),
			filename,
		);
		if (custom_element !== null) {
			return custom_element;
		}
	}

	throw new Error(
		`Vue page "${filename}" must define a static customElement option.`,
	);
}

/** Compiles a Vue page SFC into a Kit10 HTML fragment. */
export async function transformVuePage(filename: string): Promise<string> {
	const source = await fs.readFile(filename, 'utf8');
	const parsed = parse(source, { filename });
	if (parsed.errors.length > 0) {
		throw new Error(formatCompilerErrors(filename, parsed.errors));
	}

	const { descriptor } = parsed;
	const custom_element = getCustomElementName(descriptor, filename);
	const kit10_head = getKit10Head(descriptor);
	const component_src = `./${nodePath.basename(filename)}`;
	const component_html = `<${custom_element}><script type="module" src="${escapeAttribute(component_src)}"></script></${custom_element}>`;

	if (kit10_head.length === 0) {
		return component_html;
	}

	return `<kit10:head>\n${kit10_head}\n</kit10:head>\n${component_html}`;
}
