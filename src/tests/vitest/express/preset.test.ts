import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Preset_db, App_User_db } from "server/database/models/_allModels";
import PresetFactory from "../fixtures/entityFactories/PresetFactory";
import { asUser, upsertAppUser, upsertMission, grantMissionPerms } from "../fixtures/access";
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
// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1030, 1031, 1032];
const TEST_UUPIC = "vitest-preset";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, TEST_UUPIC, { displayName: "Vitest Preset" });
  await grantMissionPerms(em, {
    missionId: testMissionIds[0],
    userId: testAppUser.id,
    permLevel: "edit",
  });
  await grantMissionPerms(em, {
    missionId: testMissionIds[1],
    userId: testAppUser.id,
    permLevel: "viewer",
  });

  testPresets = await new PresetFactory(em)
    .each((preset) => {
      preset.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("Preset API Endpoint", () => {
  let newPreset: Preset = generateBlankPreset({ name: "Preset Vitest Test" });

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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
        .set(asUser(TEST_UUPIC))
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
