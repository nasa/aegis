import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import prettier from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const docs = path.join(root, "docs/testing");
const args = new Set(process.argv.slice(2));
const minimumArgs = [...args].filter((arg) => arg.startsWith("--minimum="));
assert(minimumArgs.length <= 1, "Choose one minimum scenario percentage");
const minimum = minimumArgs.length ? Number(minimumArgs[0].slice("--minimum=".length)) : null;
assert(
  minimum === null ||
    (minimumArgs[0].slice("--minimum=".length).trim() !== "" &&
      Number.isFinite(minimum) &&
      minimum >= 0 &&
      minimum <= 100),
  "Minimum scenario percentage must be a number between 0 and 100"
);
for (const arg of args) {
  assert(
    ["--write", "--check", "--require-complete"].includes(arg) || minimumArgs.includes(arg),
    `Unknown option: ${arg}`
  );
}
assert(!(args.has("--write") && args.has("--check")), "Choose --write or --check");
const catalog = JSON.parse(fs.readFileSync(path.join(docs, "scenario-catalog.json"), "utf8"));
const normalize = (value) => value.replaceAll("\\", "/");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => {
  assert(typeof file === "string" && !path.isAbsolute(file) && !file.split("/").includes(".."));
  assert(fs.existsSync(path.join(root, file)), `Missing evidence source: ${file}`);
};
const nonempty = (value, label) => assert(typeof value === "string" && value.trim(), label);
const tree = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const visit = (node, callback) => {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
};

// Test discovery expands parameterized cases without starting the application or database.
const discovery = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config=src/tests/playwright/playwright.config.ts",
      "--list",
      "--reporter=json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  )
);
assert(!discovery.errors?.length, JSON.stringify(discovery.errors));
const discovered = [];
function collect(suite, parents = []) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      discovered.push({
        file: normalize(spec.file),
        title: spec.title,
        suite: parents.join(" > "),
        line: spec.line,
        project: test.projectName,
        expectedStatus: test.expectedStatus,
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, [...parents, child.title]);
}
collect(discovery);
const chromium = discovered.filter((test) => test.project === "chromium");
assert(chromium.length > 0, "Chromium discovery must not be empty");
const key = (test) => JSON.stringify([test.file, test.title]);
const testIndex = new Map();
for (const test of chromium) {
  assert(!testIndex.has(key(test)), `Ambiguous test identity: ${key(test)}`);
  testIndex.set(key(test), test);
}

assert(catalog.schemaVersion === 1, "Unsupported scenario schema");
nonempty(catalog.scope, "Inventory scope is required");
assert(/^\d{4}-\d{2}-\d{2}$/.test(catalog.reviewDate), "Review date is required");
assert(Array.isArray(catalog.areas) && catalog.areas.length, "Areas must not be empty");
const areaIds = new Set();
const scenarioIds = new Set();
const associations = new Map();
for (const area of catalog.areas) {
  assert(/^[a-z]+$/.test(area.id) && !areaIds.has(area.id), `Invalid/duplicate area ${area.id}`);
  areaIds.add(area.id);
  for (const field of ["name", "fixture"]) nonempty(area[field], `${area.id}: ${field} required`);
  assert(Array.isArray(area.sources) && area.sources.length, `${area.id}: sources required`);
  assert(Array.isArray(area.supporting), `${area.id}: supporting evidence must be an array`);
  [...area.sources, ...area.supporting].forEach(exists);
  assert(area.scenarios.length, `${area.id}: scenarios required`);
  for (const scenario of area.scenarios) {
    assert(
      new RegExp(`^${area.id.toUpperCase()}-\\d{3}$`).test(scenario.id) &&
        !scenarioIds.has(scenario.id),
      `Invalid/duplicate scenario ${scenario.id}`
    );
    scenarioIds.add(scenario.id);
    for (const field of ["title", "action", "expected"]) {
      nonempty(scenario[field], `${scenario.id}: ${field} required`);
    }
    if (scenario.fixture !== undefined) nonempty(scenario.fixture, `${scenario.id}: empty fixture`);
    assert(["P0", "P1", "P2"].includes(scenario.priority), `${scenario.id}: invalid priority`);
    assert(
      ["mapped", "partial", "gap", "external"].includes(scenario.automation),
      `${scenario.id}: invalid automation status`
    );
    assert(Array.isArray(scenario.tests), `${scenario.id}: test references must be an array`);
    const hasTests = ["mapped", "partial"].includes(scenario.automation);
    assert(hasTests === scenario.tests.length > 0, `${scenario.id}: status/evidence mismatch`);
    if (["partial", "external"].includes(scenario.automation)) {
      nonempty(scenario.note, `${scenario.id}: evidence boundary is required`);
    }
    assert(scenario.automation !== "external" || area.id === "ops", "Only operations are external");
    const refs = new Set();
    for (const ref of scenario.tests) {
      assert(!refs.has(key(ref)), `${scenario.id}: duplicate test reference`);
      refs.add(key(ref));
      const test = testIndex.get(key(ref));
      assert(test, `${scenario.id}: test was renamed, removed or excluded: ${key(ref)}`);
      if (scenario.automation === "mapped") {
        assert(
          test.expectedStatus === "passed",
          `${scenario.id}: mapped test is skipped/fixme/fail`
        );
      }
      const entries = associations.get(key(ref)) ?? [];
      entries.push(scenario);
      associations.set(key(ref), entries);
    }
  }
}

