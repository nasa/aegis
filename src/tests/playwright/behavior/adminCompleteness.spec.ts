import { randomUUID, randomBytes } from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";
import { zipFiles } from "../fixtures/zip";

test("mission asset options preserve source bytes and roll back an interrupted asset copy", async ({
  page,
  request,
  mission,
}) => {
  const root = path.resolve(process.env.STATIC_DIR, "missionFiles");
  const source = path.join(root, String(mission.id));
  await mkdir(path.join(source, "Data"), { recursive: true });
  const assetName = `a-source-${randomUUID()}.txt`;
  const bytes = Buffer.from(`source-${randomUUID()}`);
  await writeFile(path.join(source, "Data", assetName), bytes);
  const before = await mission.read();
  await page.goto(`/admin/mission_duplicate/${mission.id}`);
  await page.getByLabel("Copy mission assets", { exact: true }).uncheck();
  let response = page.waitForResponse("**/api/v1/missionDup");
  await page.getByRole("button", { name: "Duplicate Mission", exact: true }).click();
  const copied = (await (await response).json()) as WrappedResponse<number>;
  expect(copied.status).toBe("success");
  try {
    expect(
      (await request.get(`/static/missionFiles/${copied.data}/Data/${assetName}`)).status()
    ).toBe(404);
    const dump = (await (
      await request.get(`/api/v1/missionDump?missionId=${copied.data}`)
    ).json()) as WrappedResponse<MissionDump>;
    expect(dump.data.missionData.mission).toMatchObject({
      evas: before.evas,
      stations: before.stations,
      id: copied.data,
    });
    await page.getByLabel("Copy mission assets", { exact: true }).check();
    await symlink(
      source,
      path.join(source, "z-cycle"),
      process.platform === "win32" ? "junction" : "dir"
    );
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/missionDup", async (route) => {
      await gate;
      await route.continue();
    });
    response = page.waitForResponse("**/api/v1/missionDup");
    await page.getByRole("button", { name: "Duplicate Mission", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Duplicating mission...");
    await expect(
      page.getByRole("button", { name: "Duplicate Mission", exact: true })
    ).toBeDisabled();
    release();
    page.once("dialog", (dialog) => dialog.accept());
    expect((await response).status()).toBe(500);
    await expect(page.getByRole("status")).toContainText("Error duplicating mission");
    const missions = (await (
      await request.get("/api/v1/missionAutomerge")
    ).json()) as WrappedResponse<Mission[]>;
    expect(missions.status).toBe("success");
    expect(
      missions.data.filter((item) => item.name === `${before.name} - Copy`).map((item) => item.id)
    ).toEqual([copied.data]);
    const partialCopies = await Promise.all(
      (await readdir(root))
        .filter((directory) => directory !== String(mission.id))
        .map(async (directory) => {
          try {
            await readFile(path.join(root, directory, "Data", assetName));
            return directory;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
          }
        })
    );
    expect(partialCopies.filter((directory) => directory !== undefined)).toEqual([]);
    expect(await readFile(path.join(source, "Data", assetName))).toEqual(bytes);
    expect(await mission.read()).toEqual(before);
  } finally {
    await rm(path.join(source, "z-cycle"), { force: true, recursive: true });
    await request.delete("/api/v1/missionAutomerge", { data: { missionIds: [copied.data] } });
    await rm(source, { force: true, recursive: true });
  }
});

