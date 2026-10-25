import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import Ajv from "ajv";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  savePlanningField,
  selectPlanningStationActions,
} from "./planningHelpers";

const ids = {
  verbObserve: "86100000-0000-4000-8000-000000000001",
  verbCollect: "86100000-0000-4000-8000-000000000002",
  nounCore: "86100000-0000-4000-8000-000000000003",
  adjectivePristine: "86100000-0000-4000-8000-000000000004",
  level1: "86100000-0000-4000-8000-000000000011",
  level2: "86100000-0000-4000-8000-000000000012",
  level3: "86100000-0000-4000-8000-000000000013",
  rule: "86100000-0000-4000-8000-000000000021",
  poiAction: "86100000-0000-4000-8000-000000000031",
  coverageAction: "86100000-0000-4000-8000-000000000033",
  campaign: "Live report campaign",
} as const;

test.use({ scenario: "execution" });

async function openReport(page: Page, name: string): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText(name, { exact: true }).click();
}

function metricCells(page: Page, metric: string): Locator {
  return page
    .locator(`div[data-tooltip-html="${metric}"]`)
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

function coverageCell(page: Page): Locator {
  return page
    .locator('[class*="gridCellLevel3Name"]')
    .filter({ hasText: "Live coverage objective" })
    .locator("xpath=ancestor::div[contains(@class, 'gridCellLevel3Container')][1]")
    .locator('[class*="tableRowCells"] > div[class*="cell_"]:not([class*="cellStation"])')
    .first();
}

test("viewer reports stay read-only while rules, campaigns, and actions refresh live and after reload", async ({
  page,
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const username = `Report viewer ${randomUUID()}`;
  const password = "report-viewer-password";
  let viewerContext: BrowserContext | undefined;
  try {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = {
        verbs: {
          [ids.verbObserve]: { name: "Observe", abbr: "observe" },
          [ids.verbCollect]: { name: "Collect", abbr: "collect" },
        },
        nouns: { [ids.nounCore]: { name: "Core", abbr: "core" } },
        adjectives: {
          [ids.adjectivePristine]: { name: "Pristine", abbr: "pristine" },
        },
      };
      doc.stmLevel1s[ids.level1] = {
        uuid: ids.level1,
        name: "Mission Science",
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
        name: "Live coverage objective",
        numbering: "1",
        level2Uuid: ids.level2,
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmRules = {
        [ids.rule]: {
          uuid: ids.rule,
          stmUuid: ids.level3,
          count: 1,
          verbUuids: [ids.verbObserve],
          nounUuids: [ids.nounCore],
          adjectiveUuids: [ids.adjectivePristine],
          verbAny: false,
          nounAny: false,
          adjectiveAny: false,
          createdAt: 1,
          updatedAt: 1,
        },
      };
      const action = doc.actions[mission.ids.actionA];
      const original = JSON.parse(JSON.stringify(action)) as Action;
      const source = JSON.parse(JSON.stringify(original)) as Action;
      source.uuid = ids.poiAction;
      source.refUuid = ids.poiAction;
      source.name = "POI source task";
      source.poiUuid = mission.ids.poiA;
      source.stationUuid = null;
      source.parentActionUuid = null;
      source.parentCopyDate = null;
      source.stmAction = false;
      source.actionDefinition = null;
      doc.actions[ids.poiAction] = source;
      doc.pois[mission.ids.poiA].actionOrderUuids = [ids.poiAction];
      const coverageAction = JSON.parse(JSON.stringify(original)) as Action;
      coverageAction.uuid = ids.coverageAction;
      coverageAction.refUuid = ids.coverageAction;
      coverageAction.name = "Science observe action";
      coverageAction.poiUuid = null;
      coverageAction.parentActionUuid = null;
      coverageAction.parentCopyDate = null;
      coverageAction.stmAction = true;
      coverageAction.actionDefinition = {
        verbUuid: ids.verbObserve,
        nounUuid: ids.nounCore,
        adjectiveUuid: ids.adjectivePristine,
      };
      doc.actions[ids.coverageAction] = coverageAction;
      doc.stations[mission.ids.stationA].actionOrderUuids.push(ids.coverageAction);
      action.stmAction = false;
      action.actionDefinition = null;
      action.poiUuid = null;
      action.parentActionUuid = ids.poiAction;
      action.parentCopyDate = 1;
      action.refUuid = "86100000-0000-4000-8000-000000000032";
      action.name = "POI source task";
      doc.reportCampaigns = {};
      if (doc.rexes[mission.ids.rexA]) {
        const rexAction = doc.actions[mission.ids.rexActionA];
        rexAction.stmAction = false;
        rexAction.actionDefinition = null;
        rexAction.parentActionUuid = ids.poiAction;
        rexAction.parentCopyDate = 1;
        rexAction.refUuid = action.refUuid;
        rexAction.name = action.name;
      }
    });
    const schemaResponse = await page.request.get("/api/v1/mission/schema");
    expect(schemaResponse.ok()).toBe(true);
    const schema = await schemaResponse.json();
    const validateMission = new Ajv({ strict: false }).compile<Mission>(schema.data);
    const beforeViewer = await mission.read();
    expect(validateMission(beforeViewer), JSON.stringify(validateMission.errors)).toBe(true);
    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash(password, 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        new Date().toISOString(),
      ]
    );
    viewerContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const login = await viewerContext.request.post("/api/v1/auth/login", {
      data: { username, password },
    });
    expect(login.ok()).toBe(true);
    expect(await login.json()).toMatchObject({
      status: "success",
      data: { isSuperAdmin: false },
    });
    const allowedListing = await viewerContext.request.get(
      `/api/v1/docListing?missionId=${mission.id}`
    );
    expect(allowedListing.ok()).toBe(true);
    const allowedDump = await viewerContext.request.get(
      `/api/v1/missionDump?missionId=${mission.id}`
    );
    expect(allowedDump.status()).toBe(401);
    const viewerPage = await viewerContext.newPage();
    const viewerLoadFailures: string[] = [];
    viewerPage.on("response", (response) => {
      if (!response.ok()) viewerLoadFailures.push(`${response.status()} ${response.url()}`);
    });
    viewerPage.on("requestfailed", (request) => {
      viewerLoadFailures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
    });
    viewerPage.on("pageerror", (error) => viewerLoadFailures.push(error.message));
    await viewerPage.goto("/");
    await viewerPage
      .locator("tr")
      .filter({ has: viewerPage.getByText(mission.name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(
      viewerPage.getByLabel("missionNameHeader", { exact: true }),
      viewerLoadFailures.join("\n")
    ).toHaveText(mission.name);
    await expect(viewerPage.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);

    await openReport(viewerPage, "EVA Comparison");
    await viewerPage.getByLabel("Diff", { exact: true }).click();
    await expect(viewerPage.getByText("Metric", { exact: true })).toBeVisible();
    // Report campaign management writes mission data; it is unavailable to a viewer.
    await expect(viewerPage.getByRole("button", { name: "Campaigns…", exact: true })).toHaveCount(
      0
    );
    await openReport(viewerPage, "EVA STM Coverage");
    await viewerPage.getByLabel("Diff", { exact: true }).click();
    await expect(viewerPage.getByText("Live coverage objective", { exact: true })).toBeVisible();
    await expect(coverageCell(viewerPage)).toHaveAttribute(
      "data-tooltip-html",
      /1 matching actions, 1\/1 rules satisfied/
    );
    await openReport(viewerPage, "POI Traceability");
    const trace = viewerPage.getByRole("region", { name: "Reference POI action trace" });
    await expect(trace.getByRole("button", { name: /POI source task/ })).toBeVisible();
    expect(await mission.read()).toEqual(beforeViewer);

    await mission.open(page);
    await enablePlanningEditMode(page);
    await page.getByLabel("stmRules Section", { exact: true }).click();
    await page.getByText("Rules", { exact: true }).click();
    const ruleRow = page.locator('[class*="stmRuleRowContainer"]').first();
    await ruleRow.getByText("Observe", { exact: true }).click();
    const verbItems = ruleRow.locator('[class*="multiselectDropdownItems"]');
    await verbItems.getByText("Collect", { exact: true }).click();
    await verbItems.getByText("Observe", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stmRules[ids.rule].verbUuids)
      .toEqual([ids.verbCollect]);
    await openReport(viewerPage, "EVA STM Coverage");
    await expect(coverageCell(viewerPage)).toHaveAttribute(
      "data-tooltip-html",
      /0 matching actions/
    );

    await openReport(page, "EVA Comparison");
    await page.getByText("Campaigns…", { exact: true }).click();
    const campaignDialog = page.locator("dialog[open]");
    await campaignDialog.getByText("New campaign", { exact: true }).click();
    await campaignDialog.getByLabel("Campaign name", { exact: true }).fill(ids.campaign);
    await campaignDialog.getByRole("checkbox", { name: "Survey Alpha", exact: true }).check();
    await expect
      .poll(
        async () =>
          Object.values((await mission.read()).reportCampaigns).find(
            (candidate) => candidate.name === ids.campaign
          )?.memberEvaUuids
      )
      .toEqual([mission.ids.evaA]);
    const campaign = Object.values((await mission.read()).reportCampaigns).find(
      (candidate) => candidate.name === ids.campaign
    );
    expect(campaign).toBeDefined();
    await page.getByRole("button", { name: "Close campaigns", exact: true }).click();
    await openReport(viewerPage, "EVA Comparison");
    await expect(
      viewerPage.getByRole("button", { name: new RegExp(`${ids.campaign}: Planned set`) })
    ).toBeVisible();
    await expect(metricCells(viewerPage, "Total action time")).toHaveText([
      "12",
      "6",
      "0",
      "0",
      "12",
      "6",
    ]);

    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await page
      .getByRole("listitem")
      .filter({
        has: page.locator('div[aria-label="Action Name"]').filter({ hasText: "POI source task" }),
      })
      .locator('svg[data-icon="caret-right"]')
      .click();
    await savePlanningField(page, "Duration in minutes", "17");
    await expect(metricCells(viewerPage, "Total action time")).toHaveText([
      "23",
      "6",
      "0",
      "0",
      "23",
      "6",
    ]);
    await savePlanningField(page, "Action Name", "Live renamed sample");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].name)
      .toBe("Live renamed sample");
    await openReport(viewerPage, "POI Traceability");
    await expect(trace.getByText("Action: Live renamed sample", { exact: true })).toBeVisible();

    await viewerPage.reload();
    await openReport(viewerPage, "EVA Comparison");
    await viewerPage.getByLabel("Diff", { exact: true }).click();
    await expect(
      viewerPage.getByRole("button", { name: new RegExp(`${ids.campaign}: Planned set`) })
    ).toBeVisible();
    await expect(metricCells(viewerPage, "Total action time")).toHaveText([
      "23",
      "6",
      "0",
      "0",
      "23",
      "6",
    ]);
    await openReport(viewerPage, "EVA STM Coverage");
    await viewerPage.getByLabel("Diff", { exact: true }).click();
    await expect(coverageCell(viewerPage)).toHaveAttribute(
      "data-tooltip-html",
      /0 matching actions/
    );
    await openReport(viewerPage, "POI Traceability");
    await expect(
      viewerPage
        .getByRole("region", { name: "Reference POI action trace" })
        .getByText("Action: Live renamed sample", { exact: true })
    ).toBeVisible();
    const final = await mission.read();
    expect(final.reportCampaigns[campaign!.uuid].memberEvaUuids).toEqual([mission.ids.evaA]);
    expect(final.stmRules[ids.rule].verbUuids).toEqual([ids.verbCollect]);
    expect(final.actions[mission.ids.actionA]).toMatchObject({
      name: "Live renamed sample",
      duration: 17,
    });
  } finally {
    await viewerContext?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
