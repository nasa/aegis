import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Traverse_db, App_User_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import TraverseFactory from "tests/vitest/fixtures/entityFactories/TraverseFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankTraverse } from "store/storeUtils/traverse";
// suppress socketio calls because they won't work during vitest testing
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return {
    ...actual,
    emitStoreUpsert: vi.fn(),
    emitStoreDelete: vi.fn(),
  };
});

let testAppUser: App_User_db;
let testTraverses: Traverse_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestTraverse",
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
  testTraverses = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("EVA API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newTraverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });

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
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
        socketId: "someSocketId",
        traverses: [newTraverse],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty traverses array", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissionIds[0],
        socketId: "someSocketId",
        traverses: [],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new Traverse", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissionIds[0],
        socketId: "someSocketId",
        traverses: [{ ...newTraverse, missionId: testMissionIds[0] }],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newTraverse = { ...res.body.data[0] };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const traverseReference = await em.findOne(Traverse_db, res.body.data[0].uuid);
      expect(traverseReference).not.toBeNull();
    });

    test("Update a Traverse", async () => {
      newTraverse.name = "Vitest Test New Traverse Modified";
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissionIds[0],
        socketId: "someSocketId",
        traverses: [newTraverse],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Vitest Test New Traverse Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: TraverseDeleteRequest = {
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[0],
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
    const newTraverse = generateBlankTraverse({ name: "Vitest Traverse-1" });

    test("POST request succeeds with emss-token", async () => {
      const requestBody: TraverseUpsertRequest = {
        missionId: testMissionIds[0],
        socketId: "someSocketId",
        traverses: [{ ...newTraverse, missionId: testMissionIds[0] }],
      };
      const res = await supertest(app)
        .post("/api/v1/traverse")
        .set("emss-token", emssToken)
        .send(requestBody);
      expect(res.statusCode).toBe(200);
    });

    test("DELETE request succeeds with emss-token", async () => {
      const requestBody: TraverseDeleteRequest = {
        missionId: testMissionIds[0],
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
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testTraverses.length; i++) {
    await em.nativeDelete(Traverse_db, { uuid: testTraverses[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