test("Box SDK provider bytes survive permission and interrupted-stream failures and archive retry", async ({
  page,
  request,
  mission,
}) => {
  const provider = process.env.AEGIS_TEST_BOX_PROVIDER_URL;
  expect(provider, "Playwright must launch the deterministic Box provider").toBeTruthy();
  const id = `fixture-${mission.id}-${randomUUID()}`;
  const filename = "survey.zip";
  const payload = randomBytes(2 * 1024 * 1024);
  const archive = zipFiles({ "survey/bytes.bin": payload, "survey/info.txt": "survey metadata" });
  const configure = async (mode: string) => {
    const response = await request.post(`${provider}/__fixtures`, {
      data: {
        id,
        name: id,
        rootFolderId: process.env.BOX_INITIAL_FOLDER_ID ?? "0",
        files: [{ id, name: filename, mode, base64: archive.toString("base64") }],
      },
    });
    expect(response.ok()).toBe(true);
  };
  const missionRoot = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  const assertClean = async () => {
    const entries = await readdir(missionRoot).catch(() => [] as string[]);
    expect(
      entries.filter(
        (name) => name.endsWith(".part") || name.endsWith(".zip") || name.startsWith(".extract-")
      )
    ).toEqual([]);
    expect(
      (await request.get(`/static/missionFiles/${mission.id}/Data/survey/bytes.bin`)).status()
    ).toBe(404);
  };
  try {
    await configure("permission");
    await page.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    const box = page.getByRole("heading", { name: "Download from Box", exact: true }).locator("..");
    await box.getByText(id, { exact: true }).click();
    const row = box.locator("li").filter({ hasText: filename });
    await row.getByText("Download", { exact: true }).click();
    await expect(row.getByRole("alert")).toContainText(/403|permission|access_denied/i);
    await assertClean();
    await configure("network");
    await row.getByText("Download", { exact: true }).click();
    await expect(row.getByRole("progressbar", { name: "Box download progress" })).toBeVisible();
    await expect(row.getByRole("alert")).toBeVisible({ timeout: 30000 });
    const interrupted = (await (await request.get(`${provider}/__fixtures/${id}`)).json()) as {
      requests: number[];
    };
    expect(interrupted.requests[0]).toBe(0);
    expect(interrupted.requests.some((offset) => offset > 0)).toBe(true);
    await assertClean();
    await configure("success");
    const completion = page.waitForResponse("**/api/v1/file/boxDownloadFile?*");
    await row.getByText("Download", { exact: true }).click();
    const progress = row.getByRole("progressbar", { name: "Box download progress" });
    await expect(progress).toHaveAttribute("value", "50");
    const result = await (await completion).text();
    expect(result).toContain('"stage":"extracting"');
    expect(result).toContain('"stage":"complete"');
    expect(result).toContain('"status":"success"');
    await expect(progress).toHaveCount(0);
    await expect(row.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("tr").filter({ hasText: "survey" })).toHaveCount(1);
    const downloaded = await request.get(
      `/static/missionFiles/${mission.id}/Data/survey/bytes.bin`
    );
    expect(downloaded.ok()).toBe(true);
    expect(await downloaded.body()).toEqual(payload);
    const entries = await readdir(missionRoot);
    expect(
      entries.filter(
        (name) => name.endsWith(".part") || name.endsWith(".zip") || name.startsWith(".extract-")
      )
    ).toEqual([]);
    const successful = (await (await request.get(`${provider}/__fixtures/${id}`)).json()) as {
      requests: number[];
    };
    expect(successful.requests).toEqual([0]);
  } finally {
    await rm(missionRoot, { recursive: true, force: true });
  }
});

