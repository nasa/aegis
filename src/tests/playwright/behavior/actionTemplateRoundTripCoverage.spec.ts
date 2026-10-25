import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
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
    await page.getByLabel("actions_panel", { exact: true }).click();
  } else if (parent === "station") await selectPlanningStationActions(page, "Alpha station");
  else {
    await selectPlanningEva(page, "Survey Alpha");
    await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
    await page.getByLabel("actions_panel", { exact: true }).click();
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
      await mission.open(page);
      await enablePlanningEditMode(page);
      await parentActions(page, parent);
      await page.getByRole("listitem").locator('svg[data-icon="ellipsis-vertical"]').click();
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toBe("Action Template successfully created from action.");
        await dialog.accept();
      });
      await page.locator("dialog[open]").getByText("Save as Template", { exact: true }).click();
      await expect
        .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
        .toBe(1);
      const [templateId, template] = Object.entries((await mission.read()).actionTemplates)[0];
      expect(template).toMatchObject(payload);
      expect(template).not.toHaveProperty("uuid");
      expect(template).not.toHaveProperty("location");
      await page
        .locator("select")
        .filter({ has: page.locator(`option[value="${templateId}"]`) })
        .selectOption(templateId);
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
      await page.getByLabel("mission Section", { exact: true }).click();
      await page.getByLabel("actionTemplate_panel", { exact: true }).click();
      const templateRow = page.getByLabel("templateList-item", { exact: true });
      await templateRow.getByLabel("Expand Button", { exact: true }).click();
      await templateRow.locator('div[aria-label="Template Description"]').locator("..").click();
      await page
        .locator("dialog[open]")
        .getByLabel("Template Description", { exact: true })
        .fill("Changed template only");
      await page.locator("dialog[open]").getByText("Save", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).actionTemplates[templateId].description)
        .toBe("Changed template only");
      await mission.open(page);
      await parentActions(page, parent);
      await expect(page.getByRole("listitem")).toHaveCount(2);
      const after = await mission.read();
      expect(after.actions[mission.ids.actionA]).toEqual(source);
      expect(after.actions[copied.uuid]).toEqual(copied);
      expect(after.actionTemplates[templateId].description).toBe("Changed template only");
    });
  }
}

for (const role of ["viewer", "editor", "admin"] as const) {
  test(`${role} template creation observes the real account permission while action reads remain available`, async ({
    browser,
    baseURL,
    mission,
  }) => {
    const database = new DB();
    const username = `Template ${role} ${randomUUID()}`;
    const scoped = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const initial = await mission.read();
    try {
      await database.executeQuery(
        "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,$3,$4,$5,$5)",
        [
          username,
          await bcrypt.hash("template-role-password", 4),
          role === "admin",
          JSON.stringify([
            { missionId: mission.id, permissions: { view: true, edit: role !== "viewer" } },
          ]),
          new Date().toISOString(),
        ]
      );
      const login = await scoped.request.post("/api/v1/auth/login", {
        data: { username, password: "template-role-password" },
      });
      expect(login.ok()).toBe(true);
      const page = await scoped.newPage();
      await page.goto(mission.url);
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
      await expect(page.locator(".ol-viewport")).toHaveCount(1);
      await parentActions(page, "station");
      await expect(page.locator('div[aria-label="Action Name"]')).toHaveText("Sample regolith");
      if (role === "viewer") {
        await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
        await expect(
          page.getByRole("listitem").locator('svg[data-icon="ellipsis-vertical"]')
        ).toHaveCount(0);
      } else {
        await enablePlanningEditMode(page);
        await page.getByRole("listitem").locator('svg[data-icon="ellipsis-vertical"]').click();
        if (role === "editor") {
          await expect(
            page.locator("dialog[open]").getByText("Save as Template", { exact: true })
          ).toHaveCount(0);
          await page.keyboard.press("Escape");
        } else {
          page.once("dialog", (d) => d.accept());
          await page.locator("dialog[open]").getByText("Save as Template", { exact: true }).click();
          await expect
            .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
            .toBe(1);
        }
      }
      expect((await mission.read()).actions).toEqual(initial.actions);
      if (role !== "admin")
        expect((await mission.read()).actionTemplates).toEqual(initial.actionTemplates);
    } finally {
      await scoped.close();
      await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
    }
  });
}
