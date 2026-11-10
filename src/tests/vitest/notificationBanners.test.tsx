import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import NotificationBanners from "pages/admin/notificationBanners";
import {
  createNotificationBanner,
  getAllNotificationBanners,
  updateNotificationBanner,
} from "http-client/notificationBanner";

vi.mock("http-client/login", () => ({
  isLoggedIn: async () => ({ status: "success", data: { isSuperAdmin: true } }),
}));
vi.mock("http-client/mission", () => ({
  getMissionSummaries: async () => ({ status: "success", data: [] as MissionSummary[] }),
}));
vi.mock("http-client/notificationBanner", () => ({
  getAllNotificationBanners: vi.fn(),
  createNotificationBanner: vi.fn(async (banner) => ({ status: "success", data: banner })),
  updateNotificationBanner: vi.fn(async (id: number, banner: NotificationBanner) => ({
    status: "success",
    data: { ...banner, id },
  })),
  deleteNotificationBanner: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

const button = (label: string) => {
  const match = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === label
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
};

const fill = async (id: string, value: string) => {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  const existingBanner: NotificationBanner = {
    id: 1,
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: "2026-10-31T12:00:00Z",
    updatedAt: "2026-10-31T12:00:00Z",
    message: "Existing banner",
    enabled: true,
    startsAt: null,
    endsAt: "2026-11-01T12:00:00Z",
    scope: "application",
    missionIds: [],
    backgroundColor: "#1D4ED8",
    textColor: "#FFFFFF",
  };
  vi.mocked(getAllNotificationBanners).mockResolvedValue({
    status: "success",
    message: "",
    data: [
      { ...existingBanner, id: 2, message: "Before edited banner", endsAt: "2026-11-10T12:00:02Z" },
      existingBanner,
      { ...existingBanner, id: 3, message: "After edited banner", endsAt: null },
    ],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <NotificationBanners />
      </MemoryRouter>
    )
  );
  await act(async () => button("New Banner").click());
  await fill("banner-message", "Scheduled maintenance");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("shows time errors below both pickers immediately and blocks invalid saves", async () => {
  const start = container.querySelector<HTMLInputElement>("#banner-starts-at")!;
  const end = container.querySelector<HTMLInputElement>("#banner-ends-at")!;
  await act(async () => {
    start.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  });
  await fill("banner-starts-at", "2026-11-12T12:00");
  await fill("banner-ends-at", "2026-11-11T12:00");

  const error = container.querySelector("#banner-time-error")!;
  expect(error.textContent).toBe("End time must be after start time.");
  expect(start.compareDocumentPosition(error)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(end.compareDocumentPosition(error)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(end.getAttribute("aria-describedby")).toBe("banner-time-error");
  await act(async () => button("Save").click());
  expect(createNotificationBanner).not.toHaveBeenCalled();

  await fill("banner-ends-at", "2026-11-12T12:00");
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be after start time."
  );
  await fill("banner-ends-at", "2026-11-13T12:00");
  expect(container.querySelector("#banner-time-error")).toBeNull();
  await act(async () => button("Save").click());
  expect(createNotificationBanner).toHaveBeenCalledOnce();
});

test("rejects an already-expired end with an immediate start and clears it for no end time", async () => {
  const end = container.querySelector<HTMLInputElement>("#banner-ends-at")!;
  const noEnd = end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => noEnd.click());
  await fill("banner-ends-at", "2026-11-01T12:00");
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );
  await act(async () => button("Save").click());
  expect(createNotificationBanner).not.toHaveBeenCalled();

  await act(async () => noEnd.click());
  expect(container.querySelector("#banner-time-error")).toBeNull();
  await act(async () => button("Save").click());
  expect(createNotificationBanner).toHaveBeenCalledWith(expect.objectContaining({ endsAt: null }));
});

test("rechecks the clock on save when a new banner's end time has passed", async () => {
  const end = container.querySelector<HTMLInputElement>("#banner-ends-at")!;
  await act(async () =>
    end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  );
  await fill("banner-ends-at", "2026-11-12T12:00");
  expect(container.querySelector("#banner-time-error")).toBeNull();

  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  await act(async () => button("Save").click());
  expect(createNotificationBanner).not.toHaveBeenCalled();
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );
});

test("editing checks the current time rather than the banner's creation time", async () => {
  await act(async () => button("Cancel").click());
  vi.setSystemTime(new Date("2026-11-10T10:42"));
  const expiredBanner = Array.from(container.querySelectorAll("main section")).find((section) =>
    section.textContent?.includes("Existing banner")
  )!;
  await act(async () => expiredBanner.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelector("textarea")!.value).toBe("Existing banner");
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );

  await fill("banner-ends-at", "2026-11-10T10:41");
  await act(async () => button("Save").click());
  expect(updateNotificationBanner).not.toHaveBeenCalled();
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );

  await fill("banner-ends-at", "2026-11-10T10:43");
  expect(container.querySelector("#banner-time-error")).toBeNull();

  vi.setSystemTime(new Date("2026-11-10T10:44"));
  await act(async () => button("Save").click());
  expect(updateNotificationBanner).not.toHaveBeenCalled();
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );

  await fill("banner-ends-at", "2026-11-10T10:45");
  await act(async () => button("Save").click());
  expect(updateNotificationBanner).toHaveBeenCalledOnce();
  expect(updateNotificationBanner).toHaveBeenCalledWith(1, expect.any(Object));
});

