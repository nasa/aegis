/**
 * `postinstall` check that the private `@emss/*` packages actually installed.
 *
 * They are `optionalDependencies` so the public build can omit them, but npm
 * silently skips an optional package it fails to fetch (no VPN, bad registry
 * credentials). Without this check that only surfaces later as an import error.
 * Skipped when optional deps are omitted on purpose (`npm run setup:public`).
 * See emss-fallback/README.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const omitted = (process.env.npm_config_omit ?? "").split(/[\s,]+/);

if (!omitted.includes("optional")) {
  const { optionalDependencies = {} } = JSON.parse(
    readFileSync(path.join(rootDir, "package.json"), "utf8")
  );
  const missing = Object.keys(optionalDependencies).filter(
    (name) =>
      name.startsWith("@emss/") &&
      !existsSync(path.join(rootDir, "node_modules", name, "package.json"))
  );

  if (missing.length > 0) {
    console.error(`
[emss-check] Failed to install private packages: ${missing.join(", ")}

npm skips optional packages it cannot download, so the install above "succeeded"
without them. Check that you can reach the eegitlab @emss registry (NASA network/VPN)
and that your registry credentials are valid, then run "npm i" again. Run
"npm i --loglevel=verbose" to see the download error.

Outside NASA, use "npm run setup:public" instead to install the local stand-ins.
`);
    process.exit(1);
  }
}
