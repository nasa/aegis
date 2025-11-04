import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import {
  App_User_db,
  Action_db,
  Mission_db,
  Station_db,
  Poi_db,
} from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import ActionFactory from "../factories/ActionFactory";
import MissionFactory from "../factories/MissionFactory";
import StationFactory from "../factories/StationFactory";
import PoiFactory from "../factories/PoiFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankAction } from "store/storeUtils/action";
// suppress socketio calls because they won't work during jest testing
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
    emitStoreUpsert: jest.fn(),
    emitStoreDelete: jest.fn(),
  };
});

let testUser: App_User_db;
let testMissions: Mission_db[];
const testActions: Action_db[] = [];
let testStation: Station_db;
let testPoi: Poi_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "Jest Action",
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

  testStation = await new StationFactory(em).createOne({
    mission: testMissions[0],
  });
  testPoi = await new PoiFactory(em).createOne({
    mission: testMissions[0],
  });
  testActions.push(
    await new ActionFactory(em).createOne({
      mission: testMissions[0],
      station: testStation,
    })
  );
  testActions.push(
    await new ActionFactory(em).createOne({
      mission: testMissions[0],
      poi: testPoi,
    })
  );
});

describe("Action API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newAction: Action = generateBlankAction({ name: "Jest Test New Action" });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        actions: [newAction],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        actions: [newAction],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Empty actions array", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actions: [],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(400);
    });

    test("Create new action", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actions: [{ ...newAction, missionId: testMissions[0].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedAction = res.body.data[0];
      expect(upsertedAction.uuid).not.toBeNull();
      newAction = { ...upsertedAction };

      //check if it was added to the db
      const em = getEM();
      const actionReference = await em.findOne(Action_db, upsertedAction.uuid);
      expect(actionReference).not.toBeNull();
    });

    test("Update a action", async () => {
      newAction.name = "Jest Test New Action Modified";
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actions: [newAction],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedAction = res.body.data[0];
      expect(upsertedAction).not.toBeNull();
      expect(upsertedAction.name).toEqual("Jest Test New Action Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: ActionDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        actionUuids: [newAction.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: ActionDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        actionUuids: [newAction.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Delete a action", async () => {
      const requestBody: ActionDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actionUuids: [newAction.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
    });
  });

  describe("Auth with emss-token header", () => {
    const emssToken = process.env.EMSS_TOKEN || "";
    newAction = generateBlankAction({ name: "Jest Test New Action" });

    test("POST request succeeds with emss-token", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actions: [newAction],
      };
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("emss-token", emssToken)
        .send(requestBody);
      expect(res.statusCode).toBe(200);
    });

    test("DELETE request succeeds with emss-token", async () => {
      const requestBody: ActionDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        actionUuids: [newAction.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("emss-token", emssToken)
        .send(requestBody);
      expect(res.statusCode).toBe(200);
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testActions.length; i++) {
    await em.nativeDelete(Action_db, { uuid: testActions[i].uuid });
  }
  await em.nativeDelete(Station_db, { uuid: testStation.uuid });
  await em.nativeDelete(Poi_db, { uuid: testPoi.uuid });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(App_User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
