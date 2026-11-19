import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Doc_Listing_db } from "server/database/models/_allModels";
import DocListingFactory from "../../../fixtures/entityFactories/DocListingFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { createMockAutomergeRepo } from "../../../helpers/mockAutomergeRepo";
import { seedMissionCatalog } from "../../../helpers/seedMissionCatalog";
import type { DustMissionListItem } from "server/dust/v1/types/socketioDust";

let testAutomergeDocListings: Doc_Listing_db[];
let testMissionsPartial: Partial<Mission>[];
const dustToken = process.env.DUST_TOKEN;
const emssToken = process.env.EMSS_TOKEN;
const route = "/api/v1/dust/v1/getMissions";
const missionNames = ["Vitest Test Mission Dust V1 Active", "Vitest Test Mission Dust V1 Archived"];

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  // The mock repo keys each mission doc by its name with the spaces removed.
  testAutomergeDocListings = await new DocListingFactory(em)
    .each((record, index) => {
      record.automergeUrl = `automerge:${missionNames[index].replace(/\s+/g, "")}`;
    })
    .create(2);

  testMissionsPartial = [
    {
      id: testAutomergeDocListings[0].missionId,
      name: missionNames[0],
      archivedAt: null,
      evas: {},
      rexes: {},
    },
    {
      id: testAutomergeDocListings[1].missionId,
      name: missionNames[1],
      archivedAt: Date.now(),
      evas: {},
      rexes: {},
    },
  ];

  globalValues.automergeRepo = createMockAutomergeRepo(testMissionsPartial);
  await seedMissionCatalog(testAutomergeDocListings);
});

describe("GET MISSIONS Endpoint (DUST V1)", () => {
  describe("Authentication", () => {
    test("Fails without a token", async () => {
      const res = await supertest(app).get(route);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ status: "failure", message: "Unauthorized" });
    });

    test("Fails with an invalid dust-token", async () => {
      const res = await supertest(app).get(route).set("dust-token", "invalid-token");
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
    });

    test("Succeeds with the emss-token master key", async () => {
      const res = await supertest(app).get(route).set("emss-token", emssToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });

  describe("Missions functionality", () => {
    test("Lists active missions with their id and name", async () => {
      const res = await supertest(app).get(route).set("dust-token", dustToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Missions retrieved");

      const missions: DustMissionListItem[] = res.body.data;
      expect(missions).toContainEqual({
        missionId: testMissionsPartial[0].id,
        missionName: "Vitest Test Mission Dust V1 Active",
      });
    });

    test("Excludes archived missions", async () => {
      const res = await supertest(app).get(route).set("dust-token", dustToken);
      const missions: DustMissionListItem[] = res.body.data;
      expect(missions.some((m) => m.missionId === testMissionsPartial[1].id)).toBe(false);
    });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (const listing of testAutomergeDocListings) {
    await em.nativeDelete(Doc_Listing_db, { missionId: listing.missionId });
  }
  await globalValues.orm.close();
  globalValues.orm = null;
  vi.restoreAllMocks();
});
