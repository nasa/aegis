import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Preset_db, App_User_db } from "server/database/models/_allModels";
import PresetFactory from "../fixtures/entityFactories/PresetFactory";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankPreset } from "store/storeUtils/preset";
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
let testPresets: Preset_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestPreset",
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
  testPresets = await new PresetFactory(em)
    .each((preset) => {
      preset.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("Preset API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newPreset: Preset = generateBlankPreset({ name: "Preset Vitest Test" });

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
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
        presets: [newPreset],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty presets array", async () => {
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        presets: [],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new preset", async () => {
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        presets: [{ ...newPreset, missionId: testMissionIds[0], ownerId: testAppUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newPreset = { ...res.body.data[0] };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const presetRef: Preset_db = await em.findOne(Preset_db, res.body.data[0].uuid);
      expect(presetRef).not.toBeNull();
    });

    test("Update a preset", async () => {
      newPreset.name = "Preset Vitest Test Modified";
      const requestBody: PresetUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[0],
        presets: [newPreset],
      };
      const res = await supertest(app)
        .post("/api/v1/preset")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Preset Vitest Test Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: PresetDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
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
        missionId: testMissionIds[0],
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

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  const newPreset = generateBlankPreset({ name: "Vitest Test New Preset" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: PresetUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      presets: [{ ...newPreset, missionId: testMissionIds[0] }],
    };
    const res = await supertest(app)
      .post("/api/v1/preset")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: PresetDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissionIds[0],
      presetUuids: [newPreset.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/preset")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testPresets.length; i++) {
    await em.nativeDelete(Preset_db, { uuid: testPresets[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
