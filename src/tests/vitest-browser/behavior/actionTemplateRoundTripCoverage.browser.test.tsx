import { vi } from "vitest";

import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

const ids = {
  verb: "40000000-0000-4000-8000-000000000071",
  noun: "40000000-0000-4000-8000-000000000072",
  adjective: "40000000-0000-4000-8000-000000000073",
  priority: "40000000-0000-4000-8000-000000000074",
  equipment: "40000000-0000-4000-8000-000000000075",
  geography: "40000000-0000-4000-8000-000000000076",
  level1: "40000000-0000-4000-8000-000000000077",
  level2: "40000000-0000-4000-8000-000000000078",
  level3: "40000000-0000-4000-8000-000000000079",
};

async function parentActions(page: Page, parent: "poi" | "station" | "traverse") {
  if (parent === "poi") {
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("actions_panel", { exact: true }).click();
  } else if (parent === "station") await selectPlanningStationActions(page, "Alpha station");
  else {
    await selectPlanningEva(page, "Survey Alpha");
    await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
    await page.getByLabelText("actions_panel", { exact: true }).click();
  }
}

for (const version of [1, 2] as const) {
  for (const parent of ["poi", "station", "traverse"] as const) {
    test(`v${version} fully populated ${parent} action template round trip retains supported fields with independent identity`, async ({
      page,
      mission,
    }) => {
      const payload = {
        name: "Round trip core",
        description: "Science notes\nα & <sealed>",
        descriptionTask: "Collect then seal",
        duration: 23,
        mass: 750,
        icon: "1f680",
        status: "Candidate" as const,
        type: "sample" as const,
        priority: 17,
        crewAssigned: ["EV1", "EV2"] as Crew[],
        stmAction: version === 2,
        actionDefinition: { verbUuid: ids.verb, nounUuid: ids.noun, adjectiveUuid: ids.adjective },
        missionPriorityUuid: ids.priority,
        stmPriorities: { [ids.level3]: 2 },
        equipmentItemsUsage: { [ids.equipment]: { quantityUsed: 2 } },
        geographicUnitsUsage: [ids.geography],
      };
      await mission.change((doc) => {
        doc.actionSystemVersion = version;
        doc.stmLevel1s[ids.level1] = {
          uuid: ids.level1,
          name: "Science",
          numbering: "1",
          createdAt: 1,
          updatedAt: 1,
        };
        doc.stmLevel2s[ids.level2] = {
          uuid: ids.level2,
          name: "Sampling",
          numbering: "a",
          level1Uuid: ids.level1,
          createdAt: 1,
          updatedAt: 1,
        };
        doc.stmLevel3s[ids.level3] = {
          uuid: ids.level3,
          name: "Known science target",
          numbering: "1",
          level2Uuid: ids.level2,
          createdAt: 1,
          updatedAt: 1,
        };
        doc.actionDefinitions = {
          verbs: { [ids.verb]: { name: "Collect", abbr: "collect" } },
          nouns: { [ids.noun]: { name: "Core", abbr: "core" } },
          adjectives: { [ids.adjective]: { name: "Frozen", abbr: "frozen" } },
        };
        doc.missionPriorities = { [ids.priority]: { category: "Science", trace: "SCI-17" } };
        doc.equipmentItems = {
          [ids.equipment]: { name: "Sample bag", quantity: 10, singleUse: true },
        };
        doc.geographicUnits = { [ids.geography]: { name: "Highland", abbr: "H" } };
        Object.assign(doc.actions[mission.ids.actionA], payload, {
          poiUuid: parent === "poi" ? mission.ids.poiA : null,
          stationUuid: parent === "station" ? mission.ids.stationA : null,
          traverseUuid: parent === "traverse" ? mission.ids.traverseA : null,
          location: { lat: 0.001, lng: 0.002 },
          elevation: 12,
        });
        doc.stations[mission.ids.stationA].actionOrderUuids =
          parent === "station" ? [mission.ids.actionA] : [];
        doc.pois[mission.ids.poiA].actionOrderUuids = parent === "poi" ? [mission.ids.actionA] : [];
        doc.traverses[mission.ids.traverseA].actionOrderUuids =
          parent === "traverse" ? [mission.ids.actionA] : [];
      });
      const source = (await mission.read()).actions[mission.ids.actionA];
      await mission.open();
      await enablePlanningEditMode(page);
      await parentActions(page, parent);
      await page.getByRole("listitem").getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      vi.spyOn(window, "alert").mockImplementationOnce((message) => {
        expect(String(message)).toBe("Action Template successfully created from action.");
      });
      await page
        .getBySelector("dialog[open]")
        .getByText("Save as Template", { exact: true })
        .click();
      await expect
        .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
        .toBe(1);
      const [templateId, template] = Object.entries((await mission.read()).actionTemplates)[0];
      expect(template).toMatchObject(payload);
      expect(template).not.toHaveProperty("uuid");
      expect(template).not.toHaveProperty("location");
      await page
        .getBySelector("select")
        .filter({ has: page.getBySelector(`option[value="${templateId}"]`) })
        .selectOptions(templateId);
      await page.getByText("Add Action", { exact: true }).click();
      await expect.poll(async () => Object.keys((await mission.read()).actions).length).toBe(2);
      const copied = Object.values((await mission.read()).actions).find(
        (a) => a.uuid !== mission.ids.actionA
      )!;
      expect(copied).toMatchObject(payload);
      expect(copied.uuid).not.toBe(source.uuid);
      expect(copied.refUuid).not.toBe(source.refUuid);
      expect(copied).toMatchObject({
        poiUuid: source.poiUuid,
        stationUuid: source.stationUuid,
        traverseUuid: source.traverseUuid,
        location: null,
        parentActionUuid: null,
      });
      await page.getByLabelText("mission Section", { exact: true }).click();
      await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
      const templateRow = page.getByLabelText("templateList-item", { exact: true });
      await templateRow.getByLabelText("Expand Button", { exact: true }).click();
      await templateRow
        .getBySelector('div[aria-label="Template Description"]')
        .getBySelector("..")
        .click();
      await page
        .getBySelector("dialog[open]")
        .getByLabelText("Template Description", { exact: true })
        .fill("Changed template only");
      await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).actionTemplates[templateId].description)
        .toBe("Changed template only");
      await mission.open();
      await parentActions(page, parent);
      await expect.poll(() => page.getByRole("listitem").length).toBe(2);
      const after = await mission.read();
      expect(after.actions[mission.ids.actionA]).toEqual(source);
      expect(after.actions[copied.uuid]).toEqual(copied);
      expect(after.actionTemplates[templateId].description).toBe("Changed template only");
    });
  }
}
