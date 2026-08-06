import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Doc_Listing_db } from "server/database/models/_allModels";
import DocListingFactory from "../../../fixtures/entityFactories/DocListingFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { createMockAutomergeRepo } from "../../../helpers/mockAutomergeRepo";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import type { AutomergeUrl } from "@automerge/automerge-repo";

let testAutomergeDocListings: Doc_Listing_db[];
let testMissionsPartial: Partial<Mission>[];
let testEvas: Eva[];
let testRexes: Rex[];
const emssToken = process.env.EMSS_TOKEN;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  testAutomergeDocListings = await new DocListingFactory(em)
    .each((record) => {
      record.automergeUrl = `automerge:VitestTestMissionGetRexesByEvaRefV2`;
    })
    .create(1);

  // Build 3 EVAs (1 as-planned, 2 executed rex-evas) all sharing a refUuid.
  // Build 2 rexes linked to the first 2 EVAs (the as-planned + one rex-eva).
  const sharedRefUuid = "some-ref-uuid";
  testEvas = [
    generateBlankEVA({ name: "Vitest as-planned", refUuid: sharedRefUuid }),
    generateBlankEVA({ name: "Vitest rex-eva-0", refUuid: sharedRefUuid }),
    generateBlankEVA({ name: "Vitest rex-eva-1", refUuid: sharedRefUuid }),
  ];
  testRexes = [
    generateBlankRex({ name: "Vitest Rex-0", evaUuid: testEvas[0].uuid }),
    generateBlankRex({ name: "Vitest Rex-1", evaUuid: testEvas[1].uuid }),
  ];

  const evasRecord: Record<string, Eva> = {};
  for (const e of testEvas) evasRecord[e.uuid] = e;
  const rexesRecord: Record<string, Rex> = {};
  for (const r of testRexes) rexesRecord[r.uuid] = r;

  testMissionsPartial = [
    {
      id: testAutomergeDocListings[0].missionId,
      name: "Vitest Test Mission GetRexesByEvaRef V2",
      isArchived: false,
      evas: evasRecord,
      rexes: rexesRecord,
    },
  ];

  globalValues.automergeRepo = createMockAutomergeRepo(testMissionsPartial);
});

describe("GET REX BY EVA REF Endpoint (Maegistro V2)", () => {
  describe("Authentication", () => {
    test("Fails without emss-token", async () => {
      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .query({ evaRefUuid: testEvas[0].refUuid });
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Fails with invalid emss-token", async () => {
      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .set("emss-token", "invalid-token")
        .query({ evaRefUuid: testEvas[0].refUuid });
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("Eva Ref validation", () => {
    test("Errors for missing evaRefUuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .set("emss-token", emssToken);
      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("No EVA Ref given");
    });
  });

  describe("Eva Ref functionality", () => {
    test("Returns empty array for non-existent ref", async () => {
      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .set("emss-token", emssToken)
        .query({ evaRefUuid: "non-existent-ref" });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toEqual([]);
    });

    test("Retrieves rexes for existing ref", async () => {
      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .set("emss-token", emssToken)
        .query({ evaRefUuid: testEvas[0].refUuid });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rexes retrieved");
      expect(res.body.data.length).toBe(2);
      const uuids = res.body.data.map((r: { uuid: string }) => r.uuid);
      expect(uuids).toEqual(expect.arrayContaining([testRexes[0].uuid, testRexes[1].uuid]));
    });

    test("Does not retrieve rex if it has a maestroEventId", async () => {
      // Mutate one rex directly on the mock automerge doc.
      const docHandle = await globalValues.automergeRepo.find(
        testAutomergeDocListings[0].automergeUrl as AutomergeUrl
      );
      docHandle.change((m: Mission) => {
        m.rexes[testRexes[0].uuid].maestroEventId = "some-event-uuid";
      });

      const res = await supertest(app)
        .get("/api/v1/maestro/v2/getRexesByEvaRef")
        .set("emss-token", emssToken)
        .query({ evaRefUuid: testEvas[0].refUuid });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rexes retrieved");
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].uuid).toBe(testRexes[1].uuid);
    });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testAutomergeDocListings.length; i++) {
    await em.nativeDelete(Doc_Listing_db, { missionId: testAutomergeDocListings[i].missionId });
  }
  await globalValues.orm.close();
  globalValues.orm = null;
  vi.restoreAllMocks();
});
