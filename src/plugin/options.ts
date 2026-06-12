import vm from 'node:vm';
import type { SFCDescriptor } from '@vue/compiler-sfc';
import { parseSync } from 'oxc-parser';

/** Returns options declared using `defineOptions` in a Vue component. */
export function getComponentOptions(
	sfc_descriptor: SFCDescriptor,
): Record<PropertyKey, unknown> {
	return {
		...(sfc_descriptor.script
			? extractOptionsFromScript(sfc_descriptor.script.content)
			: undefined),
		...(sfc_descriptor.scriptSetup
			? extractOptionsFromScript(sfc_descriptor.scriptSetup.content)
			: undefined),
	};
}

/** Returns options declared using `defineOptions` in a Vue component. */
function extractOptionsFromScript(
	scriptContent: string,
): Record<PropertyKey, unknown> | undefined {
	const result = parseSync('component.vue.ts', scriptContent, {
		sourceType: 'module',
	});

	const { body } = result.program;

	for (const stmt of body) {
		if (
			stmt.type !== 'ExpressionStatement'
			|| stmt.expression.type !== 'CallExpression'
		) {
			continue;
		}

		const call = stmt.expression;

		if (
			call.callee.type !== 'Identifier'
			|| call.callee.name !== 'defineOptions'
		) {
			continue;
		}

		const arg = call.arguments[0];

		if (!arg) {
			return undefined;
		}

		const code = scriptContent.slice(arg.start, arg.end);

		const options = vm.runInNewContext(`(${code})`, Object.create(null), {
			timeout: 50,
		});

		return options;
	}

	return undefined;
}
