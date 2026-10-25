import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext, Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, openPlanningField } from "./planningHelpers";

const rolePassword = "preset-permissions-test-password";
const layerUuid = "32000000-0000-4000-8000-000000000001";
const sublayerUuid = "32000000-0000-4000-8000-000000000002";

const initialStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#ffffff",
  weight: 2,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#ffffff",
  altOpacity: 1,
  showLabels: true,
};

async function createRoleUser(
  database: DB,
  username: string,
  missionId: number,
  edit: boolean,
  isAdmin = false
): Promise<void> {
  await database.executeQuery(
    "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,$3,$4,$5,$5)",
    [
      username,
      await bcrypt.hash(rolePassword, 4),
      isAdmin,
      JSON.stringify([{ missionId, permissions: { view: true, edit } }]),
      new Date().toISOString(),
    ]
  );
}

async function login(context: BrowserContext, username: string, edit: boolean, isAdmin = false) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password: rolePassword },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    status: "success",
    data: {
      isAdmin,
      isSuperAdmin: false,
      permissionList: [{ permissions: { view: true, edit } }],
    },
  });
}

async function selectPreset(page: Page, name: string): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText(name);
}

async function openPresetTab(page: Page, tab: string): Promise<void> {
  await page.getByLabel(tab, { exact: true }).click();
}

