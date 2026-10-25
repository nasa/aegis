import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

const savedUsers = async (request: APIRequestContext) => {
  const response = await request.get("/api/v1/appUsers");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as WrappedResponse<AppUser[]>).data;
};

test("401, 403, and 500 user-save failures preserve the open form and recover without duplicate creation", async ({
  page,
  context,
  request,
}) => {
  const usernames = [401, 403, 500].map((status) => `Request recovery ${status} ${randomUUID()}`);
  let currentUsernameIndex = 0;

  try {
    await page.goto("/admin/user");
    await expect(page.getByRole("heading", { name: "User Management", exact: true })).toBeVisible();

    for (const status of [401, 403, 500] as const) {
      const username = usernames[currentUsernameIndex++];
      const password = `recovery-password-${status}`;
      await page.getByRole("button", { name: "+ Add User", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Create User", exact: true })).toBeVisible();
      await page.getByLabel("Username", { exact: true }).fill(username);
      await page.getByLabel("Password", { exact: true }).fill(password);

      let postRequests = 0;
      await page.route("**/api/v1/appUsers", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        postRequests++;
        if (postRequests === 1 && status !== 401) {
          await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ status: "failure", message: `Injected ${status} failure` }),
          });
          return;
        }
        await route.continue();
      });

      // Exercise a genuinely expired browser session on 401; the server rejects the request.
      // 403/500 are injected at the same protected save boundary.
      await context.clearCookies();
      let alertMessage = "";
      page.once("dialog", async (dialog) => {
        alertMessage = dialog.message();
        await dialog.accept();
      });
      const failedResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && response.url().endsWith("/api/v1/appUsers")
      );
      await page.getByRole("button", { name: "Create", exact: true }).click();
      const failedResponse = await failedResponsePromise;
      expect(failedResponse.status()).toBe(status);
      await expect
        .poll(() => alertMessage)
        .toContain(status === 401 ? "Unauthorized" : `${status}`);
      await expect(page.getByRole("heading", { name: "Create User", exact: true })).toBeVisible();
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue(username);
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue(password);
      await expect(page.getByText("Error updating user", { exact: true })).toBeVisible();
      expect((await savedUsers(request)).filter((user) => user.username === username)).toEqual([]);

      // Re-establish the same super-admin session without closing the open dialog.
      const restoredSession = await page.request.post("/api/v1/auth/login", {
        data: {
          username: process.env.PLAYWRIGHT_USERNAME,
          password: "playwrightpassword",
        },
      });
      expect(restoredSession.ok()).toBe(true);
      expect(await restoredSession.json()).toMatchObject({
        status: "success",
        data: { isSuperAdmin: true },
      });

      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Edit User", exact: true })).toBeVisible();
      await expect(page.getByText("User created successfully", { exact: true })).toBeVisible();
      expect(postRequests).toBe(2);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      const persisted = (await savedUsers(request)).filter((user) => user.username === username);
      expect(persisted).toHaveLength(1);

      await page.unroute("**/api/v1/appUsers");
    }
  } finally {
    const createdUsers = (await savedUsers(request)).filter((user) =>
      usernames.includes(user.username)
    );
    if (createdUsers.length > 0) {
      const deleted = await request.delete("/api/v1/appUsers", {
        data: { userIds: createdUsers.map((user) => user.id) },
      });
      expect(deleted.ok()).toBe(true);
    }
  }
});
