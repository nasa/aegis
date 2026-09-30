/// <reference types="vite/client" />
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { UserConfig, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";
import { fileURLToPath } from "url";
import packageJSON from "./package.json" with { type: "json" };
import wasm from "vite-plugin-wasm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const aliases = {
  components: path.resolve(__dirname, "./src/components"),
  "http-client": path.resolve(__dirname, "./src/http-client"),
  pages: path.resolve(__dirname, "./src/pages"),
  store: path.resolve(__dirname, "./src/store"),
  styles: path.resolve(__dirname, "./src/styles"),
  tests: path.resolve(__dirname, "./src/tests"),
  typings: path.resolve(__dirname, "./src/typings"),
  utils: path.resolve(__dirname, "./src/utils"),
  packages: path.resolve(__dirname, "./src/packages"),
  assets: path.resolve(__dirname, "./src/assets"),
  public: path.resolve(__dirname, "./src/public"),
  server: path.resolve(__dirname, "./src/server"),
  client: path.resolve(__dirname, "./src/client"),
  operations: path.resolve(__dirname, "./src/operations"),
};

export const config: UserConfig = {
  root: "./src",
  envDir: "../",
  cacheDir: "../node_modules/.vite",
  plugins: [react(), svgr(), wasm()],
  resolve: {
    //alias paths so that the import statements are shorter and start from the src folder
    alias: aliases,
  },
  // Server configurations for running vite as a server (only happens in local dev). On docker/production, nginx serves the front end
  server: {
    // None of these proxies are hit when running under docker:dev because nginx intercepts them
    // Targets must NOT have a trailing slash: http-proxy-middleware appends the request URL to
    // target, so a trailing-slash target produces a double-slash path that
    // won't match the server's strict URL check for the automerge upgrade.
    proxy: {
      "/api/v1": {
        target: "http://localhost:4001",
        changeOrigin: true,
        ws: true,
      },
      "/api/automergeSocket": {
        target: "http://localhost:4001",
        changeOrigin: true,
        ws: true,
      },
      "/api/socket": {
        target: "http://localhost:4001",
        changeOrigin: true,
        ws: true,
      },
      "/static": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
    },
    watch: {
      // During development, ignore these folders for hot reloading
      ignored: ["**/node_modules/**", "**/.local/**", "**/public/**", "**/static/**"],
    },
    host: "0.0.0.0", // all hosts
    port: 4000,
  },
  build: {
    outDir: "../.local/vite/dist",
    assetsDir: "assets",
    sourcemap: true,
    manifest: true,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Creates separate bundles for each group so there isn't one huge bundle.js file
        manualChunks(id) {
          const chunkGroups: Record<string, string[]> = {
            react: [
              "react",
              "react-dom",
              "react-redux",
              "react-router",
              "react-checkbox-tree",
              "@uiw/react-color-compact",
              "react-cookie",
              "react-drag-listview",
              "react-final-form",
              "@reduxjs/toolkit",
              "@fortawesome/react-fontawesome", // needs to be here to prevent circular chunking issues
            ],
            emojis: ["@emoji-mart/data", "@emoji-mart/react"],
            fonts: [
              "@fortawesome/fontawesome-svg-core",
              "@fortawesome/free-regular-svg-icons",
              "@fortawesome/free-solid-svg-icons",
            ],
            paper: ["paper"],
            automerge: [
              "@automerge/automerge",
              "@automerge/automerge-repo",
              "@automerge/automerge-repo-network-websocket",
              "@automerge/automerge-repo-react-hooks",
            ],
          };
          for (const [chunkName, packages] of Object.entries(chunkGroups)) {
            if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
              return chunkName;
            }
          }
        },
      },
      external: ["path", "os", "crypto"],
    },
  },
  // build time variables
  define: {
    __APP_VERSION__: JSON.stringify(packageJSON.version),
    // In the pipeline, GIT_COMMIT will be populated when the ci job passes it in MAP_ENV_VARS_TO_BUILD_ARGS
    //   to give it to kaniko docker to use during build. However when running this locally
    //   with NO docker container, we need to set a default value of "localDev"
    __GIT_COMMIT__: JSON.stringify(process.env.GIT_COMMIT || "localDev"),
  },
};

// https://vitejs.dev/config/
export default defineConfig(config);
