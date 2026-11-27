// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestModule, Vitest } from "vitest/node";
import BrowserJUnitReporter from "../../../../.gitlab/scripts/browser-junit-reporter.mjs";
import NodeJUnitReporter from "../../../../.gitlab/scripts/node-junit-reporter.mjs";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aegis-junit-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function moduleFixture(pool: "forks" | "browser", projectName = "", loadError = false): TestModule {
  const tasks: object[] = [];
  const file = {
    type: "suite",
    name: "example.test.ts",
    filepath: path.join(directory, "example.test.ts"),
    pool,
    projectName,
    tasks,
    result: { state: loadError ? "fail" : "pass", duration: 1 },
  };
  if (!loadError)
    file.tasks.push({
      type: "test",
      name: "retains its result",
      mode: "run",
      file,
      annotations: [],
      benchmarks: [],
      result: { state: "pass", duration: 1 },
    });
  return { task: file } as unknown as TestModule;
}

async function report(
  Reporter: typeof BrowserJUnitReporter | typeof NodeJUnitReporter,
  modules: TestModule[],
  errors: Parameters<BrowserJUnitReporter["onTestRunEnd"]>[1] = []
): Promise<string> {
  const filename = path.join(directory, "junit.xml");
  const reporter = new Reporter({ stackTrace: false });
  await reporter.onInit({
    config: { root: directory, outputFile: { junit: filename } },
    logger: { log: vi.fn() },
    getProjectByName: vi.fn(),
  } as unknown as Vitest);
  await reporter.onTestRunEnd(modules, errors);
  return readFile(filename, "utf8");
}

it("merging reports publishes Node cases once and retains unhandled errors", async () => {
  const xml = await report(
    NodeJUnitReporter,
    [moduleFixture("forks"), moduleFixture("browser", "chromium")],
    [{ name: "Error", message: "Merge failure" }]
  );
  expect(xml.match(/<testcase /g)).toHaveLength(2);
  expect(xml.match(/name="retains its result"/g)).toHaveLength(1);
  expect(xml).toContain('<error message="Merge failure"');
  expect(xml).toContain('errors="1"');
});

it("browser reports give identical Firefox and WebKit cases distinct identities", async () => {
  const xml = await report(BrowserJUnitReporter, [
    moduleFixture("browser", "firefox"),
    moduleFixture("browser", "webkit"),
  ]);
  expect(xml.match(/<testcase /g)).toHaveLength(2);
  expect(xml).toContain('classname="firefox:example.test.ts"');
  expect(xml).toContain('classname="webkit:example.test.ts"');
});

it("browser collection failures remain visible when no test task has a file reference", async () => {
  const xml = await report(BrowserJUnitReporter, [moduleFixture("browser", "chromium", true)]);
  expect(xml.match(/<testcase /g)).toHaveLength(1);
  expect(xml).toContain('failures="1"');
  expect(xml).toContain('name="example.test.ts"');
});
