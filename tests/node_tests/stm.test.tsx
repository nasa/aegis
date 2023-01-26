import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "../../pages/api/users/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleSTM from "../../pages/api/stm";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Mission as Mission_db } from "../../server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { STM_Objective as STM_Objective_db } from "../../server/database/models/stm_objective.model";
import { STM_Goal as STM_Goal_db } from "../../server/database/models/stm_goal.model";
import { STM_Investigation as STM_Investigation_db } from "../../server/database/models/stm_investigation.model";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
import STMObjectiveFactory from "../factories/STMObjectiveFactory";
import STMInvestigationFactory from "../factories/STMInvestigationFactory";
import STMGoalFactory from "../factories/STMGoalFactory";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let stmObjectives: STM_Objective_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  //create 2 objectives. each objective has 2 child goals and each child goal has 2 child invstgs
  stmObjectives = await new STMObjectiveFactory(em)
    .each(async (objective) => {
      objective.mission = testMission;
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
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleSTM(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: "testAdmin", password: "superSecretPassword" },
    });
    await Login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  describe("GET requests", () => {
    test("Insufficient URL parameters", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(500);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("error");
    });

    test("Returns single objective Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "o", o: stmObjectives[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns single goal Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "g", g: stmObjectives[0].goals[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns single investigation Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: {
          missionId: testMission.id,
          stmType: "i",
          i: stmObjectives[0].goals[0].investigations[0].uuid,
        },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns all objectives Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(2);
    });

    test("Returns all goals Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "g" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(4);
    });

    test("Returns goals for objective Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "g", o: stmObjectives[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(2);
      expect(wrappedResponse.data[0].objectiveUuid).toEqual(stmObjectives[0].uuid);
    });

    test("Returns all investigations Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "i" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(8);
    });

    test("Returns investigations for goals Json", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMission.id, stmType: "i", g: stmObjectives[0].goals[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(2);
      expect(wrappedResponse.data[0].goalUuid).toEqual(stmObjectives[0].goals[0].uuid);
    });

    test("Fails to find objectives", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: "99999", stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });

    test("Fails to find goals", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: "99999", stmType: "g" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });

    test("Fails to find investigations", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: "99999", stmType: "i" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });
  });

  describe("POST and DELETE requests", () => {
    let newObjective: STMObjective = {
      uuid: null,
      numbering: "1",
      name: "Jest Test STM Objective",
      missionId: null,
    };
    let newGoal: STMGoal = {
      uuid: null,
      numbering: "a",
      name: "Jest Test STM Goal",
      objectiveUuid: null,
    };
    let newInvstg: STMInvestigation = {
      uuid: null,
      numbering: "1",
      name: "Jest Test STM Investigation",
      goalUuid: null,
    };

    //upsert and delete tests must occur in order
    test("Create new objective", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newObjective, missionId: testMission.id },
        query: { stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM.uuid).not.toBeNull();
      expect(upsertedSTM.createdAt).not.toBeNull();
      expect(upsertedSTM.updatedAt).not.toBeNull();
      newObjective = { ...upsertedSTM };

      //check if it was added to the db
      const em = getEM();
      const stmReference = await em.findOne(STM_Objective_db, upsertedSTM.uuid);
      expect(stmReference).not.toBeNull();
    });

    test("Create new goal", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newGoal, objectiveUuid: newObjective.uuid },
        query: { stmType: "g" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM.uuid).not.toBeNull();
      expect(upsertedSTM.createdAt).not.toBeNull();
      expect(upsertedSTM.updatedAt).not.toBeNull();
      newGoal = { ...upsertedSTM };

      //check if it was added to the db
      const em = getEM();
      const stmReference = await em.findOne(STM_Goal_db, upsertedSTM.uuid);
      expect(stmReference).not.toBeNull();
    });

    test("Create new investigation", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newInvstg, goalUuid: newGoal.uuid },
        query: { stmType: "i" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM.uuid).not.toBeNull();
      expect(upsertedSTM.createdAt).not.toBeNull();
      expect(upsertedSTM.updatedAt).not.toBeNull();
      newInvstg = { ...upsertedSTM };

      //check if it was added to the db
      const em = getEM();
      const stmReference = await em.findOne(STM_Investigation_db, upsertedSTM.uuid);
      expect(stmReference).not.toBeNull();
    });

    test("Update a objective", async () => {
      newObjective.name = "Jest Test New Objective Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        query: { stmType: "o" },
        body: newObjective,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM).not.toBeNull();
      expect(upsertedSTM.name).toEqual("Jest Test New Objective Modified");
    });

    test("Update a goal", async () => {
      newGoal.name = "Jest Test New Goal Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        query: { stmType: "g" },
        body: newGoal,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM).not.toBeNull();
      expect(upsertedSTM.name).toEqual("Jest Test New Goal Modified");
    });

    test("Update a investigation", async () => {
      newInvstg.name = "Jest Test New Investigation Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        query: { stmType: "i" },
        body: newInvstg,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSTM = res._getJSONData().data;
      expect(upsertedSTM).not.toBeNull();
      expect(upsertedSTM.name).toEqual("Jest Test New Investigation Modified");
    });

    test("Delete a investigation", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { stmType: "i", i: `${newInvstg.uuid}` },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
    });

    test("Delete a goal", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { stmType: "g", g: `${newGoal.uuid}` },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
    });

    test("Delete a objective", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { stmType: "o", o: `${newObjective.uuid}` },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
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
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();
});
