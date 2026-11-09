import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "flatted";

const directory = path.resolve(process.argv[2] ?? ".local/migration");
const layout = JSON.parse(readFileSync(path.join(directory, "layout/summary.json"), "utf8"));
const shardCounts = { node: layout.nodeShards.length, browser: layout.browserShards.length };
const coveredLines = (filename) => {
  const coverage = JSON.parse(readFileSync(filename, "utf8"));
  return new Set(
    Object.entries(coverage).flatMap(([file, data]) =>
      Object.entries(data.s)
        .filter(([, hits]) => hits > 0)
        .map(
          ([statement]) =>
            `${file.replaceAll("\\", "/")}:${data.statementMap[statement].start.line}`
        )
    )
  );
};
const merged = coveredLines(path.join(directory, "coverage-merged/coverage-final.json"));
const blobs = [];
const executedFiles = { node: new Set(), browser: new Set(), parity: new Set() };
const expectedCases = new Map();
const collect = (files, runner, report) => {
  const cases = expectedCases.get(report) ?? new Set();
  for (const file of files) {
    const identity = `${file.projectName ?? ""}:${file.filepath.replaceAll("\\", "/")}`;
    assert.ok(!executedFiles[runner].has(identity), `Duplicate executed file: ${identity}`);
    executedFiles[runner].add(identity);
    const visit = (tasks) => {
      for (const task of tasks) {
        if (task.type === "suite") visit(task.tasks);
        else
          cases.add(
            `${runner === "node" ? "" : `${file.projectName}:`}${file.name}:${task.fullTestName}`
          );
      }
    };
    visit(file.tasks);
  }
  expectedCases.set(report, cases);
};
let union = new Set();
for (const runner of ["node", "browser"]) {
  for (let shard = 1; shard <= shardCounts[runner]; shard++) {
    const blob = path.join(directory, `blobs/blob-${runner}-${shard}-${shardCounts[runner]}.json`);
    assert.ok(statSync(blob).size > 0, `Missing or empty blob: ${blob}`);
    const [version, files, errors, coverage] = parse(readFileSync(blob, "utf8"));
    assert.ok(version && coverage, `${blob}: missing version or embedded coverage`);
    assert.deepEqual(errors, [], `${blob}: unhandled test errors`);
    assert.ok(
      files.every((file) => file.result?.state === "pass"),
      `${blob}: incomplete or failed file`
    );
    collect(files, runner, runner === "node" ? "node" : `browser-${shard}`);
    const lines = coveredLines(
      path.join(directory, `coverage-${runner}-${shard}/coverage-final.json`)
    );
    assert.equal(
      [...lines].filter((line) => !merged.has(line)).length,
      0,
      `${blob}: covered lines lost in merge`
    );
    union = union.union(lines);
    blobs.push({ runner, shard, bytes: statSync(blob).size, coveredLines: lines.size });
  }
}
const [, parityFiles, parityErrors] = parse(
  readFileSync(path.join(directory, "parity-blob.json"), "utf8")
);
assert.deepEqual(parityErrors, [], "Unhandled parity errors");
assert.ok(
  parityFiles.every((file) => file.result?.state === "pass"),
  "Incomplete parity file"
);
collect(parityFiles, "parity", "parity");
for (const runner of ["node", "browser", "parity"]) {
  const expectedFiles = JSON.parse(
    readFileSync(path.join(directory, `layout/${runner}-all.json`), "utf8")
  ).map((file) => `${file.projectName ?? ""}:${file.file.replaceAll("\\", "/")}`);
  assert.deepEqual(
    [...executedFiles[runner]].sort(),
    expectedFiles.sort(),
    `${runner}: shard execution omitted files`
  );
}
assert.deepEqual(merged, union, "Merged coverage differs from the union of every shard");
const identities = new Set();
const reports = [];
const decodeXml = (value) =>
  value.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (_, numeric, named) =>
    numeric
      ? String.fromCodePoint(
          Number.parseInt(numeric.replace(/^x/i, ""), /^x/i.test(numeric) ? 16 : 10)
        )
      : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named]
  );
for (const name of [
  "node",
  ...Array.from({ length: shardCounts.browser }, (_, index) => `browser-${index + 1}`),
  "parity",
]) {
  const xml = readFileSync(path.join(directory, `junit-${name}.xml`), "utf8");
  const cases = [...xml.matchAll(/<testcase\s+([^>]+)>/g)];
  assert.ok(cases.length > 0, `${name}: empty JUnit report`);
  assert.doesNotMatch(xml, /<(?:failure|error)(?:\s|>)/, `${name}: failing JUnit report`);
  assert.doesNotMatch(xml, /<skipped(?:\s|\/?>)/, `${name}: skipped JUnit test`);
  const actualCases = new Set();
  for (const [, attributes] of cases) {
    const classname = attributes.match(/classname="([^"]+)"/)?.[1];
    const title = attributes.match(/(?:^|\s)name="([^"]+)"/)?.[1];
    assert.ok(classname && title, `${name}: missing testcase identity`);
    if (name !== "node")
      assert.match(
        classname,
        /^(?:chromium|firefox|webkit)(?:-hidpi)?:/,
        `${name}: missing browser identity`
      );
    const identity = `${decodeXml(classname)}:${decodeXml(title)}`;
    assert.ok(!identities.has(identity), `Duplicate JUnit testcase: ${identity}`);
    identities.add(identity);
    actualCases.add(identity);
  }
  assert.deepEqual(actualCases, expectedCases.get(name), `${name}: JUnit lost executed testcases`);
  reports.push({ name, tests: cases.length });
}
const sourceFile = (filename) =>
  path.resolve(decodeXml(filename).replaceAll("\\", "/")).replaceAll("\\", "/");
const lcovLines = new Set();
let lcovFile;
for (const line of readFileSync(path.join(directory, "coverage-merged/lcov.info"), "utf8").split(
  /\r?\n/
)) {
  if (line.startsWith("SF:")) lcovFile = sourceFile(line.slice(3));
  if (line.startsWith("DA:")) {
    const [number, hits] = line.slice(3).split(",").map(Number);
    if (hits > 0) lcovLines.add(`${lcovFile}:${number}`);
  }
}
const coberturaLines = new Set();
const cobertura = readFileSync(
  path.join(directory, "coverage-merged/cobertura-coverage.xml"),
  "utf8"
);
for (const [, filename, body] of cobertura.matchAll(
  /<class\s[^>]*filename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g
)) {
  const classLines = body.replace(/<methods>[\s\S]*?<\/methods>/g, "");
  for (const [, attributes] of classLines.matchAll(/<line\s+([^>]+)>/g)) {
    const number = attributes.match(/number="(\d+)"/)?.[1];
    const hits = Number(attributes.match(/hits="(\d+)"/)?.[1]);
    if (hits > 0) coberturaLines.add(`${sourceFile(filename)}:${number}`);
  }
}
assert.deepEqual(lcovLines, merged, "LCOV lost merged covered lines");
assert.deepEqual(coberturaLines, merged, "Cobertura lost merged covered lines");
const result = {
  blobs,
  browserFileProjects: executedFiles.browser.size,
  nodeFiles: executedFiles.node.size,
  parityFileProjects: executedFiles.parity.size,
  coveredLines: union.size,
  lcovCoveredLines: lcovLines.size,
  coberturaCoveredLines: coberturaLines.size,
  reports,
  uniqueTestcases: identities.size,
};
writeFileSync(path.join(directory, "artifact-integrity.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
