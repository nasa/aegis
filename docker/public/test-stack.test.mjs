import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { isolatedArgs, isolatedEnvironment, validateTestMounts } from "./test-stack.mjs";

test("browser checks use a separate origin and named static volume without changing demo settings", () => {
  const original = {
    STATIC_DIR: "../real-assets",
    PUBLIC_ORIGIN: "https://localhost:8443",
    PUBLIC_DB_PASSWORD: "secret",
  };
  const result = isolatedEnvironment(original, 54321);
  assert.equal(result.STATIC_DIR, "public-test-static");
  assert.equal(result.PUBLIC_ORIGIN, "https://localhost:54321");
  assert.equal(result.PUBLIC_BIND, "127.0.0.1");
  assert.equal(result.PUBLIC_DEMO_SEED, "true");
  assert.equal(result.PUBLIC_DB_PASSWORD, "secret");
  assert.equal(original.STATIC_DIR, "../real-assets");
});

test("disposable cleanup is pinned to test projects and refuses the live demo", () => {
  const root = path.resolve("repo with spaces");
  assert.throws(() => isolatedArgs(root, "aegis-public", ["down", "--volumes"]));
  const args = isolatedArgs(root, "aegis-public-check-123-deadbeef", ["down", "--volumes"]);
  assert.ok(args.includes(path.join(root, "docker/public/test-compose.yml")));
  assert.ok(args.includes("aegis-public-check-123-deadbeef"));
  assert.deepEqual(args.slice(-2), ["down", "--volumes"]);
});

test("test startup refuses host asset mounts, shared volumes, and external volumes", () => {
  const project = "aegis-public-check-123-deadbeef";
  const valid = {
    volumes: { data: { name: `${project}_data` } },
    services: { api: { volumes: [{ type: "volume", source: "data", target: "/static" }] } },
  };
  validateTestMounts(valid, project);
  assert.throws(() =>
    validateTestMounts(
      { ...valid, services: { api: { volumes: [{ type: "bind", source: "../aegis_static" }] } } },
      project
    )
  );
  assert.throws(() =>
    validateTestMounts({ ...valid, volumes: { data: { name: "aegis-public_data" } } }, project)
  );
  assert.throws(() =>
    validateTestMounts(
      { ...valid, volumes: { data: { name: `${project}_data`, external: true } } },
      project
    )
  );
});
