import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Preset_db, User_db } from "server/database/models/_allModels";
import MissionFactory from "../factories/MissionFactory";
import PresetFactory from "../factories/PresetFactory";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankPreset } from "store/storeUtils/preset";
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
let testPresets: Preset_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestPreset",
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
  testPresets = await new PresetFactory(em)
    .each((preset) => {
      preset.mission = testMissions[0];
      preset.owner = testUser;
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Preset API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newPreset: Preset = generateBlankPreset({ name: "Preset Jest Test" });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/preset").query({ missionId: testMissions[0].id });
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
        .get("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns all mission presets for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test("No presets returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/preset")
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
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[2].id,
        presets: [newPreset],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[1].id,
        presets: [newPreset],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new preset", async () => {
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[0].id,
        presets: [{ ...newPreset, missionId: testMissions[0].id, ownerId: testUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newPreset = { ...res.body.data[0] };

      //check if it was added to the db
      const em = getEM();
      const presetRef: Preset_db = await em.findOne(Preset_db, res.body.data[0].uuid);
      expect(presetRef).not.toBeNull();
    });

    test("Update a preset", async () => {
      newPreset.name = "Preset Jest Test Modified";
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[0].id,
        presets: [newPreset],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Preset Jest Test Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: PresetDeleteRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[2].id,
        presetUuids: [newPreset.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: PresetDeleteRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[1].id,
        presetUuids: [newPreset.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a preset", async () => {
      const requestBody: PresetDeleteRequest = {
        socketId: "someSocketId",
        log: false,
        missionId: testMissions[0].id,
        presetUuids: [newPreset.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testPresets.length; i++) {
    await em.nativeDelete(Preset_db, { uuid: testPresets[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
