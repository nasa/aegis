import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

async function withPeer(
  browser: Browser,
  context: BrowserContext,
  baseURL: string | undefined,
  mission: BehavioralMission
): Promise<{ peerContext: BrowserContext; peer: Page }> {
  const peerContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  await mission.open(peer);
  return { peerContext, peer };
}

test.describe("same-field concurrent station saves", () => {
  for (const fieldCase of [
    {
      label: "Station",
      property: "name" as const,
      candidates: ["Main client station winner", "Peer client station winner"] as const,
      followupLabel: "Station Description",
      followupProperty: "description" as const,
      followupValue: "Saved while peer is offline",
    },
    {
      label: "Station Description",
      property: "description" as const,
      candidates: ["Main client description", "Peer client description"] as const,
      followupLabel: "Station",
      followupProperty: "name" as const,
      followupValue: "Renamed while peer is offline",
    },
  ]) {
    test(`converges concurrent ${fieldCase.label.toLowerCase()} saves across disconnect and reload`, async ({
      page,
      browser,
      context,
      baseURL,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningStation(page, "Alpha station");
      const { peerContext, peer } = await withPeer(browser, context, baseURL, mission);
      try {
        await enablePlanningEditMode(peer);
        await selectPlanningStation(peer, "Alpha station");
        const mainDialog = await openPlanningField(page, fieldCase.label);
        const peerDialog = await openPlanningField(peer, fieldCase.label);
        await mainDialog.getByLabel(fieldCase.label, { exact: true }).fill(fieldCase.candidates[0]);
        await peerDialog.getByLabel(fieldCase.label, { exact: true }).fill(fieldCase.candidates[1]);
        await Promise.all([
          mainDialog.getByText("Save", { exact: true }).click(),
          peerDialog.getByText("Save", { exact: true }).click(),
        ]);

        await expect
          .poll(async () => {
            const saved = (await mission.read()).stations[mission.ids.stationA][fieldCase.property];
            if (!(fieldCase.candidates as readonly string[]).includes(saved ?? "")) {
              return null;
            }
            const mainValue = await planningField(page, fieldCase.label).textContent();
            const peerValue = await planningField(peer, fieldCase.label).textContent();
            return mainValue === saved && peerValue === saved ? saved : null;
          })
          .not.toBeNull();
        const converged = (await mission.read()).stations[mission.ids.stationA];
        const winner = converged[fieldCase.property];
        expect(fieldCase.candidates).toContain(winner);
        await expect(planningField(page, fieldCase.label)).toHaveText(winner);
        await expect(planningField(peer, fieldCase.label)).toHaveText(winner);

        const withoutConflictValue = ({
          [fieldCase.property]: _conflictValue,
          updatedAt: _updatedAt,
          ...rest
        }: typeof converged) => rest;
        expect(withoutConflictValue(converged)).toEqual(
          withoutConflictValue(before.stations[mission.ids.stationA])
        );

        await peerContext.setOffline(true);
        await expect(peer.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
          "data-tooltip-content",
          "Offline: Editing Disabled"
        );
        await savePlanningField(page, fieldCase.followupLabel, fieldCase.followupValue);
        await expect
          .poll(
            async () =>
              (await mission.read()).stations[mission.ids.stationA][fieldCase.followupProperty]
          )
          .toBe(fieldCase.followupValue);
        await peerContext.setOffline(false);
        await expect(planningField(peer, fieldCase.followupLabel)).toHaveText(
          fieldCase.followupValue
        );
        await expect(planningField(peer, fieldCase.label)).toHaveText(winner);

        await page.reload();
        await peer.reload();
        const finalName = fieldCase.property === "name" ? winner : fieldCase.followupValue;
        await selectPlanningStation(page, finalName);
        await selectPlanningStation(peer, finalName);
        await expect(planningField(page, fieldCase.label)).toHaveText(winner);
        await expect(planningField(peer, fieldCase.label)).toHaveText(winner);
        await expect(planningField(page, fieldCase.followupLabel)).toHaveText(
          fieldCase.followupValue
        );
        await expect(planningField(peer, fieldCase.followupLabel)).toHaveText(
          fieldCase.followupValue
        );
        const after = await mission.read();
        expect(after.stations[mission.ids.stationA][fieldCase.property]).toBe(winner);
        expect(after.stations[mission.ids.stationA][fieldCase.followupProperty]).toBe(
          fieldCase.followupValue
        );
        expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
        expect(after.evas).toEqual(before.evas);
        expect(after.actions).toEqual(before.actions);
        const withoutDerivedNameAndTimestamp = (traverse: Traverse) => {
          const { name: _name, updatedAt: _updatedAt, ...payload } = traverse;
          return payload;
        };
        expect(Object.keys(after.traverses).sort()).toEqual(Object.keys(before.traverses).sort());
        for (const uuid of Object.keys(before.traverses)) {
          expect(withoutDerivedNameAndTimestamp(after.traverses[uuid])).toEqual(
            withoutDerivedNameAndTimestamp(before.traverses[uuid])
          );
        }
        const finalStationName = fieldCase.property === "name" ? winner : fieldCase.followupValue;
        expect(after.traverses[mission.ids.traverseOutbound].name).toBe(
          `Lander Egress to ${finalStationName}`
        );
        expect(after.traverses[mission.ids.traverseA].name).toBe(
          `${finalStationName} to Bravo station`
        );
      } finally {
        await peerContext.close();
      }
    });
  }
});