const surfaces = [];
function surface(kind, name, file, node, ast, area) {
  assert(areaIds.has(area), `Unassigned ${kind} surface: ${name} (${file})`);
  surfaces.push({
    kind,
    name,
    file,
    line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
    area,
  });
}
const assignments = catalog.surfaceAssignments;
const appFile = "src/App.tsx";
const appTree = tree(appFile);
visit(appTree, (node) => {
  if (ts.isJsxAttribute(node) && node.name.getText(appTree) === "path") {
    const name = literal(node.initializer);
    assert(name !== null, "Dynamic UI route requires explicit inventory support");
    surface("UI route", name, appFile, node, appTree, assignments.uiRoutes[name]);
  }
});
const paneFile = "src/components/interface/_paneTypes.ts";
const paneTree = tree(paneFile);
visit(paneTree, (node) => {
  if (
    ts.isPropertyAssignment(node) &&
    ts.isObjectLiteralExpression(node.initializer) &&
    node.initializer.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) && property.name.getText(paneTree) === "leftPane"
    )
  ) {
    const name = node.name.getText(paneTree);
    surface("Mission pane", name, paneFile, node, paneTree, assignments.panes[name]);
  }
});

const httpMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
const restFile = "src/server/express/restApi.ts";
const restTree = tree(restFile);
const imports = new Map();
for (const node of restTree.statements) {
  if (ts.isImportDeclaration(node) && node.importClause?.name) {
    imports.set(node.importClause.name.text, literal(node.moduleSpecifier));
  }
}
function routes(file, mount, object) {
  const ast = tree(file);
  visit(ast, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const expression = node.expression;
    if (expression.expression.getText(ast) !== object || !httpMethods.has(expression.name.text))
      return;
    const route = literal(node.arguments[0]);
    assert(route !== null, `${file}: nonliteral route requires explicit inventory support`);
    const name = `${expression.name.text.toUpperCase()} ${(mount + route).replace(/\/+/g, "/")}`;
    surface("HTTP", name, file, node, ast, assignments.httpSources[file]);
  });
}
routes(restFile, "", "app");
visit(restTree, (node) => {
  if (!ts.isCallExpression(node) || node.expression.getText(restTree) !== "app.use") return;
  const mount = literal(node.arguments[0]);
  const handler = node.arguments[1]?.getText(restTree);
  if (mount === null || !imports.has(handler)) return;
  const source = imports.get(handler);
  assert(source.startsWith("."), `Unsupported route import ${source}`);
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(restFile), `${source}.ts`));
  routes(file, mount, "router");
});
for (const [kind, mapping] of [
  ["UI route", assignments.uiRoutes],
  ["Mission pane", assignments.panes],
]) {
  for (const name of Object.keys(mapping)) {
    assert(
      surfaces.some((entry) => entry.kind === kind && entry.name === name),
      `Stale ${kind}: ${name}`
    );
  }
}
for (const file of Object.keys(assignments.httpSources)) {
  assert(
    surfaces.some((entry) => entry.kind === "HTTP" && entry.file === file),
    `Stale HTTP source: ${file}`
  );
}
const surfaceKeys = surfaces.map((entry) => `${entry.kind}:${entry.name}`);
assert(new Set(surfaceKeys).size === surfaces.length, "Duplicate registered surface");

