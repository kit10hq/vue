import { UserConfig } from "vite";

//#region node_modules/@kit10/vite/dist/main.d.mts
//#region src/build/options.d.ts
type Promisable<T> = T | Promise<T>;
type VitePlugin = Exclude<UserConfig["plugins"], undefined>[number];
type Kit10Plugin = {
  kit10: true;
  htmlPreprocessor?: {
    filter: RegExp;
    transform: (path: string) => Promisable<string>;
  };
  vitePlugins?: VitePlugin[];
};
//#endregion
//#region src/plugin/main.d.ts
declare const vuePlugin: Kit10Plugin;
//#endregion
export { vuePlugin };