import { randomUUID } from "node:crypto";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { test as base, expect } from "@playwright/test";
import { Repo } from "@automerge/automerge-repo";
import { authenticatedAutomergeAdapter } from "./authenticatedAutomerge";
import type { ValidateFunction } from "ajv";
import Ajv from "ajv";

import { buildBehavioralMission, MISSION_IDS } from "./missionSeed";
import { installMapObserver } from "./mapAssertions";

export { expect } from "@playwright/test";

let validateSeed: ValidateFunction<Mission> | undefined;

export const test = base.extend<BehavioralFixtures>({
  scenario: ["planning", { option: true }],

  page: async ({ page, mission }, runFixture, testInfo) => {
    // This dependency keeps the mission alive until the browser releases its document.
    testInfo.annotations.push({ type: "mission", description: String(mission.id) });
    await installMapObserver(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    try {
      await runFixture(page);
    } finally {
      try {
        if (pageErrors.length > 0) {
          await testInfo.attach("browser-errors", {
            body: JSON.stringify(pageErrors, null, 2),
            contentType: "application/json",
          });
        }
        if (
          !page.isClosed() &&
          (pageErrors.length > 0 || testInfo.status !== testInfo.expectedStatus)
        ) {
          try {
            await testInfo.attach("behavior-failure", {
              body: await page.screenshot({ timeout: 5000 }),
              contentType: "image/png",
            });
          } catch (error) {
            await testInfo.attach("screenshot-unavailable", {
              body: String(error),
              contentType: "text/plain",
            });
          }
        }
        if (testInfo.status === testInfo.expectedStatus) {
          expect(pageErrors, "The application must not raise uncaught browser errors").toEqual([]);
        }
      } finally {
        await Promise.all(
          page
            .context()
            .pages()
            .filter((openPage) => !openPage.isClosed())
            .map((openPage) => openPage.close())
        );
      }
    }
  },

  mission: async ({ request, baseURL, scenario }, runFixture, testInfo) => {
    const origin = new URL(baseURL ?? "http://localhost:4000");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
      throw new Error("Behavioral fixtures create and delete missions; use a local test server.");
    }

    const response = await request.post("/api/v1/missionAutomerge", { data: {}, timeout: 90000 });
    expect(response.ok(), "Create the isolated mission through the application API").toBe(true);
    const created: WrappedResponse<AutomergeDocListing> = await response.json();
    expect(created.status).toBe("success");
    const listing = created.data;
    expect(listing?.missionId).toBeGreaterThan(0);
    expect(listing?.automergeUrl).toMatch(/^automerge:/);

    let repo: Repo | undefined;
    const id = listing.missionId;
    const name = `Behavior ${testInfo.workerIndex} ${randomUUID()}`;
    const read = async (): Promise<Mission> => {
      const result = await request.get(`/api/v1/missionDump?missionId=${id}`, { timeout: 90000 });
      expect(result.ok(), `Read mission ${id} from the server`).toBe(true);
      const body: WrappedResponse<MissionDump> = await result.json();
      expect(body.status).toBe("success");
      expect(body.data?.missionData?.mission?.id).toBe(id);
      return body.data.missionData.mission;
    };

    try {
      const versionResponse = await request.get("/api/v1/version");
      expect(versionResponse.ok()).toBe(true);
      const version: AppVersion = await versionResponse.json();
      expect(version.serverEpochUuid).toBeTruthy();
      const socketUrl = new URL("/api/automergeSocket/", origin);
      socketUrl.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
      socketUrl.searchParams.set("serverEpochUuid", version.serverEpochUuid);
      repo = new Repo({
        network: [await authenticatedAutomergeAdapter(request, socketUrl.toString())],
      });
      const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl, {
        signal: AbortSignal.timeout(60000),
      });
      const change = async (mutator: (mission: Mission) => void): Promise<void> => {
        handle.change(mutator);
        const expected: Mission = JSON.parse(JSON.stringify(handle.doc()));
        await expect
          .poll(read, {
            message: "Wait for the server to receive the fixture change",
            timeout: 60000,
          })
          .toEqual(expected);
      };
      const blankMission: Mission = JSON.parse(JSON.stringify(handle.doc()));
      const seededMission = buildBehavioralMission(id, name, scenario, blankMission);
      if (!validateSeed) {
        const schemaResponse = await request.get("/api/v1/mission/schema");
        expect(schemaResponse.ok(), "Load the application's current mission schema").toBe(true);
        const schemaBody = await schemaResponse.json();
        expect(schemaBody.status).toBe("success");
        validateSeed = new Ajv({ strict: false, allErrors: true }).compile<Mission>(
          schemaBody.data
        );
      }
      const seedIsValid = validateSeed(seededMission);
      expect(seedIsValid, JSON.stringify(validateSeed.errors)).toBe(true);
      await change((mission) => {
        Object.assign(mission, seededMission);
      });

      await runFixture({
        id,
        name,
        ids: MISSION_IDS,
        url: `/mission/${id}`,
        dashboardUrl: `/dashboard/${id}`,
        docUrl: listing.automergeUrl,
        read,
        change,
        open: async (page) => {
          await page.goto(`/mission/${id}`);
          await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(
            (await read()).name
          );
          await expect(page.locator(".ol-viewport")).toHaveCount(1);
          await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
        },
      });
    } finally {
      try {
        if (testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach("mission-state", {
            body: JSON.stringify(await read(), null, 2),
            contentType: "application/json",
          });
        }
      } finally {
        try {
          await repo?.shutdown();
        } finally {
          const deleted = await request.delete("/api/v1/missionAutomerge", {
            data: { missionIds: [id] },
            timeout: 90000,
          });
          expect(deleted.ok(), `Delete only this test's isolated mission ${id}`).toBe(true);
          const result: WrappedResponse<unknown> = await deleted.json();
          expect(result.status).toBe("success");
        }
      }
    }
  },
});
