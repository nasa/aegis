import { test, expect } from "../fixtures/behavioralTest";

test.use({ scenario: "execution" });
test("catalog lists reflect mission and running execution edits without fetching full documents and preserve navigation", async ({
  page,
  request,
  mission,
}) => {
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      /\/api\/v1\/(missionAutomerge|missionDump)(\?|$)/.test(request.url())
    )
      documentRequests.push(request.url());
  });
  await page.goto("/");
  const missionRow = () =>
    page.locator("tr").filter({ has: page.getByText(mission.name, { exact: true }) });
  await expect(missionRow()).toHaveCount(1);
  await expect(missionRow().locator('[data-tooltip-content="View Dashboard"]')).toBeVisible();
  const name = `${mission.name} catalog update`;
  await mission.change((doc) => {
    doc.name = name;
    doc.rexes[mission.ids.rexB].isRunning = false;
  });
  const updated = page.locator("tr").filter({ has: page.getByText(name, { exact: true }) });
  await expect(updated).toHaveCount(1);
  await expect(updated.locator('[data-tooltip-content="View Dashboard"]')).toHaveCount(0);
  await expect(missionRow()).toHaveCount(0);
  await page.goto("/admin/missions");
  await expect(page.locator("tr").filter({ hasText: name })).toHaveCount(1);
  const response = await request.get("/api/v1/missionCatalog");
  expect(response.ok()).toBe(true);
  expect(
    (await response.json()).data.find((entry: MissionSummary) => entry.id === mission.id)
  ).toMatchObject({ id: mission.id, name, runningRex: null });
  expect(documentRequests).toEqual([]);
  await page.goto("/");
  await updated.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(name);
});
