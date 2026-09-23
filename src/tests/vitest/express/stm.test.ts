import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  App_User_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
} from "server/database/models/_allModels";
import {
  asNobody,
  asUser,
  upsertAppUser,
  upsertMission,
  grantMissionPerms,
} from "../fixtures/access";
import STMLevel1Factory from "../fixtures/entityFactories/STMLevel1Factory";
import STMLevel3Factory from "../fixtures/entityFactories/STMLevel3Factory";
import STMLevel2Factory from "../fixtures/entityFactories/STMLevel2Factory";
import supertest from "supertest";
import app from "server/express/restApi";
import {
  generateBlankStmLvl1,
  generateBlankStmLvl2,
  generateBlankStmLvl3,
} from "store/storeUtils/stm";

let testAppUser: App_User_db;
let stmLevel1s: STM_Level1_db[];
// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1040, 1041, 1042];
const TEST_UUPIC = "vitest-stm";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, TEST_UUPIC, { displayName: "Vitest STM" });
  await grantMissionPerms(em, {
    missionId: testMissionIds[0],
    userId: testAppUser.id,
    permLevel: "edit",
  });
  await grantMissionPerms(em, {
    missionId: testMissionIds[1],
    userId: testAppUser.id,
    permLevel: "viewer",
  });

  //create 2 level1s. each level1 has 2 child level2s and each child level2 has 2 child level3s
  stmLevel1s = await new STMLevel1Factory(em)
    .each(async (level1) => {
      level1.missionId = testMissionIds[0];
      level1.level2s.set(
        await new STMLevel2Factory(em)
          .each(async (level2) => {
            level2.level1 = level1;
            level2.level3s.set(
              await new STMLevel3Factory(em)
                .each(async (level3) => {
                  level3.level2 = level2;
                })
                .create(2)
            );
          })
          .create(2)
      );
    })
    .create(2);
});

