import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import { User_db, Mission_db, Eva_db } from "server/database/models/_allModels";
import EvaFactory from "../factories/EVAFactory";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankEVA } from "store/storeUtils/eva";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});

let testUser: User_db;
let testMissions: Mission_db[];
let testEvas: Eva_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "Jesteva",
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
  testEvas = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMissions[0];
      eva.ownerId = testUser.id;
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("EVA API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newEVA: Eva = generateBlankEVA({ name: "Jest Eva-1" });

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
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
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
        missionId: testMissions[1].id,
        evas: [newEVA],
      };
      const res = await supertest(app)
        .post("/api/v1/eva")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Create new EVA", async () => {
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        evas: [{ ...newEVA, ownerId: testUser.id, missionId: testMissions[0].id }],
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
      const em = getEM();
      const evaReference = await em.findOne(Eva_db, upsertedEVA.uuid);
      expect(evaReference).not.toBeNull();
    });

    test("Update a EVA", async () => {
      newEVA.name = "Jest Test New EVA Modified";
      const requestBody: EvaUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
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
      expect(upsertedEVA.name).toEqual("Jest Test New EVA Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: EvaDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
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
        missionId: testMissions[1].id,
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
        missionId: testMissions[0].id,
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
  const newEva = generateBlankEVA({ name: "Jest Test New Eva" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: EvaUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissions[0].id,
      evas: [{ ...newEva, missionId: testMissions[0].id }],
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
      missionId: testMissions[0].id,
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
  const em = getEM();
  for (let i = 0; i < testEvas.length; i++) {
    await em.nativeDelete(Eva_db, { uuid: testEvas[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();

  jest.restoreAllMocks();
});