test("admin uploads show processing and duplicate errors and cannot operate on another mission path", async ({
  page,
  request,
  mission,
}) => {
  const directory = `missionFiles/${mission.id}/Data`;
  const ownRoot = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  const foreignId = 2000000000 + mission.id;
  const foreignDirectory = `missionFiles/${foreignId}/Data`;
  const foreignRoot = path.resolve(process.env.STATIC_DIR, "missionFiles", String(foreignId));
  const bytes = Buffer.from("foreign original bytes");
  await mkdir(path.join(foreignRoot, "Data"), { recursive: true });
  await writeFile(path.join(foreignRoot, "Data", "unrelated.txt"), bytes);
  try {
    await page.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    const session = await page.context().newCDPSession(page);
    const pausedResponse = new Promise<string>((resolve) => {
      session.once("Fetch.requestPaused", (event) => resolve(event.requestId));
    });
    await session.send("Fetch.enable", {
      patterns: [{ urlPattern: "*/api/v1/file/upload?*", requestStage: "Response" }],
    });
    await page.locator('input[name="uploadFile"]').setInputFiles({
      name: "upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(1024 * 1024, 4),
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    try {
      await expect(page.getByText(/File received! Processing\.\.\./)).toBeVisible();
      await expect(page.getByRole("button", { name: "Abort Upload", exact: true })).toBeEnabled();
    } finally {
      await session.send("Fetch.continueResponse", { requestId: await pausedResponse });
      await session.detach();
    }
    await expect(page.getByText(/Upload success\. Status 201/)).toBeVisible();
    await page.locator('input[name="uploadFile"]').setInputFiles({
      name: "upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("replacement"),
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Upload Error\. Status 500/)).toBeVisible();
    const uploaded = await request.get(`/static/${directory}/upload.txt`);
    expect(uploaded.status()).toBe(200);
    expect((await uploaded.body()).equals(Buffer.alloc(1024 * 1024, 4))).toBe(true);
    expect(
      (
        await request.post(`/api/v1/file/upload?missionId=${mission.id}`, {
          multipart: {
            uploadFile: {
              name: "z-small.txt",
              mimeType: "text/plain",
              buffer: Buffer.from("small"),
            },
            path: directory,
          },
        })
      ).status()
    ).toBe(201);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    const sortFiles = page.locator("label").filter({ hasText: "Sort files by" }).locator("select");
    await sortFiles.selectOption("size");
    await expect(page.locator("tbody tr").first()).toContainText("z-small.txt");
    await sortFiles.selectOption("name");
    await expect(page.locator("tbody tr").first()).toContainText("upload.txt");
    const suffix = `missionId=${mission.id}&path=${encodeURIComponent(foreignDirectory)}`;
    expect((await request.get(`/api/v1/file/list?${suffix}`)).status()).toBe(500);
    expect(
      (
        await request.get(`/api/v1/file/rename?${suffix}&oldname=unrelated.txt&newname=changed.txt`)
      ).status()
    ).toBe(500);
    expect(
      (
        await request.delete(
          `/api/v1/file/delete?missionId=${mission.id}&path=${encodeURIComponent(`${foreignDirectory}/unrelated.txt`)}`
        )
      ).status()
    ).toBe(500);
    const rejected = await request.post(`/api/v1/file/upload?missionId=${mission.id}`, {
      multipart: {
        uploadFile: {
          name: "unrelated.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("injected"),
        },
        path: foreignDirectory,
      },
    });
    expect(rejected.status()).toBe(500);
    await symlink(
      foreignRoot,
      path.join(ownRoot, "foreign-link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    expect(
      (
        await request.get(
          `/api/v1/file/list?missionId=${mission.id}&path=${encodeURIComponent(`missionFiles/${mission.id}/foreign-link/Data`)}`
        )
      ).status()
    ).toBe(500);
    expect(await readFile(path.join(foreignRoot, "Data", "unrelated.txt"))).toEqual(bytes);
    expect(await readdir(path.join(foreignRoot, "Data"))).toEqual(["unrelated.txt"]);
  } finally {
    await rm(path.join(ownRoot, "foreign-link"), { recursive: true, force: true });
    await rm(ownRoot, { recursive: true, force: true });
    await rm(foreignRoot, { recursive: true, force: true });
  }
});

test("admin imports configured archives, persists every sublayer kind and reconciles header ordering and preset references", async ({
  page,
  request,
  mission,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  const missionRoot = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  const properties = {
    name: "Imported raster",
    description: "Archive properties",
    tilePattern: "{z}/{x}/{y}.png",
    tileFormat: "xyz",
    minNativeZoom: 1,
    maxNativeZoom: 8,
    maxZoom: 14,
  };
  const archive = zipFiles({
    "configured/properties.json": JSON.stringify(properties),
    "configured/1/0/0.png": Buffer.from("representative tile asset"),
  });
  const before = await mission.read();
  const originalPresets = Object.keys(before.presets);
  expect(originalPresets.length).toBeGreaterThan(0);
  try {
    await page.goto(`/admin/mission_layers/${mission.id}`);
    await page
      .getByTitle("Upload File", { exact: true })
      .setInputFiles({ name: "configured.zip", mimeType: "application/zip", buffer: archive });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Upload success\. Status 201/)).toBeVisible();
    expect(
      await (
        await request.get(`/static/missionFiles/${mission.id}/Layers/configured/properties.json`)
      ).json()
    ).toEqual(properties);
    const createdHeaders: string[] = [];
    for (const name of ["AA admin first", "ZZ admin second"]) {
      await page.getByRole("button", { name: "Add New Header Layer", exact: true }).click();
      await page.getByLabel("Header Layer Name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Save", exact: true }).last().click();
      await expect
        .poll(
          async () =>
            Object.values((await mission.read()).layers).find((layer) => layer.name === name)?.uuid
        )
        .toBeTruthy();
      createdHeaders.push(
        Object.values((await mission.read()).layers).find((layer) => layer.name === name).uuid
      );
    }
    await page.getByRole("button", { name: "Move ZZ admin second up", exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).layers[createdHeaders[1]].order)
      .toBeDefined();
    await page.reload();
    const headers = (
      (await (
        await request.get(`/api/v1/layer?missionId=${mission.id}`)
      ).json()) as WrappedResponse<Layer[]>
    ).data;
    expect(headers.findIndex((layer) => layer.uuid === createdHeaders[1])).toBeLessThan(
      headers.findIndex((layer) => layer.uuid === createdHeaders[0])
    );
    const created: Sublayer[] = [];
    for (const kind of ["tile", "vector", "vector-tile"] as const) {
      await page.getByLabel("Select Header Layer", { exact: true }).selectOption(createdHeaders[0]);
      await page.getByRole("button", { name: "Add New Sub Layer", exact: true }).click();
      if (kind === "tile") {
        await page.getByLabel("Internal Source", { exact: true }).selectOption("configured");
        await expect(page.getByLabel("Sublayer Name", { exact: true })).toHaveValue(
          properties.name
        );
        await expect(page.getByLabel("Maximum Native Zoom", { exact: true })).toHaveValue("8");
      } else {
        await page.getByLabel("External (http)").check();
        await page.locator("#layerType").selectOption(kind);
        await page
          .getByLabel(kind === "vector" ? "External URL to filename" : "External URL", {
            exact: true,
          })
          .fill(
            `https://provider.invalid/${kind === "vector" ? "sample.geojson" : "sample.pmtiles"}`
          );
        await page.getByLabel("Sublayer Name", { exact: true }).fill(`Admin ${kind}`);
      }
      const name = kind === "tile" ? properties.name : `Admin ${kind}`;
      await page.getByRole("button", { name: "Save", exact: true }).last().click();
      await expect
        .poll(
          async () =>
            Object.values((await mission.read()).sublayers).find((item) => item.name === name)?.type
        )
        .toBe(kind);
      created.push(
        Object.values((await mission.read()).sublayers).find((item) => item.name === name)
      );
    }
    await page.reload();
    const saved = await mission.read();
    for (const presetId of originalPresets) {
      const preset = saved.presets[presetId];
      expect(
        preset.layerOrder.findIndex((entry) => entry.layerUuid === createdHeaders[1])
      ).toBeLessThan(preset.layerOrder.findIndex((entry) => entry.layerUuid === createdHeaders[0]));
      for (const sublayer of created) {
        expect(
          preset.layerOrder.find((entry) => entry.layerUuid === createdHeaders[0]).sublayerUuids
        ).toContain(sublayer.uuid);
        expect(preset.mapSublayerControls[sublayer.uuid]).toMatchObject({
          sublayerUuid: sublayer.uuid,
          name: sublayer.name,
          visible: false,
        });
      }
    }
    const foreignParent = randomUUID();
    const rejected = await request.post(`/api/v1/sublayer?missionId=${mission.id}`, {
      data: { missionId: mission.id, sublayers: [{ ...created[0], layerUuid: foreignParent }] },
    });
    expect(rejected.status()).toBe(400);
    expect((await mission.read()).sublayers[created[0].uuid]).toEqual(
      saved.sublayers[created[0].uuid]
    );
    for (const sublayer of created) {
      const row = page
        .getByRole("listitem")
        .filter({ hasText: new RegExp(`^${sublayer.name}\\s*Edit\\s*Delete\\s*$`) });
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByLabel("Sublayer Description", { exact: true })
        .fill(`Edited ${sublayer.type}`);
      await page.getByRole("button", { name: "Save", exact: true }).last().click();
      await expect
        .poll(async () => (await mission.read()).sublayers[sublayer.uuid].description)
        .toBe(`Edited ${sublayer.type}`);
      await row.getByRole("button", { name: "Delete", exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).sublayers[sublayer.uuid])
        .toBeUndefined();
    }
    const final = await mission.read();
    for (const preset of Object.values(final.presets))
      for (const sublayer of created) {
        expect(preset.mapSublayerControls[sublayer.uuid]).toBeUndefined();
        expect(preset.layerOrder.flatMap((entry) => entry.sublayerUuids)).not.toContain(
          sublayer.uuid
        );
      }
  } finally {
    await rm(missionRoot, { recursive: true, force: true });
  }
});

test("v2 STM edits honor referenced rules and import validation preserves or clears dependent references atomically", async ({
  page,
  mission,
}) => {
  const ids = {
    level1: randomUUID(),
    level2: randomUUID(),
    level3: randomUUID(),
    rule: randomUUID(),
  };
  const now = Date.now();
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.stmLevel1Enabled = true;
    doc.stmLevel1s = {
      [ids.level1]: {
        uuid: ids.level1,
        name: "Referenced goal",
        numbering: "1",
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmLevel2s = {
      [ids.level2]: {
        uuid: ids.level2,
        name: "Referenced objective",
        numbering: "a",
        level1Uuid: ids.level1,
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmLevel3s = {
      [ids.level3]: {
        uuid: ids.level3,
        name: "Referenced trace",
        numbering: "1",
        level2Uuid: ids.level2,
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmRules = {
      [ids.rule]: {
        uuid: ids.rule,
        stmUuid: ids.level3,
        count: 1,
        verbUuids: Object.keys(doc.actionDefinitions?.verbs ?? {}).slice(0, 1),
        nounUuids: [],
        adjectiveUuids: [],
        verbAny: false,
        nounAny: true,
        adjectiveAny: true,
        createdAt: now,
        updatedAt: now,
      },
    };
    for (const action of Object.values(doc.actions)) action.stmPriorities = { [ids.level3]: 1 };
  });
  await page.goto(`/admin/mission_stm/${mission.id}`);
  const trace = page
    .locator("li")
    .filter({ has: page.getByText(/1: Referenced trace$/, { exact: false }) })
    .last();
  await trace.getByRole("button", { name: "Edit", exact: true }).click();
  const editedRow = page
    .locator("li")
    .filter({ has: page.locator("#editLevel1Name") })
    .last();
  await editedRow.locator("#editLevel1Name").fill("Edited referenced trace");
  await editedRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).stmLevel3s[ids.level3].name)
    .toBe("Edited referenced trace");
  const editedTrace = page
    .locator("li")
    .filter({ has: page.getByText(/1: Edited referenced trace$/, { exact: false }) })
    .last();
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await editedTrace.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(() => dialogs.some((message) => message.includes("STM has a rule assigned")))
    .toBe(true);
  const snapshot = await mission.read();
  expect(snapshot.stmRules[ids.rule].stmUuid).toBe(ids.level3);
  const input = page.getByPlaceholder("paste STM json to import here", { exact: true });
  await input.fill(
    JSON.stringify({
      level1s: [],
      level2s: [{ uuid: "orphan", name: "Bad parent", numbering: "a", level1Uuid: "missing" }],
      level3s: [],
    })
  );
  await page.getByRole("button", { name: "Import STM", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "STM level2s contains a reference to a missing level1."
  );
  const invalid = await mission.read();
  expect(invalid.stmRules).toEqual(snapshot.stmRules);
  expect(invalid.stmLevel3s).toEqual(snapshot.stmLevel3s);
  expect(invalid.actions).toEqual(snapshot.actions);
  await input.fill(
    JSON.stringify({
      level1s: [{ uuid: "new-goal", name: "Replacement", numbering: "2" }],
      level2s: [],
      level3s: [],
    })
  );
  await page.getByRole("button", { name: "Import STM", exact: true }).click();
  await expect
    .poll(async () => Object.values((await mission.read()).stmLevel1s).map((item) => item.name))
    .toEqual(["Replacement"]);
  const imported = await mission.read();
  expect(imported.stmRules).toEqual({});
  for (const action of Object.values(imported.actions)) expect(action.stmPriorities).toEqual({});
  await page.reload();
  await expect(page.getByText("Goal 2: Replacement", { exact: true })).toBeVisible();
});
