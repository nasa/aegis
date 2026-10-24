import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { planningEvaRow, selectPlanningPoi, selectPlanningStation } from "./planningHelpers";

test.use({ scenario: "execution" });

const commonMissionTabs = [
  ["prefs_panel", "Mission Preferences"],
  ["circle_panel", "Proximity Circle Definitions"],
  ["actionTemplate_panel", "Action Templates"],
  ["equipment_panel", "Mission Equipment"],
  ["export_panel", "Data Export"],
] as const;
const contexts = ["mission", "preset", "poi", "station", "eva", "traverse", "rex"] as const;

async function selectEva(page: Page, mission: BehavioralMission, rex: boolean) {
  await page.getByLabel("evas Section", { exact: true }).click();
  const all = page.getByLabel("Show All EVAs", { exact: true });
  if (await all.isVisible()) await all.click();
  await planningEvaRow(page, "Survey Alpha")
    .locator("select")
    .first()
    .selectOption(rex ? mission.ids.rexEvaA : mission.ids.evaA);
}

for (const version of [1, 2]) {
  test.describe(`Action system v${version} navigation`, () => {
    test.beforeEach(async ({ mission }) => {
      await mission.change((doc) => {
        doc.actionSystemVersion = version;
        if (version === 2) doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      });
    });
    for (const surface of contexts) {
      test(`${surface} exposes every intended right-hand tab in v${version}`, async ({
        page,
        mission,
      }) => {
        const before = await mission.read();
        await mission.open(page);
        await expect(page.getByLabel("stmViewer Section", { exact: true })).toHaveCount(
          version === 1 ? 1 : 0
        );
        for (const pane of ["stmRules", "reports"]) {
          await expect(page.getByLabel(`${pane} Section`, { exact: true })).toHaveCount(
            version === 2 ? 1 : 0
          );
        }
        let tabs: ReadonlyArray<readonly [string, string]>;
        if (surface === "mission") {
          await page.getByLabel("mission Section", { exact: true }).click();
          tabs = [
            ...commonMissionTabs,
            ...(version === 1
              ? [["geographicUnit_panel", "Mission Geography"] as const]
              : ([
                  ["actionDefinitions_panel", "STM Action Definitions"],
                  ["missionPriorities_panel", "Mission Priority Identifiers"],
                ] as const)),
          ];
          await expect(page.getByLabel("geographicUnit_panel", { exact: true })).toHaveCount(
            version === 1 ? 1 : 0
          );
          await expect(page.getByLabel("actionDefinitions_panel", { exact: true })).toHaveCount(
            version === 2 ? 1 : 0
          );
        } else if (surface === "preset") {
          await page.getByLabel("preset Section", { exact: true }).click();
          await page
            .getByLabel("mapPreset", { exact: true })
            .getByText("Overview", { exact: true })
            .click();
          tabs = [
            ["info_panel", "Preset Information"],
            ["layers_panel", "Preset Layer Configuration"],
            ["circle_panel", "Proximity Circles Display"],
            ["azimuth_panel", "Celestial Body Direction"],
            ["grid_panel", "Grid Preferences"],
          ];
        } else if (surface === "poi") {
          await selectPlanningPoi(page, "Reference POI");
          tabs = [
            ["info_panel", "POI Information"],
            ["actions_panel", "POI Actions"],
            ["report_panel", "POI Report"],
          ];
        } else if (surface === "station") {
          await selectPlanningStation(page, "Alpha station");
          tabs = [
            ["info_panel", "Station Information"],
            ["poi_panel", "Station POIs"],
            ["actions_panel", "Station Actions"],
            ["circle_panel", "Proximity Circles Display"],
            ["report_panel", "Station Report"],
          ];
        } else {
          await selectEva(page, mission, surface === "rex");
          if (surface === "traverse") {
            await planningEvaRow(page, "Survey Alpha")
              .getByText("Alpha to Bravo", { exact: true })
              .click();
            tabs = [
              ["info_panel", "Traverse Information"],
              ["actions_panel", "Traverse Actions"],
              ["report_panel", "Traverse Report"],
            ];
          } else {
            const suffix = surface === "rex" ? "Stopped Alpha" : "As Planned";
            tabs = [
              ["info_panel", `EVA Information (${suffix})`],
              ["actions_panel", `All EVA Actions (${suffix})`],
              ["report_panel", `EVA Report (${suffix})`],
              ["export_panel", `Export EVA Data (${suffix})`],
              ...(surface === "rex"
                ? ([
                    ["rex_info_panel", "REX Information"],
                    ["rex_positions_panel", "REX Position Types and Sources"],
                  ] as const)
                : []),
            ];
            for (const tab of ["rex_info_panel", "rex_positions_panel"]) {
              await expect(page.getByLabel(tab, { exact: true })).toHaveCount(
                surface === "rex" ? 1 : 0
              );
            }
          }
        }
        for (const [tab, title] of tabs) {
          await page.getByLabel(tab, { exact: true }).click();
          await expect(
            page
              .getByRole("region", { name: "right", exact: true })
              .locator('div[class*="rightBodyTitle_"]')
          ).toHaveText(title);
          await expect(page.getByLabel(tab, { exact: true })).toHaveClass(/SelectedTab/);
        }
        expect(await mission.read()).toEqual(before);
      });
    }
    if (version === 1) {
      test("legacy STM Viewer owns its fullscreen controls without v2 tabs", async ({
        page,
        mission,
      }) => {
        const before = await mission.read();
        await mission.open(page);
        await page.getByLabel("stmViewer Section", { exact: true }).click();
        await expect(
          page.locator('[data-tooltip-content="Expand/Collapse First two STM tiers"]')
        ).toBeVisible();
        await expect(page.getByText("Rule Matches", { exact: true })).toHaveCount(0);
        await expect(page.getByText("EVA Comparison", { exact: true })).toHaveCount(0);
        expect(await mission.read()).toEqual(before);
      });
    } else {
      for (const pane of ["stmRules", "reports"] as const) {
        test(`v2 ${pane} fullscreen tabs select their own content`, async ({ page, mission }) => {
          const before = await mission.read();
          await mission.open(page);
          await page.getByLabel(`${pane} Section`, { exact: true }).click();
          if (pane === "stmRules") {
            await page.getByText("Rules", { exact: true }).click();
            await expect(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
            await page.getByText("Rule Matches", { exact: true }).click();
            await expect(page.getByText("Rule Matches", { exact: true })).toHaveClass(/tabActive/);
          } else {
            for (const tab of ["EVA STM Coverage", "EVA Comparison", "POI Traceability"]) {
              await page.getByText(tab, { exact: true }).click();
              await expect(page.getByText(tab, { exact: true })).toHaveClass(/tabActive/);
            }
          }
          expect(await mission.read()).toEqual(before);
        });
      }
    }
  });
}
