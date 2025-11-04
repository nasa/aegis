import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Mission_db, Rex_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
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

let testUser: App_User_db;
let testMissions: Mission_db[];
let testRexes: Rex_db[];

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestRex",
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
  testRexes = await new RexFactory(em)
    .each((rex) => {
      rex.mission = testMissions[0];
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
      .send({ username: testUser.username, password: "superSecretPassword" });
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
        missionId: testMissions[2].id,
        rexes: [{ ...newRex, missionId: testMissions[2].id }],
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
        missionId: testMissions[1].id,
        rexes: [{ ...newRex, missionId: testMissions[1].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/rex")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new Rex", async () => {
      const requestBody: RexUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        rexes: [{ ...newRex, missionId: testMissions[0].id, ownerId: testUser.id }],
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
        missionId: testMissions[0].id,
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
        missionId: testMissions[2].id,
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
        missionId: testMissions[1].id,
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
        missionId: testMissions[0].id,
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
      missionId: testMissions[0].id,
      rexes: [{ ...newRex, missionId: testMissions[0].id }],
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
      missionId: testMissions[0].id,
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
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(App_User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
