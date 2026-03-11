import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Rex_db } from "server/database/models/_allModels";
import AppUserFactory from "../factories/AppUserFactory";
import RexFactory from "../factories/RexFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankRex } from "store/storeUtils/rex";
// suppress socketio calls because they won't work during jest testing
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
    emitStoreUpsert: jest.fn(),
    emitStoreDelete: jest.fn(),
  };
});

let testAppUser: App_User_db;
let testRexes: Rex_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "JestRex",
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
  testRexes = await new RexFactory(em)
    .each((rex) => {
      rex.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("REX API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newRex: Rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: "someEvaUuid" });

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
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        rexes: [{ ...newRex, missionId: testMissionIds[2] }],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        rexes: [{ ...newRex, missionId: testMissionIds[1] }],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty rexes array", async () => {
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        rexes: [],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new Rex", async () => {
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        rexes: [{ ...newRex, missionId: testMissionIds[0], ownerId: testAppUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newRex = res.body.data[0];

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const rexReference = await em.findOne(Rex_db, newRex.uuid);
      expect(rexReference).not.toBeNull();
    });

    test("Update a Rex", async () => {
      newRex.name = "Jest Test New Rex Modified";
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        rexes: [newRex],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].name).toEqual("Jest Test New Rex Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: RexDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        uuids: [newRex.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: RexDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        uuids: [newRex.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a Rex", async () => {
      const requestBody: RexDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        uuids: [newRex.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  let newRex: Rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: "someEvaUuid" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: RexUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      rexes: [{ ...newRex, missionId: testMissionIds[0] }],
    };
    const res = await supertest(app)
      .post("/api/v1/rex")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].uuid).not.toBeNull();
    newRex = res.body.data[0];
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: RexDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      uuids: [newRex.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/rex")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testRexes.length; i++) {
    await em.nativeDelete(Rex_db, { uuid: testRexes[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