describe("STM API Endpoint", () => {
  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/stm").set(asNobody());
    expect(res.statusCode).toBe(401);
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[2], stmType: "l1" });

      expect(res.statusCode).toBe(401);
    });

    test("Insufficient URL parameters", async () => {
      const res = await supertest(app)
        .get("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("error");
    });

    describe("Level1s", () => {
      test("Returns single level1 by level1 uuid", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[0], stmType: "l1", l1: stmLevel1s[0].uuid });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all level1s for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[0], stmType: "l1" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
      });

      test("Returns no level1s", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[1], stmType: "l1" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("Level2s", () => {
      test("Returns single level2 by level2 uuid", async () => {
        const res = await supertest(app).get("/api/v1/stm").set(asUser(TEST_UUPIC)).query({
          missionId: testMissionIds[0],
          stmType: "l2",
          l2: stmLevel1s[0].level2s[0].uuid,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all level2s for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[0], stmType: "l2" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(4);
      });

      test("Returns level2s for level1", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[0], stmType: "l2", l1: stmLevel1s[0].uuid });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].level1Uuid).toEqual(stmLevel1s[0].uuid);
      });

      test("Returns no level2s", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[1], stmType: "l2" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("Level3s", () => {
      test("Returns single level3 by level3 uuid", async () => {
        const res = await supertest(app).get("/api/v1/stm").set(asUser(TEST_UUPIC)).query({
          missionId: testMissionIds[0],
          stmType: "l3",
          l3: stmLevel1s[0].level2s[0].level3s[0].uuid,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all level3s for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[0], stmType: "l3" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(8);
      });

      test("Returns level3s for level2s", async () => {
        const res = await supertest(app).get("/api/v1/stm").set(asUser(TEST_UUPIC)).query({
          missionId: testMissionIds[0],
          stmType: "l3",
          l2: stmLevel1s[0].level2s[0].uuid,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].level2Uuid).toEqual(stmLevel1s[0].level2s[0].uuid);
      });

      test("Returns no level3s", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .query({ missionId: testMissionIds[1], stmType: "l3" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });
  });

  let newLevel1: STMLevel1 = generateBlankStmLvl1({ name: "Vitest STM Level1-1", numbering: "1" });
  let newLevel2: STMLevel2 = generateBlankStmLvl2({ name: "Vitest STM Level2-1", numbering: "a" });
  let newLevel3: STMLevel3 = generateBlankStmLvl3({ name: "Vitest STM Level3-1", numbering: "1" });

  describe("POST requests", () => {
    test("No permissions", async () => {
      const requestBody: STMUpsertRequest = {
        missionId: testMissionIds[1],
        stmObjects: [newLevel1],
        stmType: "Level1",
      };
      const res = await supertest(app)
        .post("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: STMUpsertRequest = {
        missionId: testMissionIds[1],
        stmObjects: [newLevel1],
        stmType: "Level1",
      };
      const res = await supertest(app)
        .post("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty stmObjects array", async () => {
      const requestBody: STMUpsertRequest = {
        missionId: testMissionIds[0],
        stmObjects: [],
        stmType: "Level1",
      };
      const res = await supertest(app)
        .post("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
    });

    describe("Level1", () => {
      test("Create new level1", async () => {
        newLevel1.missionId = testMissionIds[0];
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel1],
          stmType: "Level1",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newLevel1 = { ...upsertedSTM };

        //check if it was added to the db
        const em = globalValues.orm.em.fork();
        const stmReference = await em.findOne(STM_Level1_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a level1", async () => {
        newLevel1.name = "Vitest Test New Level1 Modified";
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel1],
          stmType: "Level1",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Vitest Test New Level1 Modified");
      });
    });

    describe("Level2", () => {
      test("Create new level2", async () => {
        newLevel2.level1Uuid = newLevel1.uuid;
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel2],
          stmType: "Level2",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newLevel2 = { ...upsertedSTM };

        //check if it was added to the db
        const em = globalValues.orm.em.fork();
        const stmReference = await em.findOne(STM_Level2_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a level2", async () => {
        newLevel2.name = "Vitest Test New Level2 Modified";
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel2],
          stmType: "Level2",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Vitest Test New Level2 Modified");
      });
    });

    describe("Level3", () => {
      test("Create new level3", async () => {
        newLevel3.level2Uuid = newLevel2.uuid;
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel3],
          stmType: "Level3",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newLevel3 = { ...upsertedSTM };

        //check if it was added to the db
        const em = globalValues.orm.em.fork();
        const stmReference = await em.findOne(STM_Level3_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a level3", async () => {
        newLevel3.name = "Vitest Test New Level3 Modified";
        const requestBody: STMUpsertRequest = {
          missionId: testMissionIds[0],
          stmObjects: [newLevel3],
          stmType: "Level3",
        };
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set(asUser(TEST_UUPIC))
          .send(requestBody);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Vitest Test New Level3 Modified");
      });
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const exampleUuids = ["test-uuid"];
      const requestBody: STMDeleteRequest = {
        missionId: testMissionIds[2],
        stmType: "Level1",
        uuids: exampleUuids,
      };
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const exampleUuids = ["test-uuid"];
      const requestBody: STMDeleteRequest = {
        missionId: testMissionIds[1],
        stmType: "Level1",
        uuids: exampleUuids,
      };
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a level3", async () => {
      const requestBody: STMDeleteRequest = {
        missionId: testMissionIds[0],
        stmType: "Level3",
        uuids: [newLevel3.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });

    test("Delete a level2", async () => {
      const requestBody: STMDeleteRequest = {
        missionId: testMissionIds[0],
        stmType: "Level2",
        uuids: [newLevel2.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });

    test("Delete a level1", async () => {
      const requestBody: STMDeleteRequest = {
        missionId: testMissionIds[0],
        stmType: "Level1",
        uuids: [newLevel1.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (const level1 of stmLevel1s) {
    for (const level2 of level1.level2s) {
      for (const level3 of level2.level3s) {
        await em.nativeDelete(STM_Level3_db, { uuid: level3.uuid });
      }
      await em.nativeDelete(STM_Level2_db, { uuid: level2.uuid });
    }
    await em.nativeDelete(STM_Level1_db, { uuid: level1.uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