const all = catalog.areas.flatMap((area) => area.scenarios);
function counts(scenarios) {
  const tally = Object.fromEntries(
    ["mapped", "partial", "gap", "external"].map((status) => [
      status,
      scenarios.filter((s) => s.automation === status).length,
    ])
  );
  const eligible = scenarios.length - tally.external;
  return {
    total: scenarios.length,
    eligible,
    ...tally,
    percent: eligible ? Number(((100 * tally.mapped) / eligible).toFixed(1)) : null,
  };
}
const summary = {
  schemaVersion: 1,
  reviewDate: catalog.reviewDate,
  measurement:
    "Reviewed scenario-to-test mapping in Chromium; not executed pass rate or code coverage",
  executionEvidence: "No browser tests executed by this report",
  overall: counts(all),
  critical: counts(all.filter((scenario) => scenario.priority === "P0")),
  areas: catalog.areas.map((area) => ({ id: area.id, name: area.name, ...counts(area.scenarios) })),
  registeredSurfaces: Object.fromEntries(
    ["UI route", "Mission pane", "HTTP"].map((kind) => [
      kind,
      surfaces.filter((surface) => surface.kind === kind).length,
    ])
  ),
  discoveredProjects: Object.fromEntries(
    [...new Set(discovered.map((test) => test.project))].map((project) => [
      project,
      discovered.filter((test) => test.project === project).length,
    ])
  ),
};
const escape = (value) => String(value).replaceAll("|", "&#124;").replaceAll("\n", " ");
const sourceLink = (file, line, prefix = "../../../") =>
  `[${file}${line ? `:${line}` : ""}](${prefix}${file}${line ? `#L${line}` : ""})`;
const percentage = (tally) =>
  tally.percent === null ? "—" : `${tally.mapped}/${tally.eligible} (${tally.percent}%)`;
