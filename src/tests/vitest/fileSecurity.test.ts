import fs from "node:fs";
import path from "node:path";
import type * as FileModule from "server/file/file";

vi.mock("utils/loadEnv", () => ({}));

let staticDirectory: string;
let files: typeof FileModule;

beforeAll(async () => {
  staticDirectory = fs.mkdtempSync(path.join(process.cwd(), ".local/aegis-file-security-"));
  vi.stubEnv("STATIC_DIR", staticDirectory);
  vi.resetModules();
  files = await import("server/file/file");
});

beforeEach(() => {
  fs.rmSync(path.join(staticDirectory, "missionFiles"), { recursive: true, force: true });
  fs.mkdirSync(path.join(staticDirectory, "missionFiles/1000"), { recursive: true });
  fs.writeFileSync(path.join(staticDirectory, "missionFiles/1000/original.txt"), "source");
});

afterAll(() => {
  fs.rmSync(staticDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test.each(["missionFiles/1000/../1001", "missionFiles/1000/../../other"])(
  "mission paths reject traversal: %s",
  (relative) => {
    expect(() => files.assertMissionFilePath(1000, relative)).toThrow();
  }
);

test("mission paths reject symbolic-link ancestors even when the final file is missing", () => {
  const outside = path.join(staticDirectory, "outside");
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(staticDirectory, "missionFiles/1000/link"), "junction");

  expect(() => files.assertMissionFilePath(1000, "missionFiles/1000/link/new.txt")).toThrow(
    "symbolic links"
  );
});

test("a failed mission copy removes its partial target without changing source assets", async () => {
  const outside = path.join(staticDirectory, "outside");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "external.txt"), "external");
  fs.symlinkSync(outside, path.join(staticDirectory, "missionFiles/1000/link"), "junction");

  await expect(files.copyDirectoryContents(1000, 1001)).rejects.toThrow("symbolic links");
  expect(fs.existsSync(path.join(staticDirectory, "missionFiles/1001"))).toBe(false);
  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1000/original.txt"), "utf8")
  ).toBe("source");
  expect(fs.readFileSync(path.join(outside, "external.txt"), "utf8")).toBe("external");
});

test("a mission copy preserves an existing destination", async () => {
  fs.mkdirSync(path.join(staticDirectory, "missionFiles/1001"));
  fs.writeFileSync(path.join(staticDirectory, "missionFiles/1001/existing.txt"), "existing");

  await expect(files.copyDirectoryContents(1000, 1001)).rejects.toThrow("must be new");
  expect(fs.readdirSync(path.join(staticDirectory, "missionFiles/1001"))).toEqual(["existing.txt"]);
  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1001/existing.txt"), "utf8")
  ).toBe("existing");
});

test("a mission copy preserves nested files and empty directories", async () => {
  fs.mkdirSync(path.join(staticDirectory, "missionFiles/1000/nested/empty"), { recursive: true });
  fs.writeFileSync(path.join(staticDirectory, "missionFiles/1000/nested/asset.txt"), "asset");

  await files.copyDirectoryContents(1000, 1001);

  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1001/original.txt"), "utf8")
  ).toBe("source");
  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1001/nested/asset.txt"), "utf8")
  ).toBe("asset");
  expect(fs.readdirSync(path.join(staticDirectory, "missionFiles/1001/nested/empty"))).toEqual([]);
  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1000/nested/asset.txt"), "utf8")
  ).toBe("asset");
});

test("a mission cannot be copied over itself", async () => {
  await expect(files.copyDirectoryContents(1000, 1000)).rejects.toThrow("must be new");
  expect(
    fs.readFileSync(path.join(staticDirectory, "missionFiles/1000/original.txt"), "utf8")
  ).toBe("source");
});
