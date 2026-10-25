import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

type MissionListingResponse = WrappedResponse<Mission[]>;
type DocListingResponse = WrappedResponse<AutomergeDocListing[]>;
type MissionDumpResponse = WrappedResponse<MissionDump>;

async function readMissionListings(request: APIRequestContext) {
  const response = await request.get("/api/v1/missionAutomerge");
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as MissionListingResponse;
  expect(result.status).toBe("success");
  return result.data;
}

async function readDocListings(request: APIRequestContext) {
  const response = await request.get("/api/v1/docListing");
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as DocListingResponse;
  expect(result.status).toBe("success");
  return result.data;
}

async function readMissionDump(request: APIRequestContext, missionId: number) {
  const response = await request.get(`/api/v1/missionDump?missionId=${missionId}`);
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as MissionDumpResponse;
  expect(result.status).toBe("success");
  return result.data;
}

test("admin creates, edits, cancels destructive actions, and deletes only its chosen mission", async ({
  page,
  request,
}) => {
  const targetName = `Admin ${randomUUID().slice(0, 8)}`;
  const editedName = `${targetName} edited`;
  const editedDescription = `Reviewed admin lifecycle description ${randomUUID()}`;
  let targetId: number | undefined;
  let survivorId: number | undefined;
  let targetDeleted = false;

  try {
    await page.goto("/admin/missions");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/missionAutomerge") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "+ Add New Mission", exact: true }).click();
    const created = (await (await createResponse).json()) as WrappedResponse<AutomergeDocListing>;
    expect(created.status).toBe("success");
    targetId = created.data.missionId;
    expect(targetId).toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`/admin/mission/${targetId}/`));

    await page.getByLabel("Mission Name *", { exact: true }).fill(targetName);
    await page.getByLabel("Mission Description", { exact: true }).fill(editedDescription);
    await expect
      .poll(async () => {
        const mission = (await readMissionListings(request)).find((item) => item.id === targetId);
        return { name: mission?.name, description: mission?.description };
      })
      .toEqual({ name: targetName, description: editedDescription });
    await page.getByLabel("Mission Name *", { exact: true }).fill(editedName);

    await expect
      .poll(async () => (await readMissionDump(request, targetId)).missionData.mission.name)
      .toBe(editedName);
    const targetDump = await readMissionDump(request, targetId);
    const targetListing = (await readDocListings(request)).find(
      (listing) => listing.missionId === targetId
    );
    expect(targetListing?.automergeUrl).toBe(created.data.automergeUrl);
    expect(targetDump.missionData.mission).toMatchObject({
      id: targetId,
      name: editedName,
      description: editedDescription,
    });

    await page.getByRole("link", { name: "← Missions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Missions", exact: true })).toBeVisible();
    const survivorCreateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/missionAutomerge") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "+ Add New Mission", exact: true }).click();
    const survivorCreated = (await (
      await survivorCreateResponse
    ).json()) as WrappedResponse<AutomergeDocListing>;
    expect(survivorCreated.status).toBe("success");
    survivorId = survivorCreated.data.missionId;
    expect(survivorId).toBeGreaterThan(0);
    expect(survivorId).not.toBe(targetId);
    const survivorName = `Survivor ${randomUUID().slice(0, 8)}`;
    await page.getByLabel("Mission Name *", { exact: true }).fill(survivorName);
    await expect
      .poll(
        async () =>
          (await readMissionListings(request)).find((item) => item.id === survivorId)?.name
      )
      .toBe(survivorName);
    const survivorBefore = await readMissionDump(request, survivorId);
    const survivorListingBefore = (await readDocListings(request)).find(
      (listing) => listing.missionId === survivorId
    );
    expect(survivorListingBefore?.automergeUrl).toBe(survivorCreated.data.automergeUrl);

    await page.getByRole("link", { name: "← Missions", exact: true }).click();
    const activeRow = page.locator("tr").filter({ hasText: editedName });
    await expect(activeRow).toHaveCount(1);
    await expect(
      activeRow.getByRole("button", { name: "Edit Mission", exact: true })
    ).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("archive");
      await dialog.dismiss();
    });
    await activeRow.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(activeRow).toHaveCount(1);
    expect(
      (await readMissionListings(request)).find((item) => item.id === targetId)?.archivedAt
    ).toBeNull();
    expect((await readMissionListings(request)).find((item) => item.id === survivorId)?.name).toBe(
      survivorName
    );

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("archive");
      await dialog.accept();
    });
    await activeRow.getByRole("button", { name: "Archive", exact: true }).click();
    await expect
      .poll(async () =>
        Boolean(
          (await readMissionListings(request)).find((item) => item.id === targetId)?.archivedAt
        )
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByText("Archived Missions", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /Archived Missions/ }).click();
    const archivedRow = page.locator("tr").filter({ hasText: editedName });
    await expect(archivedRow).toHaveCount(1);
    await expect(
      archivedRow.getByRole("button", { name: "Delete Mission", exact: true })
    ).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.dismiss();
    });
    await archivedRow.getByRole("button", { name: "Delete Mission", exact: true }).click();
    await expect(archivedRow).toHaveCount(1);
    expect((await readDocListings(request)).some((listing) => listing.missionId === targetId)).toBe(
      true
    );

    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    await archivedRow.getByRole("button", { name: "Delete Mission", exact: true }).click();
    await expect
      .poll(async () =>
        (await readDocListings(request)).some((listing) => listing.missionId === targetId)
      )
      .toBe(false);
    await expect
      .poll(async () =>
        (await readMissionListings(request)).some((mission) => mission.id === targetId)
      )
      .toBe(false);
    expect(dialogs).toEqual(["confirm", "alert"]);
    targetDeleted = true;

    await page.reload();
    await expect(page.getByRole("heading", { name: "Missions", exact: true })).toBeVisible();
    await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(survivorName, { exact: true })).toBeVisible();
    expect(
      (await readDocListings(request)).find((listing) => listing.missionId === survivorId)
    ).toEqual(survivorListingBefore);
    expect((await readMissionDump(request, survivorId)).missionData.mission).toEqual(
      survivorBefore.missionData.mission
    );
    expect(
      (await readMissionListings(request)).find((mission) => mission.id === survivorId)
    ).toMatchObject({
      id: survivorId,
      name: survivorName,
    });
  } finally {
    const cleanupIds = [targetId, survivorId].filter(
      (id): id is number => id !== undefined && !(targetDeleted && id === targetId)
    );
    for (const id of cleanupIds) {
      const cleanup = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [id] },
      });
      if (cleanup.status() === 404) {
        expect((await readDocListings(request)).some((listing) => listing.missionId === id)).toBe(
          false
        );
      } else {
        expect(cleanup.ok(), `Clean only this scenario's mission ${id}`).toBe(true);
        expect(((await cleanup.json()) as WrappedResponse<unknown>).status).toBe("success");
      }
    }
  }
});
