import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BaseSequencer } from "vitest/node";

const output = path.resolve(process.argv[2] ?? ".local/test-inventory");
mkdirSync(output, { recursive: true });
const run = (cli, args) =>
  execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", maxBuffer: 20e6 });
const playwrightCli = "node_modules/@playwright/test/cli.js";
const vitestCli = "node_modules/vitest/vitest.mjs";
const playwrightConfig = "src/tests/playwright/playwright.config.ts";
const browserConfig = "src/tests/vitest-browser/vitest.config.mts";
const parsePlaywright = (report) => {
  const rows = [];
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests)
          rows.push({
            id: `${test.projectName}:${spec.id}`,
            project: test.projectName,
            file: spec.file,
            title: spec.title,
          });
      }
      visit(suite.suites ?? []);
    }
  };
  visit(report.suites);
  return rows;
};
const pw = (shard) =>
  parsePlaywright(
    JSON.parse(
      run(playwrightCli, [
        "test",
        "--config",
        playwrightConfig,
        "--list",
        "--reporter=json",
        ...(shard ? [`--shard=${shard}/4`] : []),
      ])
    )
  );
const vitestFiles = (config, name, projects = []) => {
  const filename = path.join(output, `${name}-all.json`);
  run(vitestCli, [
    "list",
    "--config",
    config,
    "--filesOnly",
    ...projects.map((project) => `--project=${project}`),
    `--json=${filename}`,
  ]);
  return JSON.parse(readFileSync(filename, "utf8")).map((row) => ({
    ...row,
    id: `${row.projectName}:${row.file}`,
  }));
};
const partition = (all, shards, label) => {
  const selected = shards.flat();
  assert.equal(
    new Set(selected.map((row) => row.id)).size,
    selected.length,
    `${label}: duplicate selection`
  );
  assert.deepEqual(
    selected.map((row) => row.id).sort(),
    all.map((row) => row.id).sort(),
    `${label}: omitted selection`
  );
  return shards.map((rows) => rows.length);
};
const allPlaywright = pw();
const playwrightShards = [1, 2, 3, 4].map((shard) =>
  pw(shard).filter((row) => row.project !== "auth")
);
const allBrowser = vitestFiles(browserConfig, "browser", ["chromium", "chromium-hidpi"]);
const allNode = vitestFiles("src/tests/vitest/vitest.config.mts", "node");
vitestFiles(browserConfig, "parity", ["firefox", "webkit", "firefox-hidpi", "webkit-hidpi"]);
// `vitest list --filesOnly` does not apply --shard; use the runner's sequencer.
const vitestShards = (files, count) =>
  Promise.all(
    Array.from({ length: count }, (_, index) => index + 1).map(async (index) => {
      const sequencer = new BaseSequencer({
        config: { root: process.cwd(), shard: { index, count } },
      });
      return sequencer.shard(files.map((row) => ({ ...row, moduleId: row.file })));
    })
  );
const browserShards = await vitestShards(allBrowser, 6);
const nodeShards = await vitestShards(allNode, 3);
const summary = {
  playwright: Object.fromEntries(
    [...new Set(allPlaywright.map((row) => row.project))].map((project) => [
      project,
      allPlaywright.filter((row) => row.project === project).length,
    ])
  ),
  playwrightShards: partition(
    allPlaywright.filter((row) => row.project !== "auth"),
    playwrightShards,
    "Playwright"
  ),
  browserShards: partition(allBrowser, browserShards, "Vitest Browser"),
  nodeShards: partition(allNode, nodeShards, "Vitest Node"),
};
writeFileSync(path.join(output, "playwright.json"), JSON.stringify(allPlaywright, null, 2));
writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
