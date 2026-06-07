import {
	type App,
	createApp,
	// type Component,
} from 'vue';

interface Component {
	name: string;
	props: Record<string, unknown> | undefined;
}

export class VueCustomElement extends HTMLElement {
	app: App<Element>;

	constructor(component: Component, props_data: Record<string, unknown> = {}) {
		super();

		this.innerHTML = '';

		const props_data_attrs: Record<string, unknown> = {};

		if (component.props) {
			if ('customElement' in component.props) {
				props_data.customElement = this;
			}

			for (let { name, value } of this.attributes) {
				if (name.endsWith('.json')) {
					name = name.slice(0, -5);
					value = JSON.parse(value);
				}

				if (name !== 'class' && name !== 'style' && name in component.props) {
					props_data_attrs[name] = value;
				}
			}
		}

		this.app = createApp(component, {
			...props_data_attrs,
			...props_data,
		});
	}

	#is_disconnected_in_microtask = false;

	connectedCallback(): void {
		if (this.#is_disconnected_in_microtask) {
			this.#is_disconnected_in_microtask = false;
		} else {
			this.app.mount(this);
		}
	}

	disconnectedCallback(): void {
		this.#is_disconnected_in_microtask = true;

		queueMicrotask(() => {
			this.#is_disconnected_in_microtask = false;

			if (this.isConnected === false) {
				this.app.unmount();
			}
		});
	}
}

/**
 * Defines a custom element.
 * @param tag_name Custom element tag name.
 * @param VueCustomElementClass Copper component class.
 * @param [css] CSS code.
 */
export function defineElement(
	tag_name: string,
	VueCustomElementClass: typeof VueCustomElement,
	css?: string,
): void {
	addStyles(tag_name, css, true);

	globalThis.customElements.define(tag_name, VueCustomElementClass);
}

/**
 * Adds CSS styles for a custom element.
 * @param name Custom element tag name.
 * @param css CSS code.
 * @param is_custom_element Custom element tag name to use in the selector.
 */
export function addStyles(
	name: string,
	css: string | undefined,
	is_custom_element = false,
): void {
	const element = document.createElement('style');
	element.dataset.element = name;
	if (is_custom_element) {
		element.textContent = `${name}{display:contents;}`;
	}

	if (typeof css === 'string') {
		element.textContent += `\n${css}`;
	}

	document.head.append(element);
}
