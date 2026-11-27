import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Observe the profile supplied to the UI after the real API request settles. */
export async function readTerrainProfile(page: Page, uuid: string): Promise<TerrainProfile> {
  const read = () =>
    page.evaluate(async (uuid) => {
      const modulePath = "/store/index.ts";
      const { default: store } = await import(modulePath);
      return store.getState().terrainProfiles.profiles[uuid];
    }, uuid);
  await expect.poll(async () => (await read())?.status).toBe("ready");
  return (await read()).profile;
}
