import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import {
  User_db,
  Mission_db,
  STM_Objective_db,
  STM_Goal_db,
  STM_Investigation_db,
} from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
import STMObjectiveFactory from "../factories/STMObjectiveFactory";
import STMInvestigationFactory from "../factories/STMInvestigationFactory";
import STMGoalFactory from "../factories/STMGoalFactory";
import { roundDateToSecond } from "utils/formatting";
import supertest from "supertest";
import app from "server/express/restApi";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let stmObjectives: STM_Objective_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestSTM",
    permissionList: [
      {
        missionId: testMissions[0].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[1].id,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });

  //create 2 objectives. each objective has 2 child goals and each child goal has 2 child invstgs
  stmObjectives = await new STMObjectiveFactory(em)
    .each(async (objective) => {
      objective.mission = testMissions[0];
      objective.goals.set(
        await new STMGoalFactory(em)
          .each(async (goal) => {
            goal.objective = objective;
            goal.investigations.set(
              await new STMInvestigationFactory(em)
                .each(async (invstg) => {
                  invstg.goal = goal;
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
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/stm");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id, stmType: "o" });

      expect(res.statusCode).toBe(401);
    });

    test("Insufficient URL parameters", async () => {
      const res = await supertest(app)
        .get("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
    });

    describe("Objectives", () => {
      test("Returns single objective by objective uuid", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[0].id, stmType: "o", o: stmObjectives[0].uuid });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all objectives for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[0].id, stmType: "o" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
      });

      test("Returns no objectives", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[1].id, stmType: "o" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("Goals", () => {
      test("Returns single goal by goal uuid", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({
            missionId: testMissions[0].id,
            stmType: "g",
            g: stmObjectives[0].goals[0].uuid,
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all goals for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[0].id, stmType: "g" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(4);
      });

      test("Returns goals for objective", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[0].id, stmType: "g", o: stmObjectives[0].uuid });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].objectiveUuid).toEqual(stmObjectives[0].uuid);
      });

      test("Returns no goals", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[1].id, stmType: "g" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });

    describe("Investigations", () => {
      test("Returns single investigation by investigation uuid", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({
            missionId: testMissions[0].id,
            stmType: "i",
            i: stmObjectives[0].goals[0].investigations[0].uuid,
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(1);
      });

      test("Returns all investigations for mission", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[0].id, stmType: "i" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(8);
      });

      test("Returns investigations for goals", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({
            missionId: testMissions[0].id,
            stmType: "i",
            g: stmObjectives[0].goals[0].uuid,
          });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].goalUuid).toEqual(stmObjectives[0].goals[0].uuid);
      });

      test("Returns no investigations", async () => {
        const res = await supertest(app)
          .get("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ missionId: testMissions[1].id, stmType: "i" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.length).toEqual(0);
      });
    });
  });

  let newObjective: STMObjective = {
    uuid: null,
    numbering: "1",
    name: "Jest Test STM Objective",
    missionId: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  let newGoal: STMGoal = {
    uuid: null,
    numbering: "a",
    name: "Jest Test STM Goal",
    objectiveUuid: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  let newInvstg: STMInvestigation = {
    uuid: null,
    numbering: "1",
    name: "Jest Test STM Investigation",
    goalUuid: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };

  describe("POST requests", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id, stmType: "o" })
        .send({ ...newObjective, missionId: testMissions[0].id });

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .post("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id, stmType: "o" })
        .send({ ...newObjective, missionId: testMissions[0].id });

      expect(res.statusCode).toBe(401);
    });

    describe("Objective", () => {
      test("Create new objective", async () => {
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "o", missionId: testMissions[0].id })
          .send([{ ...newObjective, missionId: testMissions[0].id }]);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newObjective = { ...upsertedSTM };

        //check if it was added to the db
        const em = getEM();
        const stmReference = await em.findOne(STM_Objective_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a objective", async () => {
        newObjective.name = "Jest Test New Objective Modified";
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "o", missionId: testMissions[0].id })
          .send([newObjective]);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Jest Test New Objective Modified");
      });
    });

    describe("Goal", () => {
      test("Create new goal", async () => {
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "g", missionId: testMissions[0].id })
          .send([{ ...newGoal, objectiveUuid: newObjective.uuid }]);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newGoal = { ...upsertedSTM };

        //check if it was added to the db
        const em = getEM();
        const stmReference = await em.findOne(STM_Goal_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a goal", async () => {
        newGoal.name = "Jest Test New Goal Modified";
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "g", missionId: testMissions[0].id })
          .send([newGoal]);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Jest Test New Goal Modified");
      });
    });

    describe("Investigation", () => {
      test("Create new investigation", async () => {
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "i", missionId: testMissions[0].id })
          .send([{ ...newInvstg, goalUuid: newGoal.uuid }]);

        expect(res.statusCode).toBe(200);
        const upsertedSTM = res.body.data[0];
        expect(upsertedSTM.uuid).not.toBeNull();
        expect(upsertedSTM.createdAt).not.toBeNull();
        expect(upsertedSTM.updatedAt).not.toBeNull();
        newInvstg = { ...upsertedSTM };

        //check if it was added to the db
        const em = getEM();
        const stmReference = await em.findOne(STM_Investigation_db, upsertedSTM.uuid);
        expect(stmReference).not.toBeNull();
      });

      test("Update a investigation", async () => {
        newInvstg.name = "Jest Test New Investigation Modified";
        const res = await supertest(app)
          .post("/api/v1/stm")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .query({ stmType: "i", missionId: testMissions[0].id })
          .send([newInvstg]);

        expect(res.statusCode).toBe(200);
        expect(res.body.data[0]).not.toBeNull();
        expect(res.body.data[0].name).toEqual("Jest Test New Investigation Modified");
      });
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id, stmType: "o" });

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id, stmType: "o" });

      expect(res.statusCode).toBe(401);
    });

    test("Delete a investigation", async () => {
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ stmType: "i", missionId: testMissions[0].id })
        .send([newInvstg.uuid]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });

    test("Delete a goal", async () => {
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ stmType: "g", missionId: testMissions[0].id })
        .send([newGoal.uuid]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });

    test("Delete a objective", async () => {
      const res = await supertest(app)
        .delete("/api/v1/stm")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ stmType: "o", missionId: testMissions[0].id })
        .send([newObjective.uuid]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (const objective of stmObjectives) {
    for (const goal of objective.goals) {
      for (const invstg of goal.investigations) {
        await em.nativeDelete(STM_Investigation_db, { uuid: invstg.uuid });
      }
      await em.nativeDelete(STM_Goal_db, { uuid: goal.uuid });
    }
    await em.nativeDelete(STM_Objective_db, { uuid: objective.uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
