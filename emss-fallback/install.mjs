/**
 * Install-time wiring for the optional private `@emss/*` packages.
 *
 * Run by `npm run setup:public:packages` and public Docker builds — it is deliberately NOT a
 * lifecycle hook, so ordinary NASA installs never invoke it. It preserves each
 * real registry package and fills missing packages with local stand-ins from
 * `packages/` in `node_modules/@emss/*` so that
 * the bare `@emss/*` import specifiers resolve through normal Node module
 * resolution — no build-tool aliasing required. See emss-fallback/README.md.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubsDir = path.join(__dirname, "packages");
export function installFallbacks(nodeModulesDir = path.resolve(__dirname, "../node_modules")) {
  const emssDir = path.join(nodeModulesDir, "@emss");
  mkdirSync(emssDir, { recursive: true });
  for (const name of readdirSync(stubsDir)) {
    const destination = path.join(emssDir, name);
    const manifest = path.join(destination, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).aegisFallback !== true)
      continue;
    cpSync(path.join(stubsDir, name), destination, { recursive: true });
  }
  console.log("[emss-fallback] Public fallbacks installed; existing registry packages preserved.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installFallbacks();
}
