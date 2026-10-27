import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installFallbacks } from "./install.mjs";
import { publicManifests } from "./public-manifests.mjs";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const local = path.join(root, ".local");
mkdirSync(local, { recursive: true });
const withinRoot = (target) => {
  if (!target.startsWith(root + path.sep))
    throw new Error("Public package installation must stay within the repository");
  return target;
};
withinRoot(realpathSync(local));
const staging = withinRoot(mkdtempSync(path.join(local, "public-install-")));
const modules = withinRoot(path.join(root, "node_modules"));
const backup = withinRoot(path.join(staging, "previous-node_modules"));
let movedPrevious = false;
let installed = false;

function npm(args) {
  const useCli = Boolean(process.env.npm_execpath);
  const executable = useCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = useCli ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: staging,
    stdio: "inherit",
    shell: !useCli && process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Public npm installation failed (${result.status ?? result.signal})`);
}

try {
  const files = publicManifests(
    JSON.parse(readFileSync(path.join(root, "package.json"))),
    JSON.parse(readFileSync(path.join(root, "package-lock.json")))
  );
  writeFileSync(path.join(staging, "package.json"), JSON.stringify(files.manifest, null, 2));
  writeFileSync(path.join(staging, "package-lock.json"), JSON.stringify(files.lock, null, 2));
  npm(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]);
  npm(["ci", "--include=dev", "--include=optional", "--no-audit", "--no-fund"]);
  installFallbacks(path.join(staging, "node_modules"));
  // Stage the complete tree before replacing existing dependencies; manifests stay untouched.
  let hasModules = existsSync(modules);
  if (!hasModules) {
    try {
      hasModules = lstatSync(modules).isSymbolicLink();
    } catch {}
  }
  if (hasModules) {
    renameSync(modules, backup);
    movedPrevious = true;
  }
  renameSync(path.join(staging, "node_modules"), modules);
  installed = true;
  console.log(
    "Installed public tooling and @emss fallbacks; package.json and package-lock.json preserved."
  );
} finally {
  if (movedPrevious && !installed) renameSync(backup, modules);
  try {
    rmSync(withinRoot(staging), { recursive: true, force: true });
  } catch {
    console.warn(`Installation cleanup could not remove ${staging}`);
  }
}
