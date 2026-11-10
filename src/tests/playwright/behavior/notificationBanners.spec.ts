import { test, expect } from "../fixtures/behavioralTest";

test("live banner signals respect mission scope and an edit restores a dismissed message", async ({
  page,
  mission,
  request,
}) => {
  await mission.open(page);
  const peer = await page.context().newPage();
  await mission.open(peer);
  let banner: NotificationBanner | undefined;
  const message = `Mission advisory ${mission.id}`;
  try {
    const response = await request.post("/api/v1/notificationBanner", {
      data: {
        message,
        enabled: true,
        startsAt: null,
        endsAt: null,
        scope: "missions",
        missionIds: [mission.id],
        backgroundColor: "#1D4ED8",
        textColor: "#FFFFFF",
      },
    });
    expect(response.ok()).toBe(true);
    const result: WrappedResponse<NotificationBanner> = await response.json();
    expect(result.status).toBe("success");
    banner = result.data;
    const visible = page.getByTestId("notification-banner").filter({ hasText: message });
    const peerVisible = peer.getByTestId("notification-banner").filter({ hasText: message });
    await expect(visible).toBeVisible();
    await expect(peerVisible).toBeVisible();
    await visible.getByRole("button", { name: "Dismiss notification", exact: true }).click();
    await expect(visible).toHaveCount(0);
    await expect(peerVisible).toBeVisible();
    const updatedMessage = `${message} - revised`;
    const updated = await request.post(`/api/v1/notificationBanner/${banner.id}`, {
      data: { ...banner, message: updatedMessage },
    });
    expect(updated.ok()).toBe(true);
    await expect(
      page.getByTestId("notification-banner").filter({ hasText: updatedMessage })
    ).toBeVisible();
    await expect(
      peer.getByTestId("notification-banner").filter({ hasText: updatedMessage })
    ).toBeVisible();
    await peer.goto("/");
    await expect(peer.getByText("Select a Mission", { exact: true })).toBeVisible();
    const active = await request.get("/api/v1/notificationBanner/active");
    expect(active.ok()).toBe(true);
    const applicationBanners: WrappedResponse<NotificationBanner[]> = await active.json();
    expect(applicationBanners.data.map((b) => b.id)).not.toContain(banner.id);
    await expect(
      peer.getByTestId("notification-banner").filter({ hasText: updatedMessage })
    ).toHaveCount(0);
    const deleted = await request.delete(`/api/v1/notificationBanner/${banner.id}`);
    expect(deleted.ok()).toBe(true);
    banner = undefined;
    await expect(
      page.getByTestId("notification-banner").filter({ hasText: updatedMessage })
    ).toHaveCount(0);
  } finally {
    if (banner) {
      const cleanup = await request.delete(`/api/v1/notificationBanner/${banner.id}`);
      expect(cleanup.ok(), "Remove only this test's notification banner").toBe(true);
    }
  }
});
