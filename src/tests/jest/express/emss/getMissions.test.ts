import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Mission_db, Eva_db, Rex_db } from "server/database/models/_allModels";
import MissionFactory from "../../factories/MissionFactory";
import EvaFactory from "../../factories/EVAFactory";
import RexFactory from "tests/jest/factories/RexFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { MissionsWithEvas } from "server/express/routes/emss/getMissions";

let testMissions: Mission_db[];
let testEvas: Eva_db[];
let testRexes: Rex_db[];
const emssToken = process.env.EMSS_TOKEN;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();

  testMissions = await new MissionFactory(em)
    .each((mission, idx) => {
      mission.actionSystemVersion = 2;
      mission.name = `Jest Test Mission ${idx + 1}`;
    })
    .create(2);

  // Create a 3rd mission with actionSystemVersion = 1
  const v1Mission = await new MissionFactory(em)
    .each((mission) => {
      mission.actionSystemVersion = 1;
      mission.name = `Jest Test Mission V1`;
    })
    .create(1);

  testMissions.push(...v1Mission);

  // EVAs for testMissions[0]
  const testEvasWithRexes = await new EvaFactory(em)
    .each((eva, idx) => {
      eva.mission = testMissions[0];
      eva.name = `Jest EVA With Rexes ${idx}`;
    })
    .create(2);
  const testEvasWithoutRexes = await new EvaFactory(em)
    .each((eva, idx) => {
      eva.mission = testMissions[0];
      eva.name = `Jest EVA Without Rexes ${idx}`;
    })
    .create(2);
  // EVA for testMission[2] (V1 mission)
  const testEvaOnV1Missions = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMissions[2];
      eva.name = `Jest EVA on V1 Mission`;
    })
    .create(1);

  testEvas = [...testEvasWithRexes, ...testEvasWithoutRexes, ...testEvaOnV1Missions];

  // Create REXes for two of the EVAs
  testRexes = await new RexFactory(em)
    .each((rex, idx) => {
      rex.mission = testMissions[0];
      rex.evaUuid = testEvasWithRexes[idx].uuid;
      rex.name = `Jest REX-${idx}`;
    })
    .create(2);
});

describe("GET MISSIONS Endpoint", () => {
  describe("Authentication", () => {
    test("Fails without emss-token", async () => {
      const res = await supertest(app).get("/api/v1/emss/getMissions");
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Fails with invalid emss-token", async () => {
      const res = await supertest(app)
        .get("/api/v1/emss/getMissions")
        .set("emss-token", "invalid-token");
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("Missions functionality", () => {
    test("Retrieves all missions", async () => {
      const res = await supertest(app).get("/api/v1/emss/getMissions").set("emss-token", emssToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");

      const missions = res.body.data;
      // v2 missions are included, v1 mission is not
      expect(missions[testMissions[0].id]).toBeDefined();
      expect(missions[testMissions[1].id]).toBeDefined();
      expect(missions[testMissions[2].id]).toBeDefined();
    });

    test("Retrieves only as-planned EVAs", async () => {
      const res = await supertest(app).get("/api/v1/emss/getMissions").set("emss-token", emssToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");

      const missions: MissionsWithEvas = res.body.data;
      expect(missions[testMissions[0].id]).toBeDefined();
      expect(missions[testMissions[0].id].evas).toHaveLength(2);
      const rexEvaUuids = testRexes.map((rex) => rex.evaUuid);
      expect(
        missions[testMissions[0].id].evas.some((eva) => rexEvaUuids.includes(eva.refUuid))
      ).toBe(false); // no rex eva uuids should be included in the results
    });

    test("Returns empty data for mission with no EVAs", async () => {
      const res = await supertest(app).get("/api/v1/emss/getMissions").set("emss-token", emssToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      const missions: MissionsWithEvas = res.body.data;
      expect(missions[testMissions[1].id]).toBeDefined();
      expect(missions[testMissions[1].id].evas).toHaveLength(0); // No evas on this mission
    });

    test("EVAs contains correct structure", async () => {
      const res = await supertest(app).get("/api/v1/emss/getMissions").set("emss-token", emssToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toBe("Missions and their EVAs retrieved");

      const mission1Data = res.body.data[testMissions[0].id];
      const eva = mission1Data.evas[0];

      expect(eva).toHaveProperty("refUuid");
      expect(eva).toHaveProperty("evaName");
    });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (const rex of testRexes) {
    await em.nativeDelete(Rex_db, { uuid: rex.uuid });
  }
  for (const eva of testEvas) {
    await em.nativeDelete(Eva_db, { uuid: eva.uuid });
  }
  for (const mission of testMissions) {
    await em.nativeDelete(Mission_db, { id: mission.id });
  }
  await globalValues.orm.close();
  globalValues.orm = null;
  jest.restoreAllMocks();
});
