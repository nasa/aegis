import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Traverse_db, User_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import TraverseFactory from "tests/jest/factories/TraverseFactory";
import { TextEncoder, TextDecoder } from "util";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankTraverse } from "store/storeUtils/traverse";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testTraverses: Traverse_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestTraverse",
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
  testTraverses = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("EVA API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newTraverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/traverse");
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
        .get("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns single Traverse by traverse uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: testTraverses[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns all Traverses for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    test("No traverses returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ ...newTraverse, missionId: testMissions[2].id })
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ ...newTraverse, missionId: testMissions[1].id })
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(401);
    });

    test("Create new Traverse", async () => {
      const sampleTraverse = {
        ...newTraverse,
        missionId: testMissions[0].id,
        ownerId: testUser.id,
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({
          missionId: testMissions[0].id,
          socketId: "someSocketId",
          log: false,
          traverses: [sampleTraverse],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newTraverse = { ...res.body.data[0] };

      //check if it was added to the db
      const em = getEM();
      const traverseReference = await em.findOne(Traverse_db, res.body.data[0].uuid);
      expect(traverseReference).not.toBeNull();
    });

    test("Update a Traverse", async () => {
      newTraverse.name = "Jest Test New Traverse Modified";
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({
          missionId: testMissions[0].id,
          socketId: "someSocketId",
          log: false,
          traverses: [newTraverse],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest Test New Traverse Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Delete a Traverse", async () => {
      const res = await supertest(app)
        .delete("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({
          missionId: testMissions[0].id,
          socketId: "someSocketId",
          log: false,
          traverseUuids: [newTraverse.uuid],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testTraverses.length; i++) {
    await em.nativeDelete(Traverse_db, { uuid: testTraverses[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
