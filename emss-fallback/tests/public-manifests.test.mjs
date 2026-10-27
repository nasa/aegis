import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicManifests } from "../public-manifests.mjs";
import { installFallbacks } from "../install.mjs";

test("public manifests remove private packages while preserving native optional dependencies and originals", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url)));
  const before = JSON.stringify({ manifest, lock });
  const result = publicManifests(manifest, lock);
  assert.equal(JSON.stringify({ manifest, lock }), before);
  assert.ok(!JSON.stringify(result.lock).includes("/api/v4/projects/685/packages/npm/"));
  for (const [key, value] of Object.entries(lock.packages)) {
    if (key.includes("node_modules/@emss/")) assert.ok(!result.lock.packages[key]);
    else if (key) assert.deepEqual(result.lock.packages[key], value);
  }
  const withOptional = publicManifests(
    { optionalDependencies: { "@emss/private": "1", native: "2" } },
    {
      packages: {
        "": { optionalDependencies: { "@emss/private": "1", native: "2" } },
        "node_modules/native": { optional: true },
      },
    }
  );
  assert.deepEqual(withOptional.manifest.optionalDependencies, { native: "2" });
});

test("fallback installation fills missing packages without overwriting existing registry packages", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "aegis-fallback-test-"));
  t.after(() => {
    const resolved = realpathSync(root);
    assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("aegis-fallback-test-"));
    rmSync(resolved, { recursive: true, force: true });
  });
  const utils = path.join(root, "@emss", "utils");
  mkdirSync(utils, { recursive: true });
  writeFileSync(
    path.join(utils, "package.json"),
    JSON.stringify({ name: "@emss/utils", version: "1.0.0" })
  );
  writeFileSync(path.join(utils, "index.js"), "registry-package");
  installFallbacks(root);
  installFallbacks(root);
  assert.equal(readFileSync(path.join(utils, "index.js"), "utf8"), "registry-package");
  assert.equal(
    JSON.parse(readFileSync(path.join(root, "@emss", "oauth2-proxy-backend", "package.json")))
      .aegisFallback,
    true
  );
});
