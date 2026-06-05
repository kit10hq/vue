import type { SFCDescriptor } from '@vue/compiler-sfc';

export type ScriptLang = 'js' | 'jsx' | 'ts' | 'tsx';

/** Returns the language that must be stripped by OXC after SFC compilation. */
export function getScriptLang(descriptor: SFCDescriptor): ScriptLang {
	const lang = descriptor.scriptSetup?.lang ?? descriptor.script?.lang;
	if (lang === 'jsx' || lang === 'tsx' || lang === 'ts') {
		return lang;
	}

	return 'js';
}
