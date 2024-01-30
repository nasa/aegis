// extends vite.config.ts

import { config } from "./vite.config.mts";
import { defineConfig } from "vite";

export default defineConfig({
  ...config,
  // use polling when running in local docker dev environment because iNotify is broken between windows and WSL2
  server: { ...config.server, watch: { ...config.server?.watch, usePolling: true } },
});
