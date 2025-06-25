import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Eva_db, Rex_db } from "server/database/models/_allModels";
import MissionFactory from "../factories/MissionFactory";
import EvaFactory from "../factories/EVAFactory";
import RexFactory from "../factories/RexFactory";
import supertest from "supertest";
import app from "server/express/restApi";

let testMissions: Mission_db[];
let testEvas: Eva_db[];
let testRexes: Rex_db[];
const emssToken = process.env.EMSS_TOKEN || "test-emss-token";

beforeAll(async () => {
  await getORM();
  const em = getEM();

  testMissions = await new MissionFactory(em).create(1);

  testEvas = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMissions[0];
    })
    .create(2);

  testRexes = await new RexFactory(em)
    .each((rex, idx) => {
      rex.mission = testMissions[0];
      rex.evaUuid = idx < 2 ? testEvas[0].uuid : testEvas[1].uuid;
    })
    .create(3);
});

describe("GET REX BY EVA REF Endpoint", () => {
  describe("Authentication", () => {
    test("fails without emss-token", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getRexesByEvaRef")
        .query({ evaRefUuid: testEvas[0].refUuid });
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("fails with invalid emss-token", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getRexesByEvaRef")
        .query({ evaRefUuid: testEvas[0].refUuid, emssToken: "no-token" });
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("Eva Ref validation", () => {
    test("errors for missing evaRefUuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getRexesByEvaRef")
        .query({ emssToken: emssToken });
      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("No EVA Ref given");
    });
  });

  describe("Eva Ref functionality", () => {
    test("returns empty array for non-existent ref", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getRexesByEvaRef")
        .query({ evaRefUuid: "non-existent-ref", emssToken: emssToken });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toEqual([]);
    });

    test("retrieves rexes for existing ref", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getRexesByEvaRef")
        .query({ evaRefUuid: testEvas[0].refUuid, emssToken: emssToken });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rexes retrieved");
      expect(res.body.data.length).toBe(2);
      const uuids = res.body.data.map((r: { uuid: string }) => r.uuid);
      expect(uuids).toEqual(expect.arrayContaining([testRexes[0].uuid, testRexes[1].uuid]));
    });
  });
});

afterAll(async () => {
  const em = getEM();
  for (const rex of testRexes) {
    await em.nativeDelete(Rex_db, { uuid: rex.uuid });
  }
  for (const eva of testEvas) {
    await em.nativeDelete(Eva_db, { uuid: eva.uuid });
  }
  for (const mission of testMissions) {
    await em.nativeDelete(Mission_db, { id: mission.id });
  }
  await closeORM();
  jest.restoreAllMocks();
});
