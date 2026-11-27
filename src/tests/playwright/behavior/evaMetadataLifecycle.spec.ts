import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningEvaRow,
  planningField,
  savePlanningField,
} from "./planningHelpers";

test.use({ scenario: "execution" });

test("saved plan metadata and a family-scoped REX title reach a peer and a fresh server-backed page", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    doc.evas[mission.ids.evaA].datetime = null;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  const peer = await context.newPage();
  await mission.open(peer);
  for (const client of [page, peer]) {
    await client.getByLabel("evas Section", { exact: true }).click();
    const showAll = client.getByLabel("Show All EVAs", { exact: true });
    if (await showAll.isVisible()) await showAll.click();
    await planningEvaRow(client, "Survey Alpha")
      .locator('select[class*="dropdownSelector"]')
      .selectOption(mission.ids.evaA);
    await client.getByLabel("info_panel", { exact: true }).click();
  }
  const title = "Survey Alpha — north ridge";
  const description = 'Primary transect α & <ice>\nSecond line: "north"';
  await savePlanningField(page, "EVA Title", title);
  await savePlanningField(page, "EVA Description", description);
  await savePlanningField(page, "Duration", "360");
  await savePlanningField(page, "Average Traverse Rate", "3.5");
  await savePlanningField(page, "evaDate", "2026-10-25");
  await savePlanningField(page, "evaTime", "12:34:56");
  await planningEvaRow(page, title)
    .locator('select[class*="dropdownSelector"]')
    .selectOption(mission.ids.rexEvaA);
  await savePlanningField(page, "REX Title", title);
  await expect(planningField(peer, "EVA Title")).toHaveText(title);
  await expect(planningField(peer, "EVA Description")).toHaveText(description);
  await expect(planningField(peer, "Duration")).toHaveText("360");
  await expect(planningField(peer, "Average Traverse Rate")).toHaveText("3.5");
  await expect(planningField(peer, "evaDate")).toHaveText("2026-10-25");
  await expect(planningField(peer, "evaTime")).toHaveText("12:34:56");
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.evaA].datetime)
    .toBe(Date.parse("2026-10-25T12:34:56Z"));
  await mission.open(peer);
  await peer.getByLabel("evas Section", { exact: true }).click();
  const showAll = peer.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  await planningEvaRow(peer, title)
    .locator('select[class*="dropdownSelector"]')
    .selectOption(mission.ids.evaA);
  await expect(planningField(peer, "EVA Title")).toHaveText(title);
  await peer.getByLabel("info_panel", { exact: true }).click();
  await expect(planningField(peer, "EVA Description")).toHaveText(description);
  await expect(planningField(peer, "Duration")).toHaveText("360");
  await expect(planningField(peer, "Average Traverse Rate")).toHaveText("3.5");
  await expect(planningField(peer, "evaDate")).toHaveText("2026-10-25");
  await expect(planningField(peer, "evaTime")).toHaveText("12:34:56");
  await planningEvaRow(peer, title)
    .locator('select[class*="dropdownSelector"]')
    .selectOption(mission.ids.rexEvaA);
  await expect(planningField(peer, "EVA Title")).toHaveText(title);
  await expect(planningField(peer, "REX Title")).toHaveText(title);
});
