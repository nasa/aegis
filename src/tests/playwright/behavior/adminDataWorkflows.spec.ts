import { randomUUID } from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import * as bcrypt from "bcryptjs";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { startDisposableApi } from "../fixtures/disposableApi";

type Wrapped<T> = WrappedResponse<T>;

async function readDump(request: APIRequestContext, missionId: number) {
  const response = await request.get(`/api/v1/missionDump?missionId=${missionId}`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as Wrapped<MissionDump>;
  expect(body.status).toBe("success");
  return body.data.missionData.mission as Mission;
}

test("duplicating a mission gives it a new document identity and preserves its graph and source", async ({
  page,
  request,
  mission,
}) => {
  const sourceBefore = await mission.read();
  const sourceListing = (await (await request.get("/api/v1/docListing")).json()) as Wrapped<
    AutomergeDocListing[]
  >;
  const sourceUrl = sourceListing.data.find((item) => item.missionId === mission.id)?.automergeUrl;
  expect(sourceUrl).toBe(mission.docUrl);
  const assetName = `copy-fixture-${randomUUID()}.geojson`;
  const assetBytes = Buffer.from(
    `{\"type\":\"FeatureCollection\",\"features\":[],\"source\":\"${randomUUID()}\"}`
  );
  const assetPath = `missionFiles/${mission.id}/Data`;
  const uploadedAsset = await request.post(`/api/v1/file/upload?missionId=${mission.id}`, {
    multipart: {
      uploadFile: { name: assetName, mimeType: "application/geo+json", buffer: assetBytes },
      path: assetPath,
    },
  });
  expect(uploadedAsset.status()).toBe(201);

  await page.goto(`/admin/mission_duplicate/${mission.id}`);
  await expect(page.getByRole("heading", { name: "Duplicate Mission", exact: true })).toBeVisible();
  await expect(page.getByText(sourceBefore.name, { exact: true })).toBeVisible();
  const duplicateResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/missionDup") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Duplicate Mission", exact: true }).click();
  const body = (await (await duplicateResponse).json()) as Wrapped<number>;
  expect(body.status).toBe("success");
  const duplicateId = body.data;
  expect(duplicateId).not.toBe(mission.id);
  try {
    await expect(page.getByRole("status")).toContainText(
      `Mission duplicated. New mission ID: ${duplicateId}`
    );
    await expect.poll(async () => (await readDump(request, duplicateId)).id).toBe(duplicateId);
    const copiedMission = await readDump(request, duplicateId);
    expect(copiedMission).toMatchObject({
      id: duplicateId,
      name: `${sourceBefore.name} - Copy`,
      evas: sourceBefore.evas,
      stations: sourceBefore.stations,
      traverses: sourceBefore.traverses,
      actions: sourceBefore.actions,
      rexes: sourceBefore.rexes,
      presets: sourceBefore.presets,
      layers: sourceBefore.layers,
      sublayers: sourceBefore.sublayers,
      folders: sourceBefore.folders,
    });
    const copiedListings = (await (
      await request.get(`/api/v1/docListing?missionId=${duplicateId}`)
    ).json()) as Wrapped<AutomergeDocListing[]>;
    expect(copiedListings.data).toHaveLength(1);
    expect(copiedListings.data[0].automergeUrl).not.toBe(sourceUrl);
    const copiedAsset = await request.get(`/static/missionFiles/${duplicateId}/Data/${assetName}`);
    expect(copiedAsset.ok()).toBe(true);
    expect(Buffer.from(await copiedAsset.body())).toEqual(assetBytes);
    expect(await mission.read()).toEqual(sourceBefore);
  } finally {
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [duplicateId] },
    });
    expect(deleted.ok()).toBe(true);
    expect(((await deleted.json()) as Wrapped<unknown>).status).toBe("success");
    await request.delete(
      `/api/v1/file/delete?missionId=${mission.id}&path=${encodeURIComponent(`${assetPath}/${assetName}`)}`
    );
    await rm(path.join(process.env.STATIC_DIR ?? "", "missionFiles", String(mission.id), "Data"), {
      recursive: true,
      force: true,
    });
    await rm(path.join(process.env.STATIC_DIR ?? "", "missionFiles", String(duplicateId)), {
      recursive: true,
      force: true,
    });
  }
});

