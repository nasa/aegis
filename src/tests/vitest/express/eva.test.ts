import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import { App_User_db, Eva_db } from "server/database/models/_allModels";
import EvaFactory from "../fixtures/entityFactories/EVAFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankEVA } from "store/storeUtils/eva";
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
let testEvas: Eva_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Vitest Eva",
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
  testEvas = await new EvaFactory(em)
    .each((eva) => {
      eva.missionId = testMissionIds[0];
      eva.ownerId = testAppUser.id;
    })
    .create(2);
});

describe("EVA API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newEVA: Eva = generateBlankEVA({ name: "Vitest Eva-1" });

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
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        evas: [newEVA],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        evas: [newEVA],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Empty EVA array", async () => {
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        evas: [],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(400);
    });

    test("Create new EVA", async () => {
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        evas: [{ ...newEVA, ownerId: testAppUser.id, missionId: testMissionIds[0] }],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedEVA = res.body.data[0];
      expect(upsertedEVA.uuid).not.toBeNull();
      newEVA = { ...upsertedEVA };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const evaReference = await em.findOne(Eva_db, upsertedEVA.uuid);
      expect(evaReference).not.toBeNull();
    });

    test("Update a EVA", async () => {
      newEVA.name = "Vitest Test New EVA Modified";
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        evas: [newEVA],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedEVA = res.body.data[0];
      expect(upsertedEVA).not.toBeNull();
      expect(upsertedEVA.name).toEqual("Vitest Test New EVA Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: EvaDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
        evaUuids: [newEVA.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: EvaDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[1],
        evaUuids: [newEVA.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Delete a EVA", async () => {
      const requestBody: EvaDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        evaUuids: [newEVA.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
    });
  });
});

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  const newEva = generateBlankEVA({ name: "Vitest Test New Eva" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: EvaUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      evas: [{ ...newEva, missionId: testMissionIds[0] }],
    };
    const res = await supertest(app)
      .post("/api/v1/eva")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: EvaDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      evaUuids: [newEva.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/eva")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testEvas.length; i++) {
    await em.nativeDelete(Eva_db, { uuid: testEvas[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
