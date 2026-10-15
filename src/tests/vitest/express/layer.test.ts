import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import { App_User_db, Doc_Listing_db } from "server/database/models/_allModels";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankPreset } from "store/storeUtils/preset";
import { createMockAutomergeRepo } from "../helpers/mockAutomergeRepo";
import { getAutomergeMissionHandle } from "server/express/routes/missionAutomerge";

let testAppUser: App_User_db;
let missionId: number;
const otherMissionIds = [-1001, -1002]; // view-only and no-permission missions, not real missions
const testPreset = generateBlankPreset({ name: "Vitest Layer Route Preset" });

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  const testDocListing = await new DocListingFactory(em).createOne({
    automergeUrl: "automerge:VitestLayerRouteMission",
  });
  missionId = testDocListing.missionId;
  globalValues.automergeRepo = createMockAutomergeRepo([
    {
      id: missionId,
      name: "Vitest Layer Route Mission",
      presets: { [testPreset.uuid]: testPreset },
    },
  ]);

  testAppUser = await new AppUserFactory(em).createOne({
    username: "Vitestlayer",
    permissionList: [
      { missionId, permissions: { edit: true, view: true } },
      { missionId: otherMissionIds[0], permissions: { edit: false, view: true } },
    ],
  });
});

const getMission = async (): Promise<Mission> => (await getAutomergeMissionHandle(missionId)).doc();

describe("Layer API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  const newLayer: Layer = generateBlankLayer({ name: "Vitest Test Layer" });

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
    test("No view permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: otherMissionIds[1] });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Missing missionId", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({});

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });

    test("NaN missionId", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId: "not-a-number" });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: otherMissionIds[1],
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: otherMissionIds[0],
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty layers array", async () => {
      const requestBody: LayerUpsertRequest = { missionId, layers: [] };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new layer writes it to the mission doc and to every preset layer order", async () => {
      const requestBody: LayerUpsertRequest = { missionId, layers: [newLayer] };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      const upsertedLayer: Layer = res.body.data[0];
      expect(upsertedLayer.uuid).toBe(newLayer.uuid);
      expect(typeof upsertedLayer.createdAt).toBe("number");

      const mission = await getMission();
      expect(mission.layers[newLayer.uuid].name).toBe("Vitest Test Layer");
      expect(mission.presets[testPreset.uuid].layerOrder).toEqual([
        { layerUuid: newLayer.uuid, sublayerUuids: [] },
      ]);
    });

    test("Update a layer keeps its createdAt", async () => {
      const createdAt = (await getMission()).layers[newLayer.uuid].createdAt;
      const requestBody: LayerUpsertRequest = {
        missionId,
        layers: [{ ...newLayer, name: "Vitest Test Layer Modified" }],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].name).toEqual("Vitest Test Layer Modified");
      const mission = await getMission();
      expect(mission.layers[newLayer.uuid].createdAt).toBe(createdAt);
      expect(mission.presets[testPreset.uuid].layerOrder).toHaveLength(1);
    });

    test("GET returns the layers from the mission doc", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.map((layer: Layer) => layer.uuid)).toEqual([newLayer.uuid]);
    });
  });

  describe("DELETE request", () => {
    test("No permissions - View only", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: otherMissionIds[0],
        layerUuids: [newLayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Unknown uuid returns 404", async () => {
      const requestBody: LayerDeleteRequest = { missionId, layerUuids: ["not-a-layer"] };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(404);
    });

    test("Delete a layer removes it from the doc and from every preset", async () => {
      const requestBody: LayerDeleteRequest = { missionId, layerUuids: [newLayer.uuid] };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      const mission = await getMission();
      expect(mission.layers[newLayer.uuid]).toBeUndefined();
      expect(mission.presets[testPreset.uuid].layerOrder).toEqual([]);
    });
  });

  describe("Missing missionId", () => {
    test("POST without missionId returns 400 and does not write to any doc", async () => {
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ layers: [generateBlankLayer({ name: "Vitest No Mission Layer" })] });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });

    test("DELETE without missionId returns 400", async () => {
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ layerUuids: ["not-a-real-uuid"] });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Invalid mission ID");
    });
  });

  describe("API actions with emss-token", () => {
    test("POST, GET, and DELETE with emss-token succeed", async () => {
      const tokenLayer = generateBlankLayer({ name: "Vitest Token Layer" });
      const postRes = await supertest(app)
        .post("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId, layers: [tokenLayer] } as LayerUpsertRequest);
      expect(postRes.statusCode).toBe(200);

      const getRes = await supertest(app)
        .get("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.body.data.map((layer: Layer) => layer.uuid)).toContain(tokenLayer.uuid);

      const deleteRes = await supertest(app)
        .delete("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId, layerUuids: [tokenLayer.uuid] } as LayerDeleteRequest);
      expect(deleteRes.statusCode).toBe(200);
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
