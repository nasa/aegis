import { vi } from "vitest";
import { test, expect } from "./missionHarness";

test("banner administration validates, creates, cancels edits, toggles and deletes through HTTP contracts", async ({
  page,
  mission,
  requestHandlers,
}) => {
  const writes: { method: string; banner?: NotificationBanner }[] = [];
  const success = (data: unknown) => Response.json({ status: "success", data });
  requestHandlers["/api/v1/missionCatalog"] = () =>
    success([{ id: 1, name: "Survey mission", archivedAt: null }]);
  requestHandlers["/api/v1/notificationBanner"] = (_url, init) => {
    if (init.method !== "POST") return success([]);
    const banner = JSON.parse(String(init.body)) as NotificationBanner;
    writes.push({ method: "POST", banner });
    return success({
      ...banner,
      id: 7,
      createdBy: "Editor",
      updatedBy: "Editor",
      createdAt: "2026-11-10T12:00:00.000Z",
      updatedAt: "2026-11-10T12:00:00.000Z",
    });
  };
  requestHandlers["/api/v1/notificationBanner/7"] = (_url, init) => {
    const banner = init.body ? (JSON.parse(String(init.body)) as NotificationBanner) : undefined;
    writes.push({ method: init.method, banner });
    return success(init.method === "DELETE" ? 7 : { ...banner, id: 7 });
  };
  await mission.open({ path: "/admin/notificationBanners", waitForReady: false });
  await page.getByRole("button", { name: "New Banner", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByLabelText("Message", { exact: true }).fill("Surface operations update");
  await page
    .getByRole("radio", { name: "Specific missions (mission pages only)", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByRole("checkbox", { name: "Survey mission (1)", exact: true }).click();
  await page.getByRole("button", { name: "yellow", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "Banner 7 Active", exact: true }))
    .toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].banner).toMatchObject({
    message: "Surface operations update",
    scope: "missions",
    missionIds: [1],
    backgroundColor: "#FACC15",
    textColor: "#000000",
    enabled: true,
    startsAt: null,
    endsAt: null,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabelText("Message", { exact: true }).fill("Discarded edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(1);
  await expect.element(page.getByText("Surface operations update", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "Banner 7 Disabled", exact: true }))
    .toBeVisible();
  expect(writes[1].banner).toMatchObject({ enabled: false, missionIds: [1] });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect(writes).toHaveLength(2);
  confirm.mockReturnValue(true);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(page.getByText("No notification banners have been created.", { exact: true }))
    .toBeVisible();
  expect(writes.map((w) => w.method)).toEqual(["POST", "POST", "DELETE"]);
});

test("banner administration preserves an unsaved draft after a failed request and supports retry", async ({
  page,
  mission,
  requestHandlers,
}) => {
  let attempts = 0;
  requestHandlers["/api/v1/missionCatalog"] = () => Response.json({ status: "success", data: [] });
  requestHandlers["/api/v1/notificationBanner"] = (_url, init) => {
    if (init.method !== "POST") return Response.json({ status: "success", data: [] });
    attempts += 1;
    return attempts === 1
      ? Response.json({ message: "Save temporarily unavailable" }, { status: 503 })
      : Response.json({
          status: "success",
          data: { ...JSON.parse(String(init.body)), id: 8 },
        });
  };
  await mission.open({ path: "/admin/notificationBanners", waitForReady: false });
  await page.getByRole("button", { name: "New Banner", exact: true }).click();
  await page.getByLabelText("Message", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Saving banner: Save temporarily unavailable");
  await expect
    .element(page.getByLabelText("Message", { exact: true }))
    .toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "Banner 8 Active", exact: true }))
    .toBeVisible();
  expect(attempts).toBe(2);
});