test("mission duplication reports a missing-source failure without creating a partial mission", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/v1/missionAutomerge", { data: {} });
  expect(created.ok()).toBe(true);
  const listing = ((await created.json()) as Wrapped<AutomergeDocListing>).data;
  const name = `Missing source ${randomUUID()}`;
  try {
    const renamed = await request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: listing.missionId, fields: { name } },
    });
    expect(renamed.ok()).toBe(true);
    await page.goto(`/admin/mission_duplicate/${listing.missionId}`);
    await expect(
      page.getByRole("heading", { name: "Duplicate Mission", exact: true })
    ).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [listing.missionId] },
    });
    expect(deleted.ok()).toBe(true);
    expect(((await deleted.json()) as Wrapped<unknown>).status).toBe("success");
    const failureResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/missionDup") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Duplicate Mission", exact: true }).click();
    expect((await failureResponse).status()).toBe(500);
    await expect(page.getByRole("status")).toContainText("Error duplicating mission");
    const listingsAfter = (
      (await (
        await request.get(`/api/v1/docListing?missionId=${listing.missionId}`)
      ).json()) as Wrapped<AutomergeDocListing[]>
    ).data;
    expect(listingsAfter).toEqual([]);
    const missionsAfter = (
      (await (await request.get("/api/v1/missionAutomerge")).json()) as Wrapped<Mission[]>
    ).data;
    expect(missionsAfter.filter((item) => item.name === `${name} - Copy`)).toEqual([]);
  } finally {
    const remaining = (
      (await (
        await request.get(`/api/v1/docListing?missionId=${listing.missionId}`)
      ).json()) as Wrapped<AutomergeDocListing[]>
    ).data;
    if (remaining.length) {
      const cleanup = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [listing.missionId] },
      });
      expect(cleanup.ok()).toBe(true);
    }
  }
});

test("admin layer headers and linked sublayers persist, and deletion removes their document references", async ({
  page,
  request,
  mission,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  const headerName = `Layer ${randomUUID().slice(0, 8)}`;
  const sublayerName = `Raster ${randomUUID().slice(0, 8)}`;

  await page.goto(`/admin/mission_layers/${mission.id}`);
  await expect(page.getByRole("heading", { name: "Mission Layers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add New Header Layer", exact: true }).click();
  await page.getByLabel("Header Layer Name", { exact: true }).fill(headerName);
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect
    .poll(async () => {
      const response = (await (
        await request.get(`/api/v1/layer?missionId=${mission.id}`)
      ).json()) as Wrapped<Layer[]>;
      return response.data.find((item) => item.name === headerName);
    })
    .toBeTruthy();
  const headers = (
    (await (await request.get(`/api/v1/layer?missionId=${mission.id}`)).json()) as Wrapped<Layer[]>
  ).data;
  const createdHeader = headers.find((item) => item.name === headerName);
  expect(createdHeader?.uuid).toBeTruthy();

  const editedHeaderName = `${headerName} edited`;
  const headerRow = page.locator("li").filter({ hasText: headerName });
  await headerRow.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Header Layer Name", { exact: true }).fill(editedHeaderName);
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect
    .poll(async () => {
      const records = (
        (await (await request.get(`/api/v1/layer?missionId=${mission.id}`)).json()) as Wrapped<
          Layer[]
        >
      ).data;
      return records.find((item) => item.uuid === createdHeader!.uuid)?.name;
    })
    .toBe(editedHeaderName);

  await page.getByLabel("Select Header Layer", { exact: true }).selectOption(createdHeader!.uuid);
  await page.getByRole("button", { name: "Add New Sub Layer", exact: true }).click();
  await page.getByLabel("External (http)").check();
  await page
    .getByLabel("External URL", { exact: true })
    .fill("https://tiles.example.invalid/raster");
  await page
    .getByLabel("Tile Pattern (eg. {z}/{x}/{y}.png)", { exact: true })
    .fill("{z}/{x}/{y}.png");
  await page.getByLabel("Sublayer Name", { exact: true }).fill(sublayerName);
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect
    .poll(async () => {
      const result = (
        (await (await request.get(`/api/v1/sublayer?missionId=${mission.id}`)).json()) as Wrapped<
          Sublayer[]
        >
      ).data;
      return result.find((item) => item.name === sublayerName);
    })
    .toBeTruthy();
  const sublayers = (
    (await (await request.get(`/api/v1/sublayer?missionId=${mission.id}`)).json()) as Wrapped<
      Sublayer[]
    >
  ).data;
  const createdSublayer = sublayers.find((item) => item.name === sublayerName);
  expect(createdSublayer).toMatchObject({
    layerUuid: createdHeader!.uuid,
    type: "tile",
    path: "https://tiles.example.invalid/raster",
    tilePattern: "{z}/{x}/{y}.png",
  });

  const beforeDelete = await mission.read();
  expect(
    Object.values(beforeDelete.layers ?? {}).some((item) => item.uuid === createdHeader!.uuid)
  ).toBe(true);
  expect(
    Object.values(beforeDelete.sublayers ?? {}).some(
      (item) => item.uuid === createdSublayer!.uuid && item.layerUuid === createdHeader!.uuid
    )
  ).toBe(true);
  const sublayerRow = page
    .locator("li")
    .filter({ hasText: sublayerName })
    .filter({ hasNot: page.locator("li") });
  await sublayerRow.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(async () =>
      (
        (await (await request.get(`/api/v1/sublayer?missionId=${mission.id}`)).json()) as Wrapped<
          Sublayer[]
        >
      ).data.some((item) => item.uuid === createdSublayer!.uuid)
    )
    .toBe(false);
  await expect(sublayerRow).toHaveCount(0);
  const layerRow = page.locator("li").filter({ hasText: editedHeaderName });
  const [deletedLayer] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/layer" &&
        response.request().method() === "DELETE"
    ),
    layerRow.locator(":scope > span").getByRole("button", { name: "Delete", exact: true }).click(),
  ]);
  expect(deletedLayer.status()).toBe(200);
  expect(await deletedLayer.json()).toMatchObject({ status: "success" });
  await expect(layerRow).toHaveCount(0);
  await expect
    .poll(async () =>
      (
        (await (await request.get(`/api/v1/layer?missionId=${mission.id}`)).json()) as Wrapped<
          Layer[]
        >
      ).data.some((item) => item.uuid === createdHeader!.uuid)
    )
    .toBe(false);
  const afterDelete = await mission.read();
  expect(
    Object.values(afterDelete.presets ?? {}).every(
      (preset) =>
        !preset.layerOrder?.some((entry) => entry.sublayerUuids.includes(createdSublayer!.uuid))
    )
  ).toBe(true);
});