test("edits in place without a duplicate and preserves the position on cancel and save", async () => {
  await act(async () => button("Cancel").click());
  const sections = () => Array.from(container.querySelectorAll("main section"));
  const editMiddle = () => sections()[1].querySelector<HTMLButtonElement>("button")!.click();
  await act(async () => editMiddle());

  expect(sections()).toHaveLength(3);
  expect(sections()[0].textContent).toContain("Before edited banner");
  expect(sections()[1].querySelector("textarea")).not.toBeNull();
  expect(sections()[1].querySelector("h2")!.textContent).toBe("Edit Banner 1");
  expect(sections()[1].querySelector("dl")).toBeNull();
  expect(sections()[2].textContent).toContain("After edited banner");
  await fill("banner-message", "Unsaved changes");
  await act(async () => button("Cancel").click());
  expect(sections()).toHaveLength(3);
  expect(sections()[1].textContent).toContain("Existing banner");

  await act(async () => editMiddle());
  await fill("banner-message", "Saved inline");
  const enabledToggle = Array.from(sections()[1].querySelectorAll("button")).find(
    (element) => element.textContent === "Disable"
  )!;
  await act(async () => enabledToggle.click());
  expect(enabledToggle.textContent).toBe("Enable");
  expect(sections()[1].querySelector("h2")!.textContent).toContain("Disabled");
  const end = container.querySelector<HTMLInputElement>("#banner-ends-at")!;
  await act(async () =>
    end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  );
  await act(async () => button("Save").click());
  expect(sections()).toHaveLength(3);
  expect(sections()[1].textContent).toContain("Saved inline");
  expect(updateNotificationBanner).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ enabled: false })
  );
  expect(sections()[1].textContent).toContain("Disabled");
  expect(sections()[1].querySelector("textarea")).toBeNull();
});

test("list times bracket UTC and countdowns update through expiry alongside status", async () => {
  await act(async () => button("Cancel").click());
  const card = container.querySelector("main section")!;
  const endRow = Array.from(card.querySelectorAll("dt")).find(
    (dt) => dt.textContent === "Ends"
  )!.parentElement!;
  expect(endRow.textContent).toMatch(/\[.*UTC\]/);
  expect(endRow.textContent).toContain("Expires in 0h 0m 2s");
  expect(card.querySelector("h2")!.textContent).toContain("Active");

  await act(async () => vi.advanceTimersByTime(1000));
  expect(endRow.textContent).toContain("Expires in 0h 0m 1s");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(endRow.textContent).not.toContain("Expires in");
  expect(endRow.textContent).toContain("Expired");
  expect(card.querySelector("h2")!.textContent).toContain("Expired");
  const noEndCard = container.querySelectorAll("main section")[2];
  expect(noEndCard.textContent).toContain("No end time");
  expect(noEndCard.textContent).not.toContain("Expires in");
});

test("editor countdown follows the selected end time and updates validation at expiry", async () => {
  const end = container.querySelector<HTMLInputElement>("#banner-ends-at")!;
  await act(async () =>
    end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  );
  vi.setSystemTime(new Date("2026-11-10T10:42:58"));
  await fill("banner-ends-at", "2026-11-10T10:43");
  await act(async () => vi.advanceTimersByTime(1000));
  const group = end.closest("label") ?? end.parentElement!.parentElement!;
  expect(group.textContent).toContain("Expires in 0h 0m 1s");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(group.textContent).toContain("Expired");
  expect(container.querySelector("#banner-time-error")!.textContent).toBe(
    "End time must be in the future."
  );

  await fill("banner-ends-at", "2026-11-10T10:45");
  expect(group.textContent).toContain("Expires in 0h 2m 0s");
  expect(container.querySelector("#banner-time-error")).toBeNull();
  await act(async () =>
    end.parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  );
  expect(group.textContent).not.toContain("Expires in");
});
