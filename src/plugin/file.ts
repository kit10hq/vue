import fs from 'node:fs/promises';
import { parse, type SFCDescriptor } from '@vue/compiler-sfc';
import {
	createGenericName,
	createScopeId,
	formatCompilerErrors,
} from './utils.js';

export type VueFileData = {
	descriptor: SFCDescriptor;
	filename: string;
	name_generic: string;
	scope_id: string;
};

export const vue_files: Map<string, VueFileData> = new Map<
	string,
	VueFileData
>();

/** Loads a cached Vue SFC or reads it from disk. */
export async function getVueFileData(
	filename: string,
	root: string,
): Promise<VueFileData> {
	const cached = vue_files.get(filename);
	if (cached) {
		return cached;
	}

	return parseVueFile(filename, await fs.readFile(filename, 'utf8'), root);
}

/** Parses and caches a Vue SFC. */
export function parseVueFile(
	filename: string,
	source: string,
	root: string,
): VueFileData {
	const parsed = parse(source, { filename });
	if (parsed.errors.length > 0) {
		throw new Error(formatCompilerErrors(filename, parsed.errors));
	}

	const data = {
		descriptor: parsed.descriptor,
		filename,
		name_generic: createGenericName(filename, root),
		scope_id: createScopeId(filename),
	};

	vue_files.set(filename, data);

	return data;
}
