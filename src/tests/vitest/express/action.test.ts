import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Action_db, Station_db, Poi_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import ActionFactory from "../fixtures/entityFactories/ActionFactory";
import StationFactory from "../fixtures/entityFactories/StationFactory";
import PoiFactory from "../fixtures/entityFactories/PoiFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankAction } from "store/storeUtils/action";
// suppress socketio calls because they won't work during testing
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return {
    ...actual,
    emitStoreUpsert: vi.fn(),
    emitStoreDelete: vi.fn(),
  };
});

let testAppUser: App_User_db;
const testActions: Action_db[] = [];
let testStation: Station_db;
let testPoi: Poi_db;
const testMissionIds: number[] = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Vitest Action",
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissionIds[1],
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });

  testStation = await new StationFactory(em).createOne({
    missionId: testMissionIds[0],
  });
  testPoi = await new PoiFactory(em).createOne({
    missionId: testMissionIds[0],
  });
  testActions.push(
    await new ActionFactory(em).createOne({
      missionId: testMissionIds[0],
      station: testStation,
    })
  );
  testActions.push(
    await new ActionFactory(em).createOne({
      missionId: testMissionIds[0],
      poi: testPoi,
    })
  );
});

describe("Action API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newAction: Action = generateBlankAction({ name: "Vitest Test New Action" });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
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
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
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
        missionId: testMissionIds[0],
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
        missionId: testMissionIds[0],
        actions: [{ ...newAction, missionId: testMissionIds[0] }],
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
      const em = globalValues.orm.em.fork();
      const actionReference = await em.findOne(Action_db, upsertedAction.uuid);
      expect(actionReference).not.toBeNull();
    });

    test("Update a action", async () => {
      newAction.name = "Vitest Test New Action Modified";
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
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
      expect(upsertedAction.name).toEqual("Vitest Test New Action Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: ActionDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
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
        missionId: testMissionIds[0],
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
    newAction = generateBlankAction({ name: "Vitest Test New Action" });

    test("POST request succeeds with emss-token", async () => {
      const requestBody: ActionUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
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
        missionId: testMissionIds[0],
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
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testActions.length; i++) {
    await em.nativeDelete(Action_db, { uuid: testActions[i].uuid });
  }
  await em.nativeDelete(Station_db, { uuid: testStation.uuid });
  await em.nativeDelete(Poi_db, { uuid: testPoi.uuid });
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
