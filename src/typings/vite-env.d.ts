/// <reference types="vite/client" />

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

interface ImportMeta {
  // put all env variables here that vite needs. Example below.
  // readonly VITE_VAR: string;
}