test("admin STM import validates hierarchy references and preserves the existing tree on invalid input for v1 and v2", async ({
  page,
  mission,
}) => {
  const priorLevel1: STMLevel1 = {
    uuid: randomUUID(),
    name: "Prior science goal",
    numbering: "P",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const priorLevel2: STMLevel2 = {
    ...priorLevel1,
    uuid: randomUUID(),
    name: "Prior objective",
    level1Uuid: priorLevel1.uuid,
  };
  const priorLevel3: STMLevel3 = {
    ...priorLevel1,
    uuid: randomUUID(),
    name: "Prior measurement",
    level2Uuid: priorLevel2.uuid,
  };
  const priorRule: STMRule = {
    uuid: randomUUID(),
    stmUuid: priorLevel3.uuid,
    count: 1,
    verbUuids: [],
    nounUuids: [],
    adjectiveUuids: [],
    verbAny: true,
    nounAny: true,
    adjectiveAny: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const restorePriorTree = (doc: Mission) => {
    doc.stmLevel1s = { [priorLevel1.uuid]: priorLevel1 };
    doc.stmLevel2s = { [priorLevel2.uuid]: priorLevel2 };
    doc.stmLevel3s = { [priorLevel3.uuid]: priorLevel3 };
    doc.stmRules = { [priorRule.uuid]: priorRule };
    doc.actions[mission.ids.actionA].stmPriorities = { [priorLevel3.uuid]: 1 };
  };
  const expectPriorTree = async () => {
    const current = await mission.read();
    expect(current.stmLevel1s).toEqual({ [priorLevel1.uuid]: priorLevel1 });
    expect(current.stmLevel2s).toEqual({ [priorLevel2.uuid]: priorLevel2 });
    expect(current.stmLevel3s).toEqual({ [priorLevel3.uuid]: priorLevel3 });
    expect(current.stmRules).toEqual({ [priorRule.uuid]: priorRule });
    expect(current.actions[mission.ids.actionA].stmPriorities).toEqual({ [priorLevel3.uuid]: 1 });
  };
  await mission.change(restorePriorTree);
  await page.goto(`/admin/mission_stm/${mission.id}`);
  const importField = page.getByPlaceholder("paste STM json to import here", { exact: true });
  const importButton = page.getByRole("button", { name: "Import STM", exact: true });

  for (const actionSystemVersion of [1, 2]) {
    await mission.change((doc) => {
      doc.actionSystemVersion = actionSystemVersion;
    });
    await expect
      .poll(async () => (await mission.read()).actionSystemVersion)
      .toBe(actionSystemVersion);

    await importField.fill("{");
    await importButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Invalid STM JSON. Check that the file contains valid JSON."
    );
    await expectPriorTree();

    const orphanedTree = {
      level1s: [] as STMLevel1[],
      level2s: [] as STMLevel2[],
      level3s: [
        {
          uuid: randomUUID(),
          name: "Orphaned instrument trace",
          numbering: "1",
          level2Uuid: randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };
    await importField.fill(JSON.stringify(orphanedTree));
    await importButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "STM level3s contains a reference to a missing level2."
    );
    await expectPriorTree();

    const sourceIds = { level1: randomUUID(), level2: randomUUID(), level3: randomUUID() };
    const validTree = {
      level1s: [
        { uuid: sourceIds.level1, name: `Science goal v${actionSystemVersion}`, numbering: "1" },
      ],
      level2s: [
        {
          uuid: sourceIds.level2,
          name: "Instrument objectives",
          numbering: "a",
          level1Uuid: sourceIds.level1,
        },
      ],
      level3s: [
        {
          uuid: sourceIds.level3,
          name: "Measure samples",
          numbering: "1",
          level2Uuid: sourceIds.level2,
        },
      ],
    };
    await importField.fill(JSON.stringify(validTree));
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await importButton.click();
    await expect
      .poll(async () => {
        const current = await mission.read();
        return [
          Object.keys(current.stmLevel1s ?? {}).length,
          Object.keys(current.stmLevel2s ?? {}).length,
          Object.keys(current.stmLevel3s ?? {}).length,
        ];
      })
      .toEqual([1, 1, 1]);
    const imported = await mission.read();
    const [level1] = Object.values(imported.stmLevel1s ?? {});
    const [level2] = Object.values(imported.stmLevel2s ?? {});
    const [level3] = Object.values(imported.stmLevel3s ?? {});
    expect(level1).toMatchObject({ name: `Science goal v${actionSystemVersion}`, numbering: "1" });
    expect(level2).toMatchObject({
      name: "Instrument objectives",
      numbering: "a",
      level1Uuid: level1.uuid,
    });
    expect(level3).toMatchObject({
      name: "Measure samples",
      numbering: "1",
      level2Uuid: level2.uuid,
    });
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level1);
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level2);
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level3);
    expect(imported.stmRules).toEqual({});
    expect(imported.actions[mission.ids.actionA].stmPriorities).toEqual({});
    await expect(importField).toHaveValue("");
    await mission.change(restorePriorTree);
  }
});

