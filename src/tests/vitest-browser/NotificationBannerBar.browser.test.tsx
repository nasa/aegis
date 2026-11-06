import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { page } from "vitest/browser";
import NotificationBannerBar, {
  getMissionIdFromPath,
  isBannerHiddenOnPath,
} from "components/page/notificationBannerBar";
import { getActiveNotificationBanners } from "http-client/notificationBanner";
import { getClientSocket } from "utils/clientSocketHelpers";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

vi.mock("http-client/notificationBanner", () => ({
  getActiveNotificationBanners: vi.fn(),
}));

// Captures the handlers the banner registers so tests can fire socket events
const socketHandlers = new Map<string, () => void>();
const managerHandlers = new Map<string, () => void>();
vi.mock("utils/clientSocketHelpers", () => ({
  getClientSocket: vi.fn(() => ({
    on: (event: string, handler: () => void) => socketHandlers.set(event, handler),
    off: (event: string) => socketHandlers.delete(event),
    disconnect: vi.fn(),
    io: {
      on: (event: string, handler: () => void) => managerHandlers.set(event, handler),
      off: (event: string) => managerHandlers.delete(event),
    },
  })),
}));

const makeBanner = (overrides: Partial<NotificationBanner> = {}): NotificationBanner => ({
  id: 1,
  message: "Vitest maintenance tonight",
  enabled: true,
  startsAt: null,
  endsAt: null,
  scope: "application",
  missionIds: [],
  backgroundColor: "#B91C1C",
  textColor: "#FFFFFF",
  createdBy: "Vitest super admin",
  updatedBy: "Vitest super admin",
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  ...overrides,
});

const mockBanners = (banners: NotificationBanner[]) =>
  vi.mocked(getActiveNotificationBanners).mockResolvedValue({
    status: "success",
    message: "",
    data: banners,
  });

let harness: ReactHarness;
beforeEach(() => {
  vi.clearAllMocks();
  socketHandlers.clear();
  managerHandlers.clear();
  harness = createReactHarness();
});
afterEach(() => {
  harness.unmount();
});

const renderAt = (path: string) =>
  harness.render(
    <MemoryRouter initialEntries={[path]}>
      <NotificationBannerBar />
    </MemoryRouter>
  );

describe("getMissionIdFromPath", () => {
  it("reads the mission id from mission pages only", () => {
    expect(getMissionIdFromPath("/mission/12")).toBe(12);
    expect(getMissionIdFromPath("/dashboard/3")).toBeNull();
    expect(getMissionIdFromPath("/")).toBeNull();
    expect(getMissionIdFromPath("/admin/mission/12")).toBeNull();
    expect(getMissionIdFromPath("/mission/abc")).toBeNull();
  });
});

describe("isBannerHiddenOnPath", () => {
  it("hides banners on the dashboard page only", () => {
    expect(isBannerHiddenOnPath("/dashboard/3")).toBe(true);
    expect(isBannerHiddenOnPath("/mission/3")).toBe(false);
    expect(isBannerHiddenOnPath("/")).toBe(false);
    expect(isBannerHiddenOnPath("/admin/notificationBanners")).toBe(false);
  });
});

describe("NotificationBannerBar", () => {
  it("renders nothing when there are no banners", async () => {
    mockBanners([]);
    renderAt("/");
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledWith(null));
    expect(harness.container.querySelector("[data-testid='notification-banner']")).toBeNull();
  });

  it("fetches mission banners for the mission in the URL", async () => {
    mockBanners([]);
    renderAt("/mission/7");
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledWith(7));
  });

  it("renders nothing on the dashboard page even when banners are active", async () => {
    mockBanners([makeBanner()]);
    renderAt("/dashboard/7");
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledWith(null));
    await expect.element(page.getByTestId("notification-banner")).not.toBeInTheDocument();
  });

  it("renders each banner with its colors and end time", async () => {
    mockBanners([
      makeBanner({ id: 2, message: "Second", endsAt: "2026-11-04T00:00:00.000Z" }),
      makeBanner({ id: 1, message: "First", backgroundColor: "#FACC15", textColor: "#000000" }),
    ]);
    renderAt("/mission/1");

    const banners = page.getByTestId("notification-banner");
    await expect.element(banners.first()).toHaveTextContent("Second");
    await expect.element(banners.nth(1)).toHaveTextContent("First");
    await expect.element(banners.nth(1)).toHaveStyle({
      backgroundColor: "rgb(250, 204, 21)",
      color: "rgb(0, 0, 0)",
    });
  });

  it("refetches when the server sends bannersChanged and on socket reconnect", async () => {
    mockBanners([]);
    renderAt("/");
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledTimes(1));
    expect(getClientSocket).toHaveBeenCalledTimes(1);

    mockBanners([makeBanner({ message: "Live update" })]);
    socketHandlers.get("bannersChanged")();
    await expect.element(page.getByTestId("notification-banner")).toHaveTextContent("Live update");

    managerHandlers.get("reconnect")();
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledTimes(3));
  });

  it("removes its handlers on unmount without disconnecting the shared socket", async () => {
    mockBanners([]);
    renderAt("/");
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledTimes(1));
    const sharedSocket = vi.mocked(getClientSocket).mock.results[0].value;

    harness.unmount();

    expect(socketHandlers.has("bannersChanged")).toBe(false);
    expect(managerHandlers.has("reconnect")).toBe(false);
    expect(sharedSocket.disconnect).not.toHaveBeenCalled();
  });

  it("hides a dismissed banner until the banner is edited", async () => {
    mockBanners([makeBanner()]);
    renderAt("/");
    const banner = page.getByTestId("notification-banner");
    await expect.element(banner).toBeInTheDocument();

    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect.element(banner).not.toBeInTheDocument();

    // Same version again: stays dismissed
    socketHandlers.get("bannersChanged")();
    await vi.waitFor(() => expect(getActiveNotificationBanners).toHaveBeenCalledTimes(2));
    await expect.element(banner).not.toBeInTheDocument();

    // Edited banner has a new updatedAt: shows again
    mockBanners([makeBanner({ message: "Edited", updatedAt: "2026-11-03T13:00:00.000Z" })]);
    socketHandlers.get("bannersChanged")();
    await expect.element(banner).toHaveTextContent("Edited");
  });
});
