/**
 * Install-time wiring for the optional private `@emss/*` packages.
 *
 * Run by `npm run setup:public` (public build only) — it is deliberately NOT a
 * lifecycle hook, so NASA installs and CI never touch it. If the real `@emss/*`
 * packages are installed (NASA registry access) this does nothing. Otherwise it
 * copies the local stand-ins from `packages/` into `node_modules/@emss/*` so that
 * the bare `@emss/*` import specifiers resolve through normal Node module
 * resolution — no build-tool aliasing required. See emss-fallback/README.md.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubsDir = path.join(__dirname, "packages");
const emssDir = path.resolve(__dirname, "../node_modules/@emss");

const isRealPackagePresent = () => {
  const pkgPath = path.join(emssDir, "utils", "package.json");
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    // Our own stubs carry `aegisFallback: true`; the real registry package does not.
    return JSON.parse(readFileSync(pkgPath, "utf8")).aegisFallback !== true;
  } catch {
    return false;
  }
};

if (isRealPackagePresent()) {
  console.log("[emss-fallback] Real @emss packages detected; using them.");
} else {
  mkdirSync(emssDir, { recursive: true });
  for (const name of readdirSync(stubsDir)) {
    cpSync(path.join(stubsDir, name), path.join(emssDir, name), { recursive: true });
  }
  console.log("[emss-fallback] Installed @emss fallback stubs for public build.");
}
