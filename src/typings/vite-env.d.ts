/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_QUICKMAP_BASE_URL?: string;
  readonly VITE_QUICKMAP_LAYER_IDS?: string;
  readonly VITE_QUICKMAP_RESOLUTION_METERS_PER_PIXEL?: string;
}
