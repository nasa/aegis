import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";

const password = "rest-contract-playwright-password";

test("REST mission routes enforce grants and return their declared validation and missing-resource responses", async ({
  browser,
  baseURL,
  request,
  mission,
}) => {
  const database = new DB();
  const username = `REST viewer ${randomUUID()}`;
  let viewer: BrowserContext | undefined;
  let anonymous: BrowserContext | undefined;
  await database.executeQuery(
    "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
    [
      username,
      await bcrypt.hash(password, 4),
      JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
      new Date().toISOString(),
    ]
  );

  try {
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const login = await viewer.request.post("/api/v1/auth/login", {
      data: { username, password },
    });
    expect(login.ok()).toBe(true);
    expect(((await login.json()) as WrappedResponse<AppUser>).status).toBe("success");
    anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const before = await mission.read();

    // Mission-scoped infrastructure handlers share view/edit grants, with named method coverage.
    const viewRoutes = [
      "layer",
      "sublayer",
      "grid",
      "grid/closestPoint",
      "maestro/v2/eva",
      "external/dust",
    ];
    for (const route of viewRoutes) {
      const denied = await anonymous.request.get(`/api/v1/${route}?missionId=${mission.id}`);
      expect(denied.status(), `anonymous GET ${route}`).toBe(401);
      expect(await denied.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
      const invalid = await request.get(`/api/v1/${route}?missionId=0`);
      expect(invalid.status(), `invalid target GET ${route}`).toBe(400);
      expect(await invalid.json()).toMatchObject({
        status: "error",
        message: "Invalid mission ID",
      });
    }
    const writeRoutes = [
      ["POST", "missionAutomerge", {}],
      ["DELETE", "missionAutomerge", { missionIds: [mission.id] }],
      ["POST", "layer", { missionId: mission.id, layers: [] }],
      ["DELETE", "layer", { missionId: mission.id, layerUuids: [] }],
      ["POST", "sublayer", { missionId: mission.id, sublayers: [] }],
      ["DELETE", "sublayer", { missionId: mission.id, sublayerUuids: [] }],
      ["POST", "grid", { missionId: mission.id }],
      ["DELETE", "grid", { missionId: mission.id }],
      ["POST", "maestro/v2/doc/create", { missionId: mission.id }],
    ] as const;
    for (const [method, route, data] of writeRoutes) {
      const denied = await viewer.request.fetch(`/api/v1/${route}`, { method, data });
      expect(denied.status(), `viewer ${method} ${route}`).toBe(401);
      expect(await denied.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    const unauthorizedTerrain = await anonymous.request.post(
      `/api/v1/terrain-profile?missionId=${mission.id}`,
      { data: {} }
    );
    expect(unauthorizedTerrain.status()).toBe(401);
    expect(await unauthorizedTerrain.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    for (const [route, data, status, message] of [
      [
        "layer",
        { missionId: mission.id, layers: [] },
        "error",
        "No layers provided in request body",
      ],
      [
        "sublayer",
        { missionId: mission.id, sublayers: [] },
        "failure",
        "No sublayers provided in request body",
      ],
      ["grid", { missionId: mission.id }, "error", "No grid provided in request body"],
      [
        "missionAutomerge/fields",
        { missionId: mission.id },
        "error",
        "No fields provided in request body",
      ],
      [
        "missionAutomerge/fields",
        { missionId: mission.id, fields: {} },
        "error",
        "No mission fields provided",
      ],
      [
        "missionAutomerge/fields",
        { missionId: mission.id, fields: { unrecognizedField: true } },
        "error",
        "Invalid mission fields",
      ],
      ["missionDup", {}, "failure", "missionId is required in the request body"],
    ] as const) {
      const invalid = await request.post(`/api/v1/${route}`, { data });
      expect(invalid.status(), `invalid input POST ${route}`).toBe(400);
      expect(await invalid.json()).toMatchObject({ status, message });
    }
    for (const [route, data] of [
      ["layer", { missionId: mission.id, layerUuids: ["absent-layer"] }],
      ["sublayer", { missionId: mission.id, sublayerUuids: ["absent-sublayer"] }],
    ] as const) {
      const absent = await request.delete(`/api/v1/${route}`, { data });
      expect(absent.status()).toBe(404);
      expect(await absent.json()).toMatchObject({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
    const missingTerrain = await request.post("/api/v1/terrain-profile?missionId=2147483647", {
      data: {},
    });
    expect(missingTerrain.status()).toBe(404);
    expect(await missingTerrain.json()).toMatchObject({
      status: "failure",
      message: "Mission 2147483647 not found",
    });
    const missingPoints = await viewer.request.get(
      `/api/v1/grid/closestPoint?missionId=${mission.id}`
    );
    expect(missingPoints.status()).toBe(400);
    expect(await missingPoints.json()).toMatchObject({
      status: "error",
      message: "Missing query object",
    });
    for (const route of ["layer", "sublayer", "docListing"]) {
      const allowed = await viewer.request.get(`/api/v1/${route}?missionId=${mission.id}`);
      expect(allowed.status()).toBe(200);
      expect(await allowed.json()).toMatchObject({ status: "success", data: expect.any(Array) });
    }
    expect(await mission.read()).toEqual(before);

    const listedMissions = await viewer.request.get("/api/v1/missionAutomerge");
    expect(listedMissions.status()).toBe(200);
    const listedBody = (await listedMissions.json()) as WrappedResponse<Mission[]>;
    expect(listedBody.status).toBe("success");
    expect(listedBody.data?.map((entry) => entry.id)).toContain(mission.id);
    expect(listedBody.data?.every((entry) => entry.id === mission.id)).toBe(true);
    const anonymousList = await anonymous.request.get("/api/v1/missionAutomerge");
    expect(anonymousList.status()).toBe(401);
    expect(await anonymousList.json()).toMatchObject({ status: "failure" });

    const readableMission = await viewer.request.get(`/api/v1/all?missionId=${mission.id}`);
    expect(readableMission.status()).toBe(200);
    expect(await readableMission.json()).toMatchObject({
      status: "success",
      data: { mission: { id: mission.id, name: mission.name } },
    });
    for (const invalidId of ["0", "nope"]) {
      const invalidMission = await request.get(`/api/v1/all?missionId=${invalidId}`);
      expect(invalidMission.status()).toBe(400);
      expect(await invalidMission.json()).toMatchObject({
        status: "error",
        message: "Invalid mission ID",
      });
    }
    const hiddenMission = await viewer.request.get("/api/v1/all?missionId=2147483647");
    expect(hiddenMission.status()).toBe(401);
    expect(await hiddenMission.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });

    const readOnlyWrite = await viewer.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { description: "must be rejected" } },
    });
    expect(readOnlyWrite.status()).toBe(401);
    expect(await readOnlyWrite.json()).toMatchObject({ status: "failure" });
    const noMissionId = await request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: 0, fields: { description: "invalid target" } },
    });
    expect(noMissionId.status()).toBe(400);
    expect(await noMissionId.json()).toMatchObject({
      status: "error",
      message: "Invalid mission ID",
    });
    const missingMission = await request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: 2147483647, fields: { description: "missing target" } },
    });
    expect(missingMission.status()).toBe(404);
    expect(await missingMission.json()).toMatchObject({ status: "failure" });

    const homepageItems = await viewer.request.get("/api/v1/missionHomepageItems");
    expect(homepageItems.status()).toBe(200);
    expect(((await homepageItems.json()) as WrappedResponse<MissionHomepageItem[]>).data).toEqual([
      expect.objectContaining({ id: mission.id, name: mission.name }),
    ]);
    const anonymousHomepage = await anonymous.request.get("/api/v1/missionHomepageItems");
    expect(anonymousHomepage.status()).toBe(401);

    const viewerExport = await viewer.request.get(`/api/v1/missionDump?missionId=${mission.id}`);
    expect(viewerExport.status()).toBe(401);
    const missingExport = await request.get("/api/v1/missionDump?missionId=2147483647");
    expect(missingExport.status()).toBe(404);
    expect(await missingExport.json()).toMatchObject({ status: "failure" });
  } finally {
    await Promise.all([viewer?.close(), anonymous?.close()]);
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
