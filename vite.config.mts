/// <reference types="vite/client" />
import { UserConfig, defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";
import packageJSON from "./package.json";
import _ from "lodash";

export const config: UserConfig = {
  root: "./src",
  envDir: "../",
  plugins: [react(), svgr()],
  resolve: {
    //alias paths so that the import statements are shorter and start from the src folder
    alias: {
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
    },
  },
  //server configurations for running vite as a server (only happens in local dev). On docker/production, nginx serves the front end
  server: {
    // neither of these proxies are hit when running under docker:dev because nginx intercepts them
    proxy: {
      "/api/v1": {
        target: "http://localhost:4001/",
        changeOrigin: true,
        ws: true,
      },
      "/static": {
        target: "http://localhost:4001/",
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
    rollupOptions: {
      output: {
        // Creates a separate bundles for each of these chunks so there isn't one huge bundle.js file
        manualChunks: {
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
          ],
          leaflet: [
            "leaflet",
            "leaflet-ant-path",
            "leaflet-draggable-lines",
            "leaflet-highlightable-layers",
            "leaflet-polylinedecorator",
            "leaflet.tilelayer.colorfilter",
            "proj4leaflet",
          ],
          emojis: ["@emoji-mart/data", "@emoji-mart/react"],
          fonts: [
            "@fortawesome/fontawesome-svg-core",
            "@fortawesome/free-regular-svg-icons",
            "@fortawesome/free-solid-svg-icons",
            "@fortawesome/react-fontawesome",
          ],
          paper: ["paper"],
        },
      },
      external: ["path", "os", "crypto"],
    },
  },
  // variables that are set at build time
  define: {
    __APP_VERSION__: JSON.stringify(packageJSON.version),
    __GIT_COMMIT__: JSON.stringify(process.env.CI_COMMIT_SHA || "LOCAL_DEV"),
  },
};

// https://vitejs.dev/config/
export default defineConfig(config);
