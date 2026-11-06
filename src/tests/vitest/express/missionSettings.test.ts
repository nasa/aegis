import express from "express";
import supertest from "supertest";
import { generateBlankMission } from "store/storeUtils/mission";

const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  listings: vi.fn(),
  find: vi.fn(),
  listDems: vi.fn(),
  readDem: vi.fn(),
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.allowed, emssTokenIsValid: vi.fn() }));
vi.mock("server/express/routes/docListing", () => ({ getAutomergeDocListing: mocks.listings }));
vi.mock("server/express/global", () => ({ globalValues: { automergeRepo: { find: mocks.find } } }));
vi.mock("server/raster/missionDems", () => ({
  listMissionDems: mocks.listDems,
  readMissionDem: mocks.readDem,
}));

import router from "server/express/routes/missionAutomerge";
import gridRouter, { getGrid } from "server/express/routes/grid";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {} as typeof req.session;
  next();
});
app.use("/mission", router);
app.use("/grid", gridRouter);
let mission: Mission;
let change: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mission = generateBlankMission({ id: 42 });
  change = vi.fn((update: (draft: Mission) => void) => update(mission));
  mocks.allowed.mockReturnValue(true);
  mocks.listings.mockResolvedValue([{ automergeUrl: "automerge:mission" }]);
  mocks.find.mockResolvedValue({ whenReady: vi.fn(), doc: () => mission, change });
  mocks.listDems.mockResolvedValue([{ filePath: "Data/dem.tif", resolution: 0.5, error: null }]);
  mocks.readDem.mockResolvedValue({ filePath: "Data/dem.tif", resolution: 0.5, error: null });
});

test("lists DEMs only for an authorized mission editor", async () => {
  const response = await supertest(app).get("/mission/dems?missionId=42");
  expect(response.status).toBe(200);
  expect(response.body.data[0].resolution).toBe(0.5);
  mocks.allowed.mockReturnValue(false);
  mocks.listDems.mockClear();
  expect((await supertest(app).get("/mission/dems?missionId=42")).status).toBe(401);
  expect(mocks.listDems).not.toHaveBeenCalled();
});

test("saves detected fractional resolution atomically with the DEM path and clears both", async () => {
  const response = await supertest(app)
    .post("/mission/fields")
    .send({ missionId: 42, fields: { demFilePath: "Data/dem.tif" } });
  expect(response.status).toBe(200);
  expect(mission).toMatchObject({ demFilePath: "Data/dem.tif", demResolution: 0.5 });
  expect(change).toHaveBeenCalledTimes(1);
  mission.landerElevationMeters = 0; // A completed automatic sample at sea level.
  await supertest(app)
    .post("/mission/fields")
    .send({ missionId: 42, fields: { demFilePath: "Data/dem.tif" } });
  expect(mission.landerElevationMeters).toBe(0);
  await supertest(app)
    .post("/mission/fields")
    .send({ missionId: 42, fields: { demFilePath: "" } });
  expect(mission).toMatchObject({ demFilePath: "", demResolution: null });
});

test("a bad DEM leaves the mission untouched", async () => {
  mocks.readDem.mockRejectedValue(new Error("Missing georeferencing"));
  const response = await supertest(app)
    .post("/mission/fields")
    .send({ missionId: 42, fields: { planet: "earth", demFilePath: "Data/bad.tif" } });
  expect(response.status).toBe(400);
  expect(change).not.toHaveBeenCalled();
  expect(mission.planet).toBe("moon");
});

test("LGRS ignores leftover uploaded grids and rejects new grid uploads, while Earth retains its server grid", async () => {
  const definition = { name: "Old grid", fileName: "old.json", numRows: 2, numCols: 2 };
  mission.landerLocation = { lat: -85, lng: 0 };
  mission.serverFileGrid = definition;
  expect(await getGrid(42, false)).toBeNull();
  const response = await supertest(app)
    .post("/grid")
    .send({
      missionId: 42,
      grid: { gridDefinition: definition, coordinates: [] },
      upsertFullGrid: true,
    });
  expect(response.status).toBe(400);
  expect(response.body.message).toContain("dynamic LGRS");
  mission.planet = "earth";
  expect(await getGrid(42, false)).toEqual({ gridDefinition: definition, coordinates: null });
});

test.each([
  { landerElevationMeters: 123 },
  { gridRenderMode: "server-file" },
  { planet: "jupiter" },
  { planetRadius: 1737400 },
  { usingLGRSCoordinates: true },
  { demResolution: 5 },
])("rejects unsupported or derived settings %s", async (fields) => {
  const response = await supertest(app).post("/mission/fields").send({ missionId: 42, fields });
  expect(response.status).toBe(400);
  expect(change).not.toHaveBeenCalled();
});
