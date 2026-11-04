import type { Response } from "@playwright/test";
import { expect } from "@playwright/test";

/** The streamed HTTP response stays 200; its final event carries the operation result. */
export async function duplicationResult(response: Response): Promise<WrappedResponse<number>> {
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/x-ndjson");
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events[0]).toMatchObject({
    type: "progress",
    message: "Loading source mission...",
    elapsedSeconds: expect.any(Number),
  });
  expect(events.at(-1)).toHaveProperty("status");
  return events.at(-1);
}