test("Box browser flow browses folders, displays byte progress, reports provider errors, and retries cleanly", async ({
  page,
  mission,
}) => {
  const zipItem = { id: "fixture-file-42", type: "file", name: "Survey bundle.zip", size: 4 };
  await page.route("**/api/v1/file/boxGetFolderItems**", async (route) => {
    const url = new URL(route.request().url());
    const itemId = url.searchParams.get("itemId");
    const entries =
      itemId === "0"
        ? [
            {
              id: "fixture-folder-9",
              type: "folder",
              name: "Fixtures",
              sequence_id: "1",
              etag: "1",
            },
          ]
        : [zipItem];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { entries, total_count: entries.length } }),
    });
  });
  await page.route(`**/api/v1/file/list?missionId=${mission.id}*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ name: zipItem.name, isDir: false, fileCount: 1, size: zipItem.size }],
      }),
    });
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let attempts = 0;
    (window as Window & { finishBoxDownload?: () => void }).finishBoxDownload = undefined;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/v1/file/boxDownloadFile?")) return originalFetch(input, init);
      attempts += 1;
      const encoder = new TextEncoder();
      let finish: (() => void) | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: object) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          send({ type: "progress", stage: "starting" });
          send({
            type: "progress",
            stage: "downloading",
            fileName: "Survey bundle.zip",
            bytesDownloaded: 2,
            totalBytes: 4,
          });
          if (attempts === 1) {
            send({ status: "error", message: "Fixture permission denied" });
            controller.close();
            return;
          }
          finish = () => {
            send({ type: "progress", stage: "complete", fileName: "Survey bundle.zip" });
            send({
              status: "success",
              message: "File downloaded and processed",
              data: { success: true },
            });
            controller.close();
          };
          (window as Window & { finishBoxDownload?: () => void }).finishBoxDownload = finish;
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    };
  });

  await page.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
  await expect(
    page.getByRole("heading", { name: "Mission Data Files", exact: true })
  ).toBeVisible();
  const box = page.getByRole("heading", { name: "Download from Box", exact: true }).locator("..");
  await expect(box.getByText("Fixtures", { exact: true })).toBeVisible();
  await box.getByText("Fixtures", { exact: true }).click();
  await expect(box.getByText("Survey bundle.zip (4 B) -", { exact: false })).toBeVisible();
  const fileRow = box.locator("li").filter({ hasText: zipItem.name });
  await fileRow.getByText("Download", { exact: true }).click();
  await expect(fileRow.getByRole("alert")).toHaveText("Fixture permission denied");
  await fileRow.getByText("Download", { exact: true }).click();
  const progress = fileRow.getByRole("progressbar", { name: "Box download progress" });
  await expect(progress).toHaveAttribute("value", "50");
  await expect(fileRow.getByText("Downloading 50%", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as Window & { finishBoxDownload?: () => void }).finishBoxDownload?.()
  );
  await expect(fileRow.getByRole("alert")).toHaveCount(0);
  await expect(progress).toHaveCount(0);
  await expect(page.locator("tr").filter({ hasText: zipItem.name })).toHaveCount(1);
});

test("admin file manager uploads, lists, renames, cancels deletion, and deletes only the selected file", async ({
  page,
  request,
  mission,
}) => {
  const originalName = `admin-${randomUUID()}.geojson`;
  const renamedName = `${originalName}.renamed`;
  const conflictName = `admin-conflict-${randomUUID()}.geojson`;
  const bytes = Buffer.from(
    `{\"type\":\"FeatureCollection\",\"features\":[],\"marker\":\"${randomUUID()}\"}`
  );
  const relativePath = `missionFiles/${mission.id}/Data`;
  const absolutePath = path.join(
    process.env.STATIC_DIR ?? "",
    "missionFiles",
    String(mission.id),
    "Data"
  );

  try {
    await page.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    await expect(
      page.getByRole("heading", { name: "Mission Data Files", exact: true })
    ).toBeVisible();
    await page.locator('input[name="uploadFile"]').setInputFiles({
      name: originalName,
      mimeType: "application/geo+json",
      buffer: bytes,
    });
    await expect(page.getByText(/GeoJSON: valid(?:\s|$)/)).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Upload success\. Status 201/)).toBeVisible();
    const listing = (await (
      await request.get(
        `/api/v1/file/list?missionId=${mission.id}&path=${encodeURIComponent(relativePath)}`
      )
    ).json()) as { data: GISfile[] };
    expect(listing.data.some((file) => file.name === originalName && !file.isDir)).toBe(true);
    const uploaded = await request.get(`/static/${relativePath}/${originalName}`);
    expect(uploaded.ok()).toBe(true);
    expect(Buffer.from(await uploaded.body())).toEqual(bytes);

    const conflictBytes = Buffer.from(`conflict-${randomUUID()}`);
    const secondUpload = await request.post(`/api/v1/file/upload?missionId=${mission.id}`, {
      multipart: {
        uploadFile: { name: conflictName, mimeType: "application/geo+json", buffer: conflictBytes },
        path: relativePath,
      },
    });
    expect(secondUpload.status()).toBe(201);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    const listedNames = await page.locator("tbody tr td:nth-child(4)").allTextContents();
    expect(listedNames).toEqual([...listedNames].sort((left, right) => left.localeCompare(right)));
    const sortFiles = page.locator("label").filter({ hasText: "Sort files by" }).locator("select");
    await sortFiles.selectOption("size");
    const listedSizes = await page.locator("tbody tr td:nth-child(3)").allTextContents();
    expect(listedSizes).toEqual(
      [...listedSizes].sort((left, right) => {
        const parseBytes = (value: string) => Number.parseFloat(value);
        return parseBytes(left) - parseBytes(right) || left.localeCompare(right);
      })
    );
    await sortFiles.selectOption("name");
    const originalRow = page.locator("tr").filter({ hasText: originalName });
    await originalRow.getByRole("button", { name: "Rename", exact: true }).click();
    await originalRow.getByTitle("New Name").fill(conflictName);
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("alert");
      expect(dialog.message()).toContain("Rename Error. Status 500");
      await dialog.accept();
    });
    await originalRow.getByRole("button", { name: "Save", exact: true }).click();
    expect(
      Buffer.from(await (await request.get(`/static/${relativePath}/${originalName}`)).body())
    ).toEqual(bytes);
    expect(
      Buffer.from(await (await request.get(`/static/${relativePath}/${conflictName}`)).body())
    ).toEqual(conflictBytes);

    const traversalPath = `${relativePath}/../../../../`;
    const traversalListing = await request.get(
      `/api/v1/file/list?missionId=${mission.id}&path=${encodeURIComponent(traversalPath)}`
    );
    expect(traversalListing.status()).toBe(500);
    const traversalDelete = await request.delete(
      `/api/v1/file/delete?missionId=${mission.id}&path=${encodeURIComponent(traversalPath)}`
    );
    expect(traversalDelete.status()).toBe(500);
    const traversalRename = await request.get(
      `/api/v1/file/rename?missionId=${mission.id}&path=${encodeURIComponent(relativePath)}&oldname=${encodeURIComponent(originalName)}&newname=${encodeURIComponent("../../outside.geojson")}`
    );
    expect(traversalRename.status()).toBe(500);
    expect(
      Buffer.from(await (await request.get(`/static/${relativePath}/${originalName}`)).body())
    ).toEqual(bytes);

    await expect(originalRow).toHaveCount(1);
    await originalRow.getByRole("button", { name: "Rename", exact: true }).click();
    await originalRow.getByTitle("New Name").fill(renamedName);
    await originalRow.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(renamedName, { exact: true })).toBeVisible();
    const renamed = await request.get(`/static/${relativePath}/${renamedName}`);
    expect(renamed.ok()).toBe(true);
    expect(Buffer.from(await renamed.body())).toEqual(bytes);
    expect((await request.get(`/static/${relativePath}/${originalName}`)).status()).toBe(404);

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.dismiss();
    });
    const renamedRow = page.locator("tr").filter({ hasText: renamedName });
    await renamedRow.getByRole("button", { name: "Delete", exact: true }).click();
    expect((await request.get(`/static/${relativePath}/${renamedName}`)).status()).toBe(200);

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await renamedRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(renamedName, { exact: true })).toHaveCount(0);
    expect((await request.get(`/static/${relativePath}/${renamedName}`)).status()).toBe(404);
    await request.delete(
      `/api/v1/file/delete?missionId=${mission.id}&path=${encodeURIComponent(`${relativePath}/${conflictName}`)}`
    );
  } finally {
    await rm(absolutePath, { recursive: true, force: true });
  }
});

