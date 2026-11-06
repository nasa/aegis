import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { clearCurrentUser } from "packages/getCurrentUser";
import { createReactHarness } from "./map/helpers/reactBrowserHarness";

test("the real bootstrap aborts on a failed version dependency and displays only its safe startup diagnostic", async () => {
  const harness = createReactHarness();
  harness.container.id = "root";
  const unexpected: string[] = [];
  const restricted = "RESTRICTED_CONFIG_SENTINEL";
  const versionRequests = vi.fn();
  clearCurrentUser();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    if (url.pathname === "/api/v1/user/current") {
      return Response.json({ user: { auid: "startup-fixture", display_name: "Browser fixture" } });
    }
    if (url.pathname === "/api/v1/version") {
      versionRequests();
      expect(init).toMatchObject({ cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      return Response.json(
        { error: "version dependency unavailable", diagnostic: restricted },
        { status: 503 }
      );
    }
    unexpected.push(url.pathname);
    throw new Error(`Unexpected bootstrap request: ${url}`);
  });
  try {
    await expect(import("../../index")).rejects.toThrow("Unable to fetch server version: 503");
    await expect
      .element(
        page.getByText("Unable to reach the AEGIS server. Please refresh to try again.", {
          exact: true,
        })
      )
      .toBeVisible();
    expect(document.body.textContent).not.toContain(restricted);
    expect(document.body.textContent).not.toContain("version dependency unavailable");
    expect(harness.container.querySelector(".ol-viewport")).toBeNull();
    expect(versionRequests).toHaveBeenCalledOnce();
    expect(unexpected).toEqual([]);
  } finally {
    harness.unmount();
    clearCurrentUser();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
