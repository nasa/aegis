import express from "express";
import supertest from "supertest";
import { generateBlankMission } from "store/storeUtils/mission";

const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  listings: vi.fn(),
  find: vi.fn(),
  listDems: vi.fn(),
  readDem: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.allowed, emssTokenIsValid: vi.fn() }));
vi.mock("server/express/routes/docListing", () => ({ getAutomergeDocListing: mocks.listings }));
vi.mock("server/express/global", () => ({
  globalValues: { automergeRepo: { find: mocks.find, flush: mocks.flush } },
}));
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

test.each([
  { planet: "moon" as Planet, lat: -85 },
  { planet: "moon" as Planet, lat: -80 },
  { planet: "moon" as Planet, lat: 0 },
  { planet: "moon" as Planet, lat: 85 },
  { planet: "moon" as Planet, lat: null },
  { planet: "mars" as Planet, lat: -85 },
])("ignores uploaded grids and rejects uploads outside Earth: %s", async ({ planet, lat }) => {
  const definition = { name: "Old grid", fileName: "old.json", numRows: 2, numCols: 2 };
  mission.planet = planet;
  mission.landerLocation = { lat, lng: 0 };
  mission.serverFileGrid = definition;
  expect(await getGrid(42, true)).toBeNull();
  const closest = await supertest(app).get(
    '/grid/closestPoint?missionId=42&radius=100&points=[{"lat":0,"lng":0}]'
  );
  expect(closest.status).toBe(200);
  expect(closest.body.data).toEqual([]);
  const response = await supertest(app)
    .post("/grid")
    .send({
      missionId: 42,
      grid: { gridDefinition: definition, coordinates: [] },
      upsertFullGrid: true,
    });
  expect(response.status).toBe(400);
  expect(response.body.message).toContain("only for Earth missions");
  expect(change).not.toHaveBeenCalled();
  expect(mocks.flush).not.toHaveBeenCalled();
  mission.planet = "earth";
  expect(await getGrid(42, false)).toEqual({ gridDefinition: definition, coordinates: null });
});

test("Earth missions can save uploaded grid metadata", async () => {
  mission.planet = "earth";
  const grid: MissionGrid = {
    gridDefinition: { name: "Earth grid", fileName: "earth.json", numRows: 2, numCols: 2 },
    coordinates: null,
  };
  const response = await supertest(app)
    .post("/grid")
    .send({ missionId: 42, grid, upsertFullGrid: false });
  expect(response.status).toBe(200);
  expect(mission.serverFileGrid).toEqual(grid.gridDefinition);
  expect(mocks.flush).toHaveBeenCalledOnce();
});

test.each(["moon", "mars"] as Planet[])(
  "changing an Earth mission to %s clears its uploaded grid",
  async (planet) => {
    mission.planet = "earth";
    mission.landerLocation = { lat: 0, lng: 0 };
    mission.serverFileGrid = { name: "Earth grid", fileName: "earth.json", numRows: 2, numCols: 2 };
    const response = await supertest(app)
      .post("/mission/fields")
      .send({ missionId: 42, fields: { planet } });
    expect(response.status).toBe(200);
    expect(mission.serverFileGrid).toBeNull();
  }
);

test.each([
  { landerElevationMeters: 123 },
  { gridRenderMode: "server-file" },
  { gridSystem: "earth-wgs84" },
  { earthGridLabelScheme: "invalid" },
  { planet: "jupiter" },
  { planetRadius: 1737400 },
  { usingLGRSCoordinates: true },
  { demResolution: 5 },
])("rejects unsupported or derived settings %s", async (fields) => {
  const response = await supertest(app).post("/mission/fields").send({ missionId: 42, fields });
  expect(response.status).toBe(400);
  expect(change).not.toHaveBeenCalled();
});

test("updates Earth label preferences through the supported API", async () => {
  mission.planet = "earth";
  const response = await supertest(app)
    .post("/mission/fields")
    .send({ missionId: 42, fields: { earthGridLabelScheme: "mgrs" } });
  expect(response.status).toBe(200);
  expect(mission.earthGridLabelScheme).toBe("mgrs");
});