test("super-admin environment configuration shows defaults and rejects viewer access and unknown keys", async ({
  browser,
  baseURL,
  page,
  request,
}) => {
  const database = new DB();
  const viewerName = `Environment config viewer ${randomUUID()}`;
  const viewerPassword = "environment-config-viewer-password";
  let viewer: BrowserContext | undefined;
  const priorResponse = await request.get("/api/v1/environmentConfig/maestroServer");
  expect(priorResponse.ok()).toBe(true);
  const prior = ((await priorResponse.json()) as Wrapped<EnvironmentConfigData>).data;
  const priorEmss = (
    (await (await request.get("/api/v1/emss/enableEmssApi")).json()) as Wrapped<boolean>
  ).data;
  const value = `https://playwright-${randomUUID()}.invalid`;
  try {
    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        viewerName,
        await bcrypt.hash(viewerPassword, 4),
        JSON.stringify([]),
        new Date().toISOString(),
      ]
    );
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const login = await viewer.request.post("/api/v1/auth/login", {
      data: { username: viewerName, password: viewerPassword },
    });
    expect(login.ok()).toBe(true);
    expect(await login.json()).toMatchObject({ status: "success", data: { isSuperAdmin: false } });
    for (const endpoint of [
      "/api/v1/environmentConfig",
      "/api/v1/environmentConfig/maestroServer",
      "/api/v1/emss/enableEmssApi",
    ]) {
      const denied = await viewer.request.get(endpoint);
      expect(denied.status(), `${endpoint} is super-admin only`).toBe(401);
      expect(await denied.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    for (const [endpoint, data] of [
      ["/api/v1/environmentConfig/maestroServer", { value: value }],
      ["/api/v1/emss/enableEmssApi", { enable: true }],
    ] as const) {
      const denied = await viewer.request.post(endpoint, { data });
      expect(denied.status(), `${endpoint} rejects normal-user writes`).toBe(401);
      expect(await denied.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    const unchangedConfig = (
      (await (
        await request.get("/api/v1/environmentConfig/maestroServer")
      ).json()) as Wrapped<EnvironmentConfigData>
    ).data;
    expect(unchangedConfig.config?.value ?? null).toBe(prior.config?.value ?? null);
    expect(
      ((await (await request.get("/api/v1/emss/enableEmssApi")).json()) as Wrapped<boolean>).data
    ).toBe(priorEmss);

    await page.goto("/admin/environmentConfig");
    await expect(
      page.getByRole("heading", { name: "Environment Configuration", exact: true })
    ).toBeVisible();
    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "maestroServer", exact: true }) });
    await expect(
      card.getByText(prior.defaultValue ?? "(not set)", { exact: true }).first()
    ).toBeVisible();
    await expect(card.getByLabel("Override value", { exact: true })).toHaveValue(
      prior.config?.value ?? ""
    );
    const unknown = await request.get("/api/v1/environmentConfig/unknownKey");
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toMatchObject({
      status: "error",
      message: "Unknown environment config key: unknownKey",
    });
  } finally {
    await viewer?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [viewerName]);
  }
});

