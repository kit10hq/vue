/** Returns whether the value is an object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Formats compiler errors with file context. */
export function formatCompilerErrors(
	filename: string,
	errors: unknown[],
): string {
	return [
		`Failed to compile ${filename}.`,
		...errors.map((error) =>
			error instanceof Error ? error.message : String(error),
		),
	].join('\n');
}
