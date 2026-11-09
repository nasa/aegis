import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { planningEvaRow, selectPlanningPoi, selectPlanningStation } from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

const commonMissionTabs = [
  ["prefs_panel", "Mission Preferences"],
  ["circle_panel", "Proximity Circle Definitions"],
  ["actionTemplate_panel", "Action Templates"],
  ["equipment_panel", "Mission Equipment"],
  ["export_panel", "Data Export"],
] as const;
const contexts = ["mission", "preset", "poi", "station", "eva", "traverse", "rex"] as const;

async function selectEva(page: Page, mission: BrowserMission, rex: boolean) {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const all = page.getByLabelText("Show All EVAs", { exact: true });
  if (await isVisible(all)) await all.click();
  await planningEvaRow(page, "Survey Alpha")
    .getBySelector("select")
    .first()
    .selectOptions(rex ? mission.ids.rexEvaA : mission.ids.evaA);
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
        await mission.open();
        await expect
          .poll(() => page.getByLabelText("stmViewer Section", { exact: true }).length)
          .toBe(version === 1 ? 1 : 0);
        for (const pane of ["stmRules", "reports"]) {
          await expect
            .poll(() => page.getByLabelText(`${pane} Section`, { exact: true }).length)
            .toBe(version === 2 ? 1 : 0);
        }
        let tabs: ReadonlyArray<readonly [string, string]>;
        if (surface === "mission") {
          await page.getByLabelText("mission Section", { exact: true }).click();
          tabs = [
            ...commonMissionTabs,
            ...(version === 1
              ? [["geographicUnit_panel", "Mission Geography"] as const]
              : ([
                  ["actionDefinitions_panel", "STM Action Definitions"],
                  ["missionPriorities_panel", "Mission Priority Identifiers"],
                ] as const)),
          ];
          await expect
            .poll(() => page.getByLabelText("geographicUnit_panel", { exact: true }).length)
            .toBe(version === 1 ? 1 : 0);
          await expect
            .poll(() => page.getByLabelText("actionDefinitions_panel", { exact: true }).length)
            .toBe(version === 2 ? 1 : 0);
        } else if (surface === "preset") {
          await page.getByLabelText("preset Section", { exact: true }).click();
          await page
            .getByLabelText("mapPreset", { exact: true })
            .getByText("Overview", { exact: true })
            .click();
          tabs = [
            ["info_panel", "Preset Information"],
            ["layers_panel", "Preset Layer Configuration"],
            ["circle_panel", "Proximity Circles Display"],
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
              await expect
                .poll(() => page.getByLabelText(tab, { exact: true }).length)
                .toBe(surface === "rex" ? 1 : 0);
            }
          }
        }
        for (const [tab, title] of tabs) {
          await page.getByLabelText(tab, { exact: true }).click();
          await expect
            .element(
              page
                .getByRole("region", { name: "right", exact: true })
                .getBySelector('div[class*="rightBodyTitle_"]')
            )
            .toMatchTextContent(exactText(title));
          await expect
            .element(page.getByLabelText(tab, { exact: true }))
            .toHaveClass(/SelectedTab/);
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
        await mission.open();
        await page.getByLabelText("stmViewer Section", { exact: true }).click();
        await expect
          .element(
            page.getBySelector('[data-tooltip-content="Expand/Collapse First two STM tiers"]')
          )
          .toBeVisible();
        await expect.poll(() => page.getByText("Rule Matches", { exact: true }).length).toBe(0);
        await expect.poll(() => page.getByText("EVA Comparison", { exact: true }).length).toBe(0);
        expect(await mission.read()).toEqual(before);
      });
    } else {
      for (const pane of ["stmRules", "reports"] as const) {
        test(`v2 ${pane} fullscreen tabs select their own content`, async ({ page, mission }) => {
          const before = await mission.read();
          await mission.open();
          await page.getByLabelText(`${pane} Section`, { exact: true }).click();
          if (pane === "stmRules") {
            await page.getByText("Rules", { exact: true }).click();
            await expect
              .element(page.getByText("Satisfaction Rules", { exact: true }))
              .toBeVisible();
            await page.getByText("Rule Matches", { exact: true }).click();
            await expect
              .element(page.getByText("Rule Matches", { exact: true }))
              .toHaveClass(/tabActive/);
          } else {
            for (const tab of ["EVA STM Coverage", "EVA Comparison", "POI Traceability"]) {
              await page.getByText(tab, { exact: true }).click();
              await expect.element(page.getByText(tab, { exact: true })).toHaveClass(/tabActive/);
            }
          }
          expect(await mission.read()).toEqual(before);
        });
      }
    }
  });
}