test("EMSS admin toggle requires a boolean, preserves confirmation cancellation, and restores its initial state", async ({
  browser,
  context,
  baseURL,
}) => {
  const api = await startDisposableApi(baseURL ?? "http://localhost:4000");
  const client = await browser.newContext({
    storageState: await context.storageState(),
    baseURL: api.origin,
  });
  const page = await client.newPage();
  const request = client.request;
  const endpoint = "/api/v1/emss/enableEmssApi";
  const readEnabled = async () =>
    ((await (await request.get(endpoint)).json()) as Wrapped<boolean>).data;
  const initial = await readEnabled();
  try {
    const invalid = await request.post(endpoint, { data: { enable: "false" } });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({
      status: "failure",
      message: "enable must be a boolean",
    });
    expect(await readEnabled()).toBe(initial);

    await page.goto("/admin/emss");
    await expect(page.getByRole("heading", { name: "EMSS", exact: true })).toBeVisible();
    await expect(page.getByText(initial ? "Yes" : "No", { exact: true })).toBeVisible();
    if (initial) {
      page.once("dialog", async (dialog) => dialog.dismiss());
      await page.getByRole("button", { name: "Turn Off", exact: true }).click();
      await expect(page.getByText("Yes", { exact: true })).toBeVisible();
      expect(await readEnabled()).toBe(true);
      page.once("dialog", async (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Turn Off", exact: true }).click();
      await expect(page.getByText("No", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Turn On", exact: true }).click();
      await expect(page.getByText("Yes", { exact: true })).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Turn On", exact: true }).click();
      await expect(page.getByText("Yes", { exact: true })).toBeVisible();
      expect(await readEnabled()).toBe(true);
      page.once("dialog", async (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Turn Off", exact: true }).click();
      await expect(page.getByText("No", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Turn On", exact: true }).click();
      await expect(page.getByText("Yes", { exact: true })).toBeVisible();
    }
  } finally {
    try {
      await request.post(endpoint, { data: { enable: initial } });
      expect(await readEnabled()).toBe(initial);
    } finally {
      await client.close();
      await api.close();
    }
  }
});
