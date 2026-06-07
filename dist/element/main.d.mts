import { App } from "vue";

//#region src/element/main.d.ts
interface Component {
  name: string;
  props: Record<string, unknown> | undefined;
}
declare class VueCustomElement extends HTMLElement {
  #private;
  app: App<Element>;
  constructor(component: Component, props_data?: Record<string, unknown>);
  connectedCallback(): void;
  disconnectedCallback(): void;
}
/**
* Defines a custom element.
* @param tag_name Custom element tag name.
* @param VueCustomElementClass Copper component class.
* @param [css] CSS code.
*/
declare function defineElement(tag_name: string, VueCustomElementClass: typeof VueCustomElement, css?: string): void;
/**
* Adds CSS styles for a custom element.
* @param name Custom element tag name.
* @param css CSS code.
* @param is_custom_element Custom element tag name to use in the selector.
*/
declare function addStyles(name: string, css: string | undefined, is_custom_element?: boolean): void;
//#endregion
export { VueCustomElement, addStyles, defineElement };