/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

interface ImportMeta {
  // put all env variables here that vite needs. Example below.
  // readonly VITE_VAR: string;
}
