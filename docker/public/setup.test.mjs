import assert from "node:assert/strict";
import { test } from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setupPublic, projectRoot } from "./setup.mjs";
import { composeArgs } from "./compose.mjs";

function fixture(t) {
  const sandbox = mkdtempSync(path.join(tmpdir(), "aegis-public-setup-"));
  const root = path.join(sandbox, "repo");
  mkdirSync(root);
  writeFileSync(
    path.join(root, ".env.public.template"),
    readFileSync(path.join(projectRoot, ".env.public.template"), "utf8").replace(
      "STATIC_DIR=../aegis_static",
      "STATIC_DIR=./assets"
    )
  );
  t.after(() => {
    const resolved = realpathSync(sandbox);
    assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith("aegis-public-setup-"));
    rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}

test("public setup creates secrets and GIS directories, preserves settings on repeat", (t) => {
  const root = fixture(t);
  const first = setupPublic(root, () => {}, {});
  assert.equal(first.PUBLIC_ORIGIN, "https://localhost:8443");
  for (const key of ["PUBLIC_DB_PASSWORD", "PUBLIC_COOKIE_SECRET", "PUBLIC_EMSS_TOKEN"])
    assert.match(first[key], /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.PUBLIC_DB_PASSWORD, first.PUBLIC_COOKIE_SECRET);
  assert.ok(existsSync(path.join(root, "assets", "missionFiles")));
  assert.ok(!existsSync(path.join(root, ".env")));
  const before = readFileSync(path.join(root, ".env.public"), "utf8");
  const second = setupPublic(root, () => {}, {});
  assert.deepEqual(second, first);
  assert.equal(readFileSync(path.join(root, ".env.public"), "utf8"), before);
});

test("public setup validates missing secrets and incompatible origins without rewriting settings", (t) => {
  const root = fixture(t);
  setupPublic(root, () => {}, {});
  const before = readFileSync(path.join(root, ".env.public"), "utf8");
  for (const environment of [
    { PUBLIC_COOKIE_SECRET: "" },
    { PUBLIC_COOKIE_SECRET: "short" },
    { PUBLIC_ORIGIN: "http://localhost:8443" },
    { PUBLIC_ORIGIN: "https://localhost:8443/" },
    { PUBLIC_PORT: "9999" },
    { PUBLIC_HOST: "other.test" },
  ])
    assert.throws(() => setupPublic(root, () => {}, environment));
  assert.equal(readFileSync(path.join(root, ".env.public"), "utf8"), before);
});

test("public Compose pins its project, file and env, preserving literal forwarded arguments", () => {
  const root = path.resolve("repo with spaces");
  const args = composeArgs(root, ["exec", "apiv1", "node", "-e", "console.log('hello world')"]);
  assert.deepEqual(args.slice(0, 7), [
    "compose",
    "--project-directory",
    root,
    "--env-file",
    path.join(root, ".env.public"),
    "-f",
    path.join(root, "docker-compose.public.yml"),
  ]);
  assert.deepEqual(args.slice(7), ["exec", "apiv1", "node", "-e", "console.log('hello world')"]);
});
