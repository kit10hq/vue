import crypto from 'node:crypto';
import nodePath from 'node:path';

/** Returns the path without query/hash parts. */
export function cleanUrl(id: string): string {
	return id.replace(/[?#].*$/u, '');
}

/** Normalizes ids so cache keys match Vite's POSIX-style paths. */
export function normalizePath(path: string): string {
	return path.replaceAll(nodePath.win32.sep, '/');
}

/** Creates the stable scope id used by Vue template and style compilers. */
export function createScopeId(filename: string): string {
	return crypto
		.createHash('sha256')
		.update(normalizePath(filename))
		.digest('hex')
		.slice(0, 8);
}

/** Creates the fallback component/custom-element name. */
export function createGenericName(filename: string, root: string): string {
	return normalizePath(nodePath.relative(root, filename))
		.replace(/\.vue$/u, '')
		.replaceAll('/', '-');
}

/** Returns whether the id points to a Vue SFC file. */
export function isVueRequest(id: string): boolean {
	return cleanUrl(id).endsWith('.vue');
}
