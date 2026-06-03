import { createApp } from "vue";
//#region src/element/main.ts
var VueCustomElement = class extends HTMLElement {
	app;
	constructor(component, props_data = {}) {
		super();
		this.innerHTML = "";
		const props_data_attrs = {};
		if (component.props) {
			if ("customElement" in component.props) props_data.customElement = this;
			for (let { name, value } of this.attributes) {
				if (name.endsWith(".json")) {
					name = name.slice(0, -5);
					value = JSON.parse(value);
				}
				if (name !== "class" && name !== "style" && name in component.props) props_data_attrs[name] = value;
			}
		}
		this.app = createApp(component, {
			...props_data_attrs,
			...props_data
		});
	}
	#is_disconnected_in_microtask = false;
	connectedCallback() {
		if (this.#is_disconnected_in_microtask) this.#is_disconnected_in_microtask = false;
		else this.app.mount(this);
	}
	disconnectedCallback() {
		this.#is_disconnected_in_microtask = true;
		queueMicrotask(() => {
			this.#is_disconnected_in_microtask = false;
			if (this.isConnected === false) this.app.unmount();
		});
	}
};
/**
* Defines a custom element.
* @param tag_name Custom element tag name.
* @param VueCustomElementClass Copper component class.
* @param [css] CSS code.
*/
function defineElement(tag_name, VueCustomElementClass, css) {
	const element = document.createElement("style");
	element.dataset.element = tag_name;
	element.textContent = `${tag_name}{display:contents;}`;
	if (typeof css === "string") element.textContent += `\n${css}`;
	document.head.append(element);
	globalThis.customElements.define(tag_name, VueCustomElementClass);
}
//#endregion
export { VueCustomElement, defineElement };
