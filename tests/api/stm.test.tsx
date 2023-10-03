import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "pages/api/auth/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleSTM from "pages/api/stm";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { STM_Objective as STM_Objective_db } from "server/database/models/stm_objective.model";
import { STM_Goal as STM_Goal_db } from "server/database/models/stm_goal.model";
import { STM_Investigation as STM_Investigation_db } from "server/database/models/stm_investigation.model";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
import STMObjectiveFactory from "../factories/STMObjectiveFactory";
import STMInvestigationFactory from "../factories/STMInvestigationFactory";
import STMGoalFactory from "../factories/STMGoalFactory";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
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
      body: { username: testUser.username, password: "superSecretPassword" },
    });
    await Login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
    expect(response.status).toEqual("success");
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Insufficient URL parameters", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(500);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("error");
    });

    test("Returns single objective by objective uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "o", o: stmObjectives[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns single goal by goal uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "g", g: stmObjectives[0].goals[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns single investigation by investigation uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: {
          missionId: testMissions[0].id,
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

    test("Returns all objectives for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(2);
    });

    test("Returns all goals for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "g" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(4);
    });

    test("Returns goals for objective", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "g", o: stmObjectives[0].uuid },
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

    test("Returns all investigations for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "i" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBe(8);
    });

    test("Returns investigations for goals", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, stmType: "i", g: stmObjectives[0].goals[0].uuid },
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

    test("Returns no objectives", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });

    test("Returns no goals", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id, stmType: "g" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });

    test("Returns no investigations", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id, stmType: "i" },
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
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newObjective, missionId: testMissions[0].id },
        query: { missionId: testMissions[2].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newObjective, missionId: testMissions[0].id },
        query: { missionId: testMissions[1].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    //upsert and delete tests must occur in order
    test("Create new objective", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newObjective, missionId: testMissions[0].id },
        query: { stmType: "o", missionId: testMissions[0].id },
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
        query: { stmType: "g", missionId: testMissions[0].id },
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
        query: { stmType: "i", missionId: testMissions[0].id },
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
        query: { stmType: "o", missionId: testMissions[0].id },
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
        query: { stmType: "g", missionId: testMissions[0].id },
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
        query: { stmType: "i", missionId: testMissions[0].id },
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
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id, stmType: "o" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSTM(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a investigation", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { stmType: "i", i: `${newInvstg.uuid}`, missionId: testMissions[0].id },
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
        query: { stmType: "g", g: `${newGoal.uuid}`, missionId: testMissions[0].id },
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
        query: { stmType: "o", o: `${newObjective.uuid}`, missionId: testMissions[0].id },
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
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