test("viewer access stays local while editor and admin preset edits converge across peers", async ({
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const nonce = randomUUID();
  const viewerName = `Preset viewer ${nonce}`;
  const editorName = `Preset editor ${nonce}`;
  const adminName = `Preset admin ${nonce}`;
  let viewerContext: BrowserContext | undefined;
  let editorContext: BrowserContext | undefined;
  let adminContext: BrowserContext | undefined;

  try {
    await mission.change((doc) => {
      doc.layers[layerUuid] = {
        uuid: layerUuid,
        name: "Permission fixture layer",
        createdAt: 1,
        updatedAt: 1,
      };
      doc.sublayers[sublayerUuid] = {
        uuid: sublayerUuid,
        layerUuid,
        type: "vector",
        name: "Permission overlay",
        description: "Small local vector fixture for preset permissions",
        legend: null,
        path: "permission-overlay.geojson",
        tilePattern: null,
        boundingBox: null,
        tileFormat: null,
        minNativeZoom: null,
        maxNativeZoom: null,
        maxZoom: null,
        isTimeBased: false,
        timeLayerManifest: [],
        createdAt: 1,
        updatedAt: 1,
      };
      for (const presetUuid of [mission.ids.presetA, mission.ids.presetB]) {
        const preset = doc.presets[presetUuid];
        preset.layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
        preset.mapSublayerControls[sublayerUuid] = {
          name: "Permission overlay",
          sublayerUuid,
          visible: true,
          style: { ...initialStyle },
        };
      }
      doc.presets[mission.ids.presetA].description = "Overview baseline description";
      doc.presets[mission.ids.presetA].sunEnabled = true;
      doc.presets[mission.ids.presetA].sunAzimuth = 30;
      doc.presets[mission.ids.presetB].sunEnabled = true;
      doc.presets[mission.ids.presetB].sunAzimuth = 210;
    });
    const baseline = await mission.read();

    await createRoleUser(database, viewerName, mission.id, false);
    await createRoleUser(database, editorName, mission.id, true);
    await createRoleUser(database, adminName, mission.id, true, true);

    const emptyState: NonNullable<Parameters<typeof browser.newContext>[0]>["storageState"] = {
      cookies: [],
      origins: [],
    };
    viewerContext = await browser.newContext({ baseURL, storageState: emptyState });
    editorContext = await browser.newContext({ baseURL, storageState: emptyState });
    adminContext = await browser.newContext({ baseURL, storageState: emptyState });
    await login(viewerContext, viewerName, false);
    await login(editorContext, editorName, true);
    await login(adminContext, adminName, true, true);

    const viewerPage = await viewerContext.newPage();
    const editorPage = await editorContext.newPage();
    const adminPage = await adminContext.newPage();
    for (const page of [viewerPage, editorPage, adminPage]) {
      await page.goto(mission.url);
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(baseline.name);
    }

    await selectPreset(viewerPage, "Overview");
    await expect(viewerPage.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    await expect(viewerPage.getByText("Add", { exact: true })).toHaveCount(0);
    await expect(viewerPage.getByText("Duplicate", { exact: true })).toHaveCount(0);
    await expect(viewerPage.getByLabel("deleteButton", { exact: true })).toHaveCount(0);
    await viewerPage.locator('div[aria-label="Preset Title"]').click();
    await expect(viewerPage.locator("dialog[open]")).toHaveCount(0);
    await openPresetTab(viewerPage, "layers_panel");
    const viewerLayer = viewerPage
      .getByText("Permission overlay (vector)", { exact: true })
      .locator("..");
    await expect(viewerLayer.locator('svg[data-icon="sliders"]')).toHaveCount(0);
    await expect(viewerPage.getByLabel("opacity", { exact: true })).toHaveCount(0);
    await selectPreset(viewerPage, "Detail");
    expect((await mission.read()).presets).toEqual(baseline.presets);

    await selectPreset(editorPage, "Overview");
    const editorToggle = editorPage.getByLabel("globalEditToggle", { exact: true });
    await expect(editorToggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");
    await expect(editorPage.getByText("Add", { exact: true })).toHaveCount(0);
    await expect(editorPage.getByText("Duplicate", { exact: true })).toHaveCount(0);
    await expect(editorPage.getByLabel("deleteButton", { exact: true })).toHaveCount(0);
    await editorPage.locator('div[aria-label="Preset Title"]').click();
    await expect(editorPage.locator("dialog[open]")).toHaveCount(0);
    await openPresetTab(editorPage, "layers_panel");
    const editorLayer = editorPage
      .getByText("Permission overlay (vector)", { exact: true })
      .locator("..");
    await expect(editorLayer.locator('svg[data-icon="sliders"]')).toHaveCount(0);

    await enablePlanningEditMode(editorPage);
    await expect(editorPage.getByText("Add", { exact: true })).toBeVisible();
    await expect(editorPage.getByText("Duplicate", { exact: true })).toBeVisible();
    await expect(editorPage.getByLabel("deleteButton", { exact: true })).toBeVisible();
    await editorLayer.locator('svg[data-icon="sliders"]').click();
    await editorPage.getByLabel("opacity", { exact: true }).fill("40");
    await expect
      .poll(
        async () =>
          (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid]
            .style.opacity
      )
      .toBe(0.4);

    const beforeCreate = await mission.read();
    await editorPage.getByText("Add", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(3);
    const createdUuid = Object.keys((await mission.read()).presets).find(
      (uuid) => !Object.hasOwn(beforeCreate.presets, uuid)
    );
    expect(createdUuid).toBeTruthy();

    await selectPreset(editorPage, "Overview");
    const beforeDuplicate = await mission.read();
    await editorPage.getByText("Duplicate", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(4);
    const duplicateUuid = Object.keys((await mission.read()).presets).find(
      (uuid) => !Object.hasOwn(beforeDuplicate.presets, uuid)
    );
    expect(duplicateUuid).toBeTruthy();
    expect((await mission.read()).presets[duplicateUuid!]).toMatchObject({
      missionDefault: false,
      sunAzimuth: 30,
      mapSublayerControls: {
        [sublayerUuid]: { style: { opacity: 0.4 } },
      },
    });
    const duplicateName = (await mission.read()).presets[duplicateUuid!].name;
    await selectPreset(editorPage, duplicateName);
    editorPage.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await editorPage.getByLabel("deleteButton", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).presets[duplicateUuid!]).toBeUndefined();

    await enablePlanningEditMode(adminPage);
    await selectPreset(adminPage, "Overview");
    const beforeAdminCreate = await mission.read();
    await adminPage.getByText("Add", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(4);
    const adminCreatedUuid = Object.keys((await mission.read()).presets).find(
      (uuid) => !Object.hasOwn(beforeAdminCreate.presets, uuid)
    );
    expect(adminCreatedUuid).toBeTruthy();
    adminPage.once("dialog", async (dialog) => dialog.accept());
    await adminPage.getByLabel("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).presets[adminCreatedUuid!])
      .toBeUndefined();

    await selectPreset(editorPage, "Overview");
    await openPresetTab(editorPage, "azimuth_panel");
    await selectPreset(adminPage, "Overview");
    await openPresetTab(adminPage, "info_panel");
    const sunDraft = await openPlanningField(editorPage, "SunDegrees");
    await sunDraft.getByLabel("SunDegrees", { exact: true }).fill("75");
    await adminPage.locator('div[aria-label="Preset Description"]').click();
    const descriptionDraft = adminPage.locator("dialog[open]");
    await descriptionDraft
      .getByLabel("Preset Description", { exact: true })
      .fill("Concurrent admin description");
    await Promise.all([
      sunDraft.getByText("Save", { exact: true }).click(),
      descriptionDraft.getByText("Save", { exact: true }).click(),
    ]);

    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunAzimuth)
      .toBe(75);
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].description)
      .toBe("Concurrent admin description");
    await expect
      .poll(async () => editorPage.locator('input[name="SunDegrees"]').inputValue())
      .toBe("75");
    await expect
      .poll(async () => adminPage.locator('div[aria-label="Preset Description"]').innerText())
      .toBe("Concurrent admin description");

    await editorPage.reload();
    await adminPage.reload();
    const finalMission = await mission.read();
    expect(finalMission.presets[mission.ids.presetA]).toMatchObject({
      sunAzimuth: 75,
      description: "Concurrent admin description",
      mapSublayerControls: {
        [sublayerUuid]: { style: { opacity: 0.4 }, visible: true },
      },
    });
    expect(finalMission.presets[mission.ids.presetB]).toMatchObject({ sunAzimuth: 210 });
    await enablePlanningEditMode(editorPage);
    await selectPreset(editorPage, "Overview");
    await openPresetTab(editorPage, "azimuth_panel");
    await expect(editorPage.locator('input[name="SunDegrees"]')).toHaveValue("75");
    await selectPreset(adminPage, "Overview");
    await openPresetTab(adminPage, "info_panel");
    await expect(adminPage.locator('div[aria-label="Preset Description"]')).toHaveText(
      "Concurrent admin description"
    );
  } finally {
    await Promise.all(
      [viewerContext, editorContext, adminContext]
        .filter((context): context is BrowserContext => Boolean(context))
        .map((context) => context.close())
    );
    await database.executeQuery("DELETE FROM app_user_db WHERE username IN ($1,$2,$3)", [
      viewerName,
      editorName,
      adminName,
    ]);
  }
});