const statusLabels = { mapped: "Mapped", partial: "Partial", gap: "Gap", external: "External" };
const artifacts = new Map();
for (const area of catalog.areas) {
  const lines = [
    `# ${area.name}`,
    "",
    "Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.",
    "",
    `Fixture: ${area.fixture}`,
    "",
    `Source: ${area.sources.map((file) => sourceLink(file)).join(", ")}.`,
    "",
    `Scenario mapping: **${percentage(counts(area.scenarios))}**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.`,
    "",
  ];
  if (area.supporting.length) {
    lines.push(
      `Supporting unit/component evidence (no Playwright scenario credit): ${area.supporting.map((file) => sourceLink(file)).join(", ")}.`,
      ""
    );
  }
  for (const scenario of area.scenarios) {
    lines.push(
      `## ${scenario.id}: ${scenario.title}`,
      "",
      `**${scenario.priority} · ${statusLabels[scenario.automation]}**`,
      "",
      ...(scenario.fixture ? [`Fixture: ${scenario.fixture}`, ""] : []),
      `Action: ${scenario.action}`,
      "",
      `Expected: ${scenario.expected}`,
      ""
    );
    for (const ref of scenario.tests) {
      const test = testIndex.get(key(ref));
      const projects = discovered
        .filter((entry) => key(entry) === key(ref))
        .map((entry) => entry.project);
      lines.push(
        `Playwright: ${sourceLink(`src/tests/playwright/${ref.file}`, test.line)} — ${ref.title} (${projects.join(", ")}).`,
        ""
      );
    }
    if (scenario.note) lines.push(`Evidence boundary: ${scenario.note}`, "");
  }
  artifacts.set(`scenarios/${area.id}.md`, lines.join("\n"));
}
const lines = [
  "# Playwright scenario coverage report",
  "",
  "Generated by `npm run docs:playwright-scenarios` from the reviewed [scenario catalog](scenario-catalog.json), actual Playwright test discovery, and current TypeScript route/pane registrations.",
  "",
  `Scenario review date: **${catalog.reviewDate}**. Rebuilding refreshes discovery and links, not the semantic review date.`,
  "",
  `**Playwright scenario mapping: ${percentage(summary.overall)}. Critical (P0): ${percentage(summary.critical)}.**`,
  "",
  `The ${all.length}-scenario inventory has ${summary.overall.mapped} mapped, ${summary.overall.partial} partial, ${summary.overall.gap} gap and ${summary.overall.external} external scenarios. Partial mappings receive zero credit. External operational drills stay visible but are outside the ${summary.overall.eligible}-scenario Playwright denominator.`,
  "",
  "**Full Playwright scenario coverage has not been established.** This report performs discovery only. It supplies no executed pass/fail, retry or flakiness evidence. All configured projects must actually run before claiming browser acceptance. A mapped row is a human-reviewed claim about assertions; discovery validates its reference, not its semantic sufficiency.",
  "",
  "| Area | Mapped / eligible | Partial | Gap | External |",
  "| --- | --- | --- | --- | --- |",
];
for (const area of summary.areas) {
  lines.push(
    `| [${area.name}](scenarios/${area.id}.md) | ${percentage(area)} | ${area.partial} | ${area.gap} | ${area.external} |`
  );
}
lines.push(
  "",
  "## Registered surface accounting",
  "",
  `All ${surfaces.length} discovered registrations have an assigned scenario area: ${Object.entries(
    summary.registeredSurfaces
  )
    .map(([kind, count]) => `${count} ${kind}`)
    .join(
      ", "
    )}. This is 100% **registration accounting**, with no scenario pass credit. HTTP routes are grouped by their mounted handler source. A new route in an existing handler joins its area's review queue; it does not create or cover a semantic scenario automatically.`,
  "",
  "The scanner reads JSX route paths, objects with a leftPane property, and literal app/router HTTP method registrations mounted by restApi. Middleware, static assets, socket events, unmounted/dead code, dynamic routing and operational commands need the separate family review in the catalog. New unsupported dynamic method paths fail the scan. The diagnostic map sandbox is classified under operations.",
  "",
  "| Kind | Registration | Scenario area | Source |",
  "| --- | --- | --- | --- |"
);
for (const entry of surfaces) {
  lines.push(
    `| ${entry.kind} | ${escape(entry.name)} | [${entry.area}](scenarios/${entry.area}.md) | ${sourceLink(entry.file, entry.line, "../../")} |`
  );
}
lines.push(
  "",
  "## Discovered test accounting",
  "",
  `${Object.entries(summary.discoveredProjects)
    .map(([project, count]) => `${project}: ${count}`)
    .join(
      "; "
    )}. Browser repeats and authentication setup do not inflate scenario coverage. The table below lists Chromium cases once; Firefox/WebKit currently run only the smoke suite.`,
  "",
  "Every discovered case is listed, including legacy smoke checks that only assert presence/no errors or conditionally bypass work. An unassigned supporting test earns no scenario credit. Assign a complete bounded scenario only after reviewing its actual assertions and fixture; never promote it because its name sounds relevant.",
  "",
  "| Test | Scenario mapping | Source |",
  "| --- | --- | --- |"
);
for (const test of chromium) {
  const scenarios = associations.get(key(test)) ?? [];
  const mapping = scenarios.length
    ? scenarios
        .map(
          (scenario) =>
            `[${scenario.id} (${statusLabels[scenario.automation]})](scenarios/${scenario.id.split("-")[0].toLowerCase()}.md#${`${scenario.id}: ${scenario.title}`
              .toLowerCase()
              .replace(/[^\p{L}\p{N}\s_-]/gu, "")
              .replaceAll(" ", "-")})`
        )
        .join(", ")
    : "Supporting only; no complete scenario assigned";
  lines.push(
    `| ${escape(test.title)} | ${mapping} | ${sourceLink(`src/tests/playwright/${test.file}`, test.line, "../../")} |`
  );
}
lines.push(
  "",
  "## Closure criteria",
  "",
  "`npm run test:playwright:scenarios:90` validates generated documentation and requires at least 90% of eligible scenarios to be fully mapped. The threshold uses exact counts before rounding; partial scenarios receive no credit. This mapping gate does not execute browser tests.",
  "",
  "`npm run test:playwright:scenarios:complete` fails while any eligible scenario is partial or a gap. Run it before MR acceptance; the normal report/check commands allow accurately documented gaps. This mapping check is not currently wired into CI and does not execute browsers. When the MR is ready to merge, manually trigger `test-playwright:start` for the latest commit and require all eight CI shards to pass. A duplicate full local browser run is optional.",
  "",
  "For acceptance, close each scenario with explicit fixture/action/expected assertions, demonstrate defect detection, run all required projects against the reviewed commit, record configuration and results, and complete the external operational drills separately. A green mapping gate alone does not establish runtime acceptance or exhaust all possible states.",
  ""
);
artifacts.set("coverage.md", lines.join("\n"));
artifacts.set("coverage-summary.json", JSON.stringify(summary, null, 2) + "\n");
const config = await prettier.resolveConfig(path.join(root, ".prettierrc.json"));
const stale = [];
for (const [file, content] of artifacts) {
  const destination = path.join(docs, file);
  const formatted = await prettier.format(content, { ...config, filepath: destination });
  if (args.has("--write")) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, formatted);
  } else if (args.has("--check")) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== formatted)
      stale.push(file);
  }
}
console.log(
  `Playwright scenarios: ${percentage(summary.overall)}; P0: ${percentage(summary.critical)}`
);
console.log(
  `Partial: ${summary.overall.partial}; gaps: ${summary.overall.gap}; external: ${summary.overall.external}`
);
console.log(
  `Registered surfaces assigned: ${surfaces.length}/${surfaces.length}; browser tests executed: 0`
);
if (stale.length) {
  console.error(
    `Stale generated documentation: ${stale.join(", ")}. Run npm run docs:playwright-scenarios.`
  );
  process.exitCode = 1;
}
if (args.has("--require-complete") && summary.overall.mapped !== summary.overall.eligible) {
  console.error(
    "Scenario completeness gate failed: every eligible scenario needs a complete reviewed test mapping."
  );
  process.exitCode = 1;
}
if (minimum !== null && 100 * summary.overall.mapped < minimum * summary.overall.eligible) {
  console.error(`Scenario coverage gate failed: at least ${minimum}% must be fully mapped.`);
  process.exitCode = 1;
}
