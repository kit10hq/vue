import { compileStyle, type SFCStyleBlock } from '@vue/compiler-sfc';
import type { ResolvedConfig, TransformResult } from 'vite';
import { formatCompilerErrors } from '../utils.js';
import { getVueFileData } from './file.js';
import { cleanUrl, normalizePath } from './utils.js';

type StyleRequest = {
	filename: string;
	index: number;
	lang: CssLang;
};
type CssLang =
	| 'css'
	| 'less'
	| 'sass'
	| 'scss'
	| 'styl'
	| 'stylus'
	| 'pcss'
	| 'postcss'
	| 'sss';

const STYLE_QUERY = 'kit10-vue-style';
const STYLE_REQUEST_RE =
	/^(?<filename>.+\.vue)\.__kit10_style_(?<index>\d+)__\.(?<lang>css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/u;

/** Returns whether a style language is processed by Vite's CSS pipeline. */
function isCssLang(lang: string): lang is CssLang {
	return (
		lang === 'css'
		|| lang === 'less'
		|| lang === 'sass'
		|| lang === 'scss'
		|| lang === 'styl'
		|| lang === 'stylus'
		|| lang === 'pcss'
		|| lang === 'postcss'
		|| lang === 'sss'
	);
}

/** Creates a virtual module id for a style block. */
export function createStyleRequest(
	filename: string,
	index: number,
	style: SFCStyleBlock,
): string {
	const lang = getStyleLang(style, filename);

	return `${filename}.__kit10_style_${index}__.${lang}?${STYLE_QUERY}&index=${index}&inline`;
}

/** Returns whether the id points to an SFC style virtual module. */
function isStyleRequest(id: string): boolean {
	return id.includes(STYLE_QUERY);
}

/** Parses a virtual style module id. */
export function parseStyleRequest(id: string): StyleRequest | null {
	if (!isStyleRequest(id)) {
		return null;
	}

	const match = STYLE_REQUEST_RE.exec(cleanUrl(id));
	if (!match?.groups) {
		return null;
	}

	return {
		filename: normalizePath(match.groups.filename!),
		index: Number.parseInt(match.groups.index!, 10),
		lang: match.groups.lang! as CssLang,
	};
}

/** Creates the local import binding name for a style block. */
export function createStyleImportName(index: number): string {
	return `__kit10_vue_style_${index}`;
}

/** Returns the Vite-supported CSS language for a style block. */
export function getStyleLang(style: SFCStyleBlock, filename: string): CssLang {
	const lang = style.lang ?? 'css';
	if (isCssLang(lang)) {
		return lang;
	}

	throw new Error(
		`Unsupported <style lang="${lang}"> in ${filename}. Vite can inline css, less, sass, scss, styl, stylus, pcss, postcss, and sss styles.`,
	);
}

/** Loads the raw style content for Vite's CSS pipeline. */
export async function loadStyle(
	request: StyleRequest,
	config: ResolvedConfig,
): Promise<string> {
	const file = await getVueFileData(request.filename, config.root);
	const style = file.descriptor.styles[request.index];
	if (!style) {
		throw new Error(
			`Missing <style> block #${request.index} in ${request.filename}.`,
		);
	}

	if (style.src) {
		return `@import ${JSON.stringify(style.src)};`;
	}

	return style.content;
}

/** Compiles a loaded style virtual module after Vite CSS processing. */
export async function transformStyle(
	code: string,
	request: StyleRequest,
	config: ResolvedConfig,
): Promise<TransformResult> {
	const file = await getVueFileData(request.filename, config.root);
	const style = file.descriptor.styles[request.index];
	if (!style) {
		throw new Error(
			`Missing <style> block #${request.index} in ${request.filename}.`,
		);
	}

	const compiled = compileStyle({
		source: code,
		filename: request.filename,
		id: file.scope_id,
		scoped: style.scoped,
		isProd: config.isProduction,
	});

	assertNoStyleErrors(request.filename, compiled.errors);

	return {
		code: compiled.code,
		map: null,
	};
}

/** Throws when the Vue style compiler reports errors. */
function assertNoStyleErrors(filename: string, errors: Error[]): void {
	if (errors.length > 0) {
		throw new Error(formatCompilerErrors(filename, errors));
	}
}
