import express from "express";
import supertest from "supertest";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

vi.mock("utils/loadEnv", () => ({}));

const { getFileById, makeRequest } = vi.hoisted(() => ({
  getFileById: vi.fn(),
  makeRequest: vi.fn(),
}));

vi.mock("server/file/boxClient", () => ({
  createBoxClient: () => ({
    withTimeouts() {
      return this;
    },
    files: { getFileById },
    networkSession: { baseUrls: { baseUrl: "https://box.invalid" } },
    makeRequest,
  }),
}));

let staticDirectory: string;
let missionDirectory: string;
let app: express.Express;

beforeAll(async () => {
  staticDirectory = fs.mkdtempSync(path.join(process.cwd(), ".local/aegis-box-route-"));
  vi.stubEnv("STATIC_DIR", path.relative(process.cwd(), staticDirectory));
  missionDirectory = path.join(staticDirectory, "missionFiles/1000");
  vi.resetModules();
  const { default: router } = await import("server/express/routes/file/boxDownloadFile");
  app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { session: { appUser: { isSuperAdmin: true } as AppUser } });
    next();
  });
  app.use(router);
});

beforeEach(() => {
  fs.rmSync(missionDirectory, { recursive: true, force: true });
  fs.mkdirSync(missionDirectory, { recursive: true });
  getFileById.mockReset().mockResolvedValue({ name: "download.txt", size: 8 });
  makeRequest.mockReset().mockImplementation(async () => ({
    status: 200,
    headers: {},
    content: Readable.from([Buffer.from("download")]),
  }));
});

afterAll(() => {
  fs.rmSync(staticDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("downloads to the mission root with a relative STATIC_DIR", async () => {
  const response = await supertest(app)
    .get("/")
    .query({ missionId: 1000, itemId: "file", path: "missionFiles/1000" });

  expect(response.text).toContain('"status":"success"');
  expect(fs.readFileSync(path.join(missionDirectory, "download.txt"), "utf8")).toBe("download");
  expect(fs.readdirSync(missionDirectory)).toEqual(["download.txt"]);
});

test("a duplicate destination preserves its file and partial download", async () => {
  fs.writeFileSync(path.join(missionDirectory, "download.txt"), "existing");
  fs.writeFileSync(path.join(missionDirectory, "download.txt.part"), "existing partial");

  const response = await supertest(app)
    .get("/")
    .query({ missionId: 1000, itemId: "file", path: "missionFiles/1000" });

  expect(response.text).toContain('"status":"error"');
  expect(fs.readFileSync(path.join(missionDirectory, "download.txt"), "utf8")).toBe("existing");
  expect(fs.readFileSync(path.join(missionDirectory, "download.txt.part"), "utf8")).toBe(
    "existing partial"
  );
  expect(fs.readdirSync(missionDirectory).sort()).toEqual(["download.txt", "download.txt.part"]);
});

test("staging a download for a subfolder preserves the same filename at the mission root", async () => {
  fs.writeFileSync(path.join(missionDirectory, "download.txt"), "root asset");

  const response = await supertest(app)
    .get("/")
    .query({ missionId: 1000, itemId: "file", path: "missionFiles/1000/subfolder" });

  expect(response.text).toContain('"status":"success"');
  expect(fs.readFileSync(path.join(missionDirectory, "download.txt"), "utf8")).toBe("root asset");
  expect(fs.readFileSync(path.join(missionDirectory, "subfolder/download.txt"), "utf8")).toBe(
    "download"
  );
  expect(fs.readdirSync(missionDirectory).sort()).toEqual(["download.txt", "subfolder"]);
});

test("rejects another mission's destination before contacting Box", async () => {
  const response = await supertest(app)
    .get("/")
    .query({ missionId: 1000, itemId: "file", path: "missionFiles/1001" });

  expect(response.status).toBe(500);
  expect(getFileById).not.toHaveBeenCalled();
  expect(fs.readdirSync(missionDirectory)).toEqual([]);
});
