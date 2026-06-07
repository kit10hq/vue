import { Plugin } from "vite";

//#region node_modules/@kit10/vite/dist/main.d.mts
type Kit10Plugin = {
  kit10: true;
  htmlPreprocessors?: unknown[];
  vitePlugins?: Plugin[];
};
//#endregion
//#region src/plugin/main.d.ts
declare const vuePlugin: Kit10Plugin;
//#endregion
export { vuePlugin };