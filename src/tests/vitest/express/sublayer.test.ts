import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import { App_User_db, Doc_Listing_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { createMockAutomergeRepo } from "../helpers/mockAutomergeRepo";
import { getAutomergeMissionHandle } from "server/express/routes/missionAutomerge";

let testAppUser: App_User_db;
let missionId: number;
const otherMissionIds = [-1001, -1002]; // view-only and no-permission missions, not real missions
const testLayer = generateBlankLayer({ name: "Vitest Sublayer Route Layer" });
const testLayer2 = generateBlankLayer({ name: "Vitest Sublayer Route Layer 2" });
const existingSublayers = [
  generateBlankSublayer({ name: "Vitest Sublayer A", layerUuid: testLayer.uuid }),
  generateBlankSublayer({ name: "Vitest Sublayer B", layerUuid: testLayer.uuid }),
];
const testPreset = generateBlankPreset({
  name: "Vitest Sublayer Route Preset",
  layerOrder: [
    { layerUuid: testLayer.uuid, sublayerUuids: existingSublayers.map((s) => s.uuid) },
    { layerUuid: testLayer2.uuid, sublayerUuids: [] },
  ],
});

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  const testDocListing = await new DocListingFactory(em).createOne({
    automergeUrl: "automerge:VitestSublayerRouteMission",
  });
  missionId = testDocListing.missionId;
  globalValues.automergeRepo = createMockAutomergeRepo([
    {
      id: missionId,
      name: "Vitest Sublayer Route Mission",
      layers: {
        [testLayer.uuid]: testLayer,
        [testLayer2.uuid]: testLayer2,
      },
      sublayers: Object.fromEntries(existingSublayers.map((s) => [s.uuid, s])),
      presets: { [testPreset.uuid]: testPreset },
    },
  ]);

  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestSublayer",
    permissionList: [
      { missionId, permissions: { edit: true, view: true } },
      { missionId: otherMissionIds[0], permissions: { edit: false, view: true } },
    ],
  });
});

const getMission = async (): Promise<Mission> => (await getAutomergeMissionHandle(missionId)).doc();

describe("Sublayer API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  const newSublayer: Sublayer = generateBlankSublayer({
    name: "Vitest New Sublayer",
    layerUuid: testLayer.uuid,
  });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/sublayer");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: otherMissionIds[1] });

      expect(res.statusCode).toBe(401);
    });

    test("Returns empty for a non-existent sublayer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId, uuid: uuidv4() });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toEqual(0);
    });

    test("Returns single sublayer by sublayer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId, uuid: existingSublayers[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns sublayers for mission sorted by name", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.map((s: Sublayer) => s.name)).toEqual([
        "Vitest Sublayer A",
        "Vitest Sublayer B",
      ]);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions - View only", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: otherMissionIds[0],
        sublayers: [newSublayer],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty sublayers array", async () => {
      const requestBody: SublayerUpsertRequest = { missionId, sublayers: [] };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Rejects a sublayer whose layer does not exist", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId,
        sublayers: [generateBlankSublayer({ layerUuid: uuidv4() })],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("Unknown layerUuid");
    });

    test("Partial update without a layerUuid keeps the stored layer", async () => {
      const requestBody = {
        missionId,
        sublayers: [{ uuid: existingSublayers[1].uuid, name: "Vitest Sublayer B" }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      const mission = await getMission();
      expect(mission.sublayers[existingSublayers[1].uuid].layerUuid).toBe(testLayer.uuid);
    });

    test("Create new sublayer adds a hidden control and a layer order slot to every preset", async () => {
      // register.py sends ISO string dates; the server stamps its own numeric dates
      const requestBody = {
        missionId,
        sublayers: [{ ...newSublayer, createdAt: "2026-01-01T00:00:00Z" }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(typeof res.body.data[0].createdAt).toBe("number");

      const mission = await getMission();
      expect(mission.sublayers[newSublayer.uuid].name).toBe("Vitest New Sublayer");
      const preset = mission.presets[testPreset.uuid];
      expect(preset.mapSublayerControls[newSublayer.uuid]).toMatchObject({
        sublayerUuid: newSublayer.uuid,
        visible: false,
      });
      expect(preset.layerOrder[0].sublayerUuids).toEqual([
        ...existingSublayers.map((s) => s.uuid),
        newSublayer.uuid,
      ]);
    });

    test("Moving a sublayer to another layer moves it in every preset layer order", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId,
        sublayers: [{ ...newSublayer, name: "Vitest Moved Sublayer", layerUuid: testLayer2.uuid }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      const preset = (await getMission()).presets[testPreset.uuid];
      expect(preset.layerOrder[0].sublayerUuids).not.toContain(newSublayer.uuid);
      expect(preset.layerOrder[1].sublayerUuids).toEqual([newSublayer.uuid]);
      expect(preset.mapSublayerControls[newSublayer.uuid].name).toBe("Vitest Moved Sublayer");
    });
  });

  describe("DELETE request", () => {
    test("No permissions - View only", async () => {
      const requestBody: SublayerDeleteRequest = {
        missionId: otherMissionIds[0],
        sublayerUuids: [newSublayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a sublayer removes it from every preset", async () => {
      const requestBody: SublayerDeleteRequest = { missionId, sublayerUuids: [newSublayer.uuid] };
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      const mission = await getMission();
      expect(mission.sublayers[newSublayer.uuid]).toBeUndefined();
      const preset = mission.presets[testPreset.uuid];
      expect(preset.mapSublayerControls[newSublayer.uuid]).toBeUndefined();
      expect(preset.layerOrder[1].sublayerUuids).toEqual([]);
    });
  });

  describe("Missing missionId", () => {
    test("POST without missionId returns 400 and does not write to any doc", async () => {
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ sublayers: [generateBlankSublayer({ layerUuid: testLayer.uuid })] });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });

    test("DELETE without missionId returns 400", async () => {
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ sublayerUuids: ["not-a-real-uuid"] });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });
  });

  describe("API actions with emss-token", () => {
    test("GET request with emss-token succeeds", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    test("POST request with emss-token succeeds", async () => {
      const tokenSublayer = generateBlankSublayer({ layerUuid: testLayer.uuid });
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId, sublayers: [tokenSublayer] } as SublayerUpsertRequest);

      expect(res.statusCode).toBe(200);
    });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(Doc_Listing_db, { missionId });
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  await globalValues.orm.close();
  globalValues.orm = null;
  globalValues.automergeRepo = null;

  vi.restoreAllMocks();
});
