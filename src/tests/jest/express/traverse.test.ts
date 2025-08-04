import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Traverse_db, App_User_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import TraverseFactory from "tests/jest/factories/TraverseFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankTraverse } from "store/storeUtils/traverse";
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
});

describe("EVA API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newTraverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });

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
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissions[2].id,
        socketId: "someSocketId",
        traverses: [newTraverse],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissions[1].id,
        socketId: "someSocketId",
        traverses: [newTraverse],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new Traverse", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissions[0].id,
        socketId: "someSocketId",
        traverses: [{ ...newTraverse, missionId: testMissions[0].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

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
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissions[0].id,
        socketId: "someSocketId",
        traverses: [newTraverse],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest Test New Traverse Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: TraverseDeleteRequest = {
        missionId: testMissions[2].id,
        socketId: "someSocketId",
        traverseUuids: [],
      };
      const res = await supertest(app)
        .delete("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a Traverse", async () => {
      const requestBody: TraverseDeleteRequest = {
        missionId: testMissions[0].id,
        socketId: "someSocketId",
        traverseUuids: [newTraverse.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });

  describe("Auth with emss-token header", () => {
    const emssToken = process.env.EMSS_TOKEN || "";
    const newTraverse = generateBlankTraverse({ name: "Jest Traverse-1" });

    test("POST request succeeds with emss-token", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissions[0].id,
        socketId: "someSocketId",
        traverses: [{ ...newTraverse, missionId: testMissions[0].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("emss-token", emssToken)
        .send(requestBody);
      expect(res.statusCode).toBe(200);
    });

    test("DELETE request succeeds with emss-token", async () => {
      const requestBody: TraverseDeleteRequest = {
        missionId: testMissions[0].id,
        socketId: "someSocketId",
        traverseUuids: [newTraverse.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/traverse")
        .set("emss-token", emssToken)
        .send(requestBody);
      expect(res.statusCode).toBe(200);
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
  await em.nativeDelete(App_User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
