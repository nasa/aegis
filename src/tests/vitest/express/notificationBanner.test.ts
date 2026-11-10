import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  App_User_db,
  Doc_Listing_db,
  Notification_Banner_db,
} from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import {
  getNextBannerTransition,
  isBannerActive,
  rescheduleBannerTimer,
  selectBannersForPage,
  validateBannerInput,
} from "server/express/routes/notificationBanner";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR_MS);

const makeBanner = (
  overrides: Partial<Parameters<typeof selectBannersForPage>[0][number]> = {}
): Parameters<typeof selectBannersForPage>[0][number] => ({
  id: 1,
  enabled: true,
  startsAt: null,
  endsAt: null,
  scope: "application",
  missionIds: [],
  ...overrides,
});

const validInput: NotificationBanner = {
  id: null,
  createdBy: null,
  updatedBy: null,
  createdAt: null,
  updatedAt: null,
  message: "  Vitest maintenance tonight  ",
  enabled: true,
  startsAt: null,
  endsAt: null,
  scope: "application",
  missionIds: [],
  backgroundColor: "#1d4ed8",
  textColor: "#ffffff",
};

describe("isBannerActive", () => {
  test("disabled banner is never active", () => {
    expect(isBannerActive(makeBanner({ enabled: false }), NOW)).toBe(false);
  });

  test("banner with no time window is active", () => {
    expect(isBannerActive(makeBanner(), NOW)).toBe(true);
  });

  test("not active before start, active at start", () => {
    expect(isBannerActive(makeBanner({ startsAt: hoursFromNow(1) }), NOW)).toBe(false);
    expect(isBannerActive(makeBanner({ startsAt: NOW }), NOW)).toBe(true);
  });

  test("active before end, not active at or after end", () => {
    expect(isBannerActive(makeBanner({ endsAt: hoursFromNow(1) }), NOW)).toBe(true);
    expect(isBannerActive(makeBanner({ endsAt: NOW }), NOW)).toBe(false);
    expect(isBannerActive(makeBanner({ endsAt: hoursFromNow(-1) }), NOW)).toBe(false);
  });

  test("active inside a window with both bounds", () => {
    const banner = makeBanner({ startsAt: hoursFromNow(-1), endsAt: hoursFromNow(1) });
    expect(isBannerActive(banner, NOW)).toBe(true);
  });
});

describe("selectBannersForPage", () => {
  const applicationBanner = makeBanner({ id: 1, scope: "application" });
  const missionBanner = makeBanner({ id: 2, scope: "missions", missionIds: [5, 7] });
  const expiredBanner = makeBanner({ id: 3, endsAt: hoursFromNow(-1) });

  test("non-mission pages get only application banners", () => {
    const result = selectBannersForPage([applicationBanner, missionBanner], null, NOW);
    expect(result.map((banner) => banner.id)).toEqual([1]);
  });

  test("mission pages get application banners and their own mission banners, newest first", () => {
    const result = selectBannersForPage([applicationBanner, missionBanner], 7, NOW);
    expect(result.map((banner) => banner.id)).toEqual([2, 1]);
  });

  test("mission banners do not show on other missions", () => {
    const result = selectBannersForPage([missionBanner], 6, NOW);
    expect(result).toEqual([]);
  });

  test("inactive banners are excluded", () => {
    expect(selectBannersForPage([expiredBanner], null, NOW)).toEqual([]);
  });
});

describe("getNextBannerTransition", () => {
  test("returns null when no boundary is in the future", () => {
    expect(getNextBannerTransition([makeBanner()], NOW)).toBeNull();
    expect(getNextBannerTransition([makeBanner({ endsAt: hoursFromNow(-1) })], NOW)).toBeNull();
  });

  test("returns the earliest future start or end", () => {
    const banners = [
      makeBanner({ startsAt: hoursFromNow(5) }),
      makeBanner({ startsAt: hoursFromNow(-2), endsAt: hoursFromNow(3) }),
    ];
    expect(getNextBannerTransition(banners, NOW)).toEqual(hoursFromNow(3));
  });

  test("ignores disabled banners", () => {
    const banners = [makeBanner({ enabled: false, startsAt: hoursFromNow(1) })];
    expect(getNextBannerTransition(banners, NOW)).toBeNull();
  });
});

describe("validateBannerInput", () => {
  test.each([
    [
      "equal start and end",
      { startsAt: hoursFromNow(1).toISOString(), endsAt: hoursFromNow(1).toISOString() },
    ],
    ["end before creation with immediate start", { endsAt: hoursFromNow(-1).toISOString() }],
    ["end at creation", { endsAt: NOW.toISOString() }],
    [
      "past window",
      { startsAt: hoursFromNow(-2).toISOString(), endsAt: hoursFromNow(-1).toISOString() },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(validateBannerInput({ ...validInput, ...overrides }, NOW).ok).toBe(false);
  });

  test("allows an active window whose start is in the past", () => {
    expect(
      validateBannerInput(
        {
          ...validInput,
          startsAt: hoursFromNow(-1).toISOString(),
          endsAt: hoursFromNow(1).toISOString(),
        },
        NOW
      ).ok
    ).toBe(true);
  });

  test("rejects expired edits even if the end follows the original creation time", () => {
    expect(
      validateBannerInput(
        {
          ...validInput,
          createdAt: hoursFromNow(-2).toISOString(),
          endsAt: hoursFromNow(-1).toISOString(),
        },
        NOW
      ).ok
    ).toBe(false);
  });

  test("accepts valid input and normalizes it", () => {
    const result = validateBannerInput(validInput);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.value.message).toBe("Vitest maintenance tonight");
    expect(result.value.backgroundColor).toBe("#1D4ED8");
    expect(result.value.textColor).toBe("#FFFFFF");
    expect(result.value.startsAt).toBeNull();
  });

  test("clears missionIds for application scope and dedupes them for mission scope", () => {
    const applicationResult = validateBannerInput({ ...validInput, missionIds: [3] });
    expect(applicationResult.ok && applicationResult.value.missionIds).toEqual([]);

    const missionResult = validateBannerInput({
      ...validInput,
      scope: "missions",
      missionIds: [4, 2, 4],
    });
    expect(missionResult.ok && missionResult.value.missionIds).toEqual([2, 4]);
  });

  test.each([
    ["empty message", { message: "   " }],
    ["message too long", { message: "x".repeat(501) }],
    ["missing enabled", { enabled: undefined }],
    ["invalid start", { startsAt: "not a date" }],
    ["start after end", { startsAt: hoursFromNow(2).toISOString(), endsAt: NOW.toISOString() }],
    ["unknown scope", { scope: "everyone" }],
    ["mission scope with no missions", { scope: "missions", missionIds: [] }],
    ["non-integer mission id", { scope: "missions", missionIds: ["1"] }],
    ["short hex color", { backgroundColor: "#FFF" }],
    ["color name", { backgroundColor: "blue" }],
    ["text color name", { textColor: "black" }],
    ["short hex text color", { textColor: "#000" }],
  ])("rejects %s", (_label, overrides) => {
    expect(validateBannerInput({ ...validInput, ...overrides }).ok).toBe(false);
  });
});

describe("Notification Banner API Endpoint", () => {
  let testAppUser: App_User_db;
  let testSuperAdmin: App_User_db;
  let missionId: number;
  let otherMissionId: number;
  let userCookies: string[];
  let superAdminCookies: string[];
  const createdBannerIds: number[] = [];
  const emitMock = vi.fn();

  const login = async (username: string): Promise<string[]> => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200);
    return [res.header["set-cookie"][0], res.header["set-cookie"][1]];
  };

  const createBanner = async (input: NotificationBanner): Promise<NotificationBanner> => {
    const res = await supertest(app)
      .post("/api/v1/notificationBanner")
      .set("Cookie", superAdminCookies)
      .send(input);
    expect(res.statusCode).toBe(200);
    createdBannerIds.push(res.body.data.id);
    return res.body.data;
  };

  beforeAll(async () => {
    globalValues.orm = await MikroORM.init(config);
    globalValues.socketio = { emit: emitMock } as unknown as typeof globalValues.socketio;

    const em = globalValues.orm.em.fork();
    testAppUser = await new AppUserFactory(em).createOne({
      username: "Vitest regular appUser for notificationBanner",
    });
    testSuperAdmin = await new AppUserFactory(em).createOne({
      username: "Vitest super admin for notificationBanner",
      isSuperAdmin: true,
    });
    const docListings = await new DocListingFactory(em).create(2, {
      automergeUrl: "automerge:VitestNotificationBannerMission",
    });
    missionId = docListings[0].missionId;
    otherMissionId = docListings[1].missionId;

    userCookies = await login(testAppUser.username);
    superAdminCookies = await login(testSuperAdmin.username);
  });

  afterAll(async () => {
    const em = globalValues.orm.em.fork();
    await em.nativeDelete(Notification_Banner_db, { id: { $in: createdBannerIds } });
    await em.nativeDelete(Doc_Listing_db, { missionId: { $in: [missionId, otherMissionId] } });
    await em.nativeDelete(App_User_db, { id: { $in: [testAppUser.id, testSuperAdmin.id] } });

    if (globalValues.notificationBannerTimer) {
      clearTimeout(globalValues.notificationBannerTimer);
      globalValues.notificationBannerTimer = null;
    }
    globalValues.socketio = null;
    await globalValues.orm.close();
    globalValues.orm = null;
    vi.restoreAllMocks();
  });

  test.each([
    ["GET /", "get", "/api/v1/notificationBanner"],
    ["POST /", "post", "/api/v1/notificationBanner"],
    ["POST /:id", "post", "/api/v1/notificationBanner/1"],
    ["DELETE /:id", "delete", "/api/v1/notificationBanner/1"],
  ] as const)("returns 401 for %s without a session", async (_label, method, path) => {
    const res = await supertest(app)[method](path).send(validInput);
    expect(res.statusCode).toBe(401);
  });

  test("returns 401 for a non-super-admin", async () => {
    const listRes = await supertest(app)
      .get("/api/v1/notificationBanner")
      .set("Cookie", userCookies);
    expect(listRes.statusCode).toBe(401);

    const createRes = await supertest(app)
      .post("/api/v1/notificationBanner")
      .set("Cookie", userCookies)
      .send(validInput);
    expect(createRes.statusCode).toBe(401);
  });

  test("rejects invalid input with 400", async () => {
    const res = await supertest(app)
      .post("/api/v1/notificationBanner")
      .set("Cookie", superAdminCookies)
      .send({ ...validInput, backgroundColor: "blue" });
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe("failure");
  });

  test("a mission id that does not exist is stored and still shows on the other missions", async () => {
    const banner = await createBanner({
      ...validInput,
      scope: "missions",
      missionIds: [missionId, -12345],
    });
    expect(banner.missionIds).toEqual([-12345, missionId]);

    const res = await supertest(app).get(
      `/api/v1/notificationBanner/active?missionId=${missionId}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((row: NotificationBanner) => row.id)).toContain(banner.id);
  });

  test("create notifies clients and records the creator", async () => {
    emitMock.mockClear();
    const banner = await createBanner(validInput);
    expect(banner.message).toBe("Vitest maintenance tonight");
    expect(banner.backgroundColor).toBe("#1D4ED8");
    expect(banner.createdBy).toBe(testSuperAdmin.username);
    expect(emitMock).toHaveBeenCalledWith("bannersChanged");
  });

  test("create rejects a banner that would already be expired", async () => {
    const res = await supertest(app)
      .post("/api/v1/notificationBanner")
      .set("Cookie", superAdminCookies)
      .send({ ...validInput, endsAt: new Date(Date.now() - HOUR_MS).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("End time must be in the future.");
  });

  test("update rejects expired end times until they are moved into the future or removed", async () => {
    const banner = await createBanner(validInput);
    const expiredAt = new Date(Date.now() - HOUR_MS);
    const em = globalValues.orm.em.fork();
    await em.nativeUpdate(
      Notification_Banner_db,
      { id: banner.id },
      {
        createdAt: new Date(expiredAt.getTime() - HOUR_MS),
        endsAt: expiredAt,
      }
    );

    const res = await supertest(app)
      .post(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies)
      .send({ ...banner, endsAt: expiredAt.toISOString(), message: "Updated expired banner" });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("End time must be in the future.");

    const invalidRes = await supertest(app)
      .post(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies)
      .send({ ...banner, endsAt: new Date(expiredAt.getTime() - 2 * HOUR_MS).toISOString() });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.message).toBe("End time must be in the future.");

    const futureRes = await supertest(app)
      .post(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies)
      .send({ ...banner, endsAt: new Date(Date.now() + HOUR_MS).toISOString() });
    expect(futureRes.statusCode).toBe(200);

    const noEndRes = await supertest(app)
      .post(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies)
      .send({ ...banner, endsAt: null });
    expect(noEndRes.statusCode).toBe(200);
  });

  test("/active scopes mission banners to their missions", async () => {
    const applicationBanner = await createBanner(validInput);
    const missionBanner = await createBanner({
      ...validInput,
      scope: "missions",
      missionIds: [missionId],
    });

    const homeRes = await supertest(app).get("/api/v1/notificationBanner/active");
    expect(homeRes.statusCode).toBe(200);
    const homeIds = homeRes.body.data.map((banner: NotificationBanner) => banner.id);
    expect(homeIds).toContain(applicationBanner.id);
    // Full banner objects, the same shape the admin endpoints return
    expect(
      homeRes.body.data.find((banner: NotificationBanner) => banner.id === applicationBanner.id)
    ).toEqual(applicationBanner);
    expect(homeIds).not.toContain(missionBanner.id);

    const missionRes = await supertest(app).get(
      `/api/v1/notificationBanner/active?missionId=${missionId}`
    );
    const missionIds = missionRes.body.data.map((banner: NotificationBanner) => banner.id);
    expect(missionIds).toContain(applicationBanner.id);
    expect(missionIds).toContain(missionBanner.id);

    const otherRes = await supertest(app).get(
      `/api/v1/notificationBanner/active?missionId=${otherMissionId}`
    );
    const otherIds = otherRes.body.data.map((banner: NotificationBanner) => banner.id);
    expect(otherIds).not.toContain(missionBanner.id);
  });

  test("/active rejects a non-integer missionId", async () => {
    const res = await supertest(app).get("/api/v1/notificationBanner/active?missionId=abc");
    expect(res.statusCode).toBe(400);
  });

  test("/active excludes disabled and scheduled banners", async () => {
    const disabledBanner = await createBanner({ ...validInput, enabled: false });
    const scheduledBanner = await createBanner({
      ...validInput,
      startsAt: new Date(Date.now() + HOUR_MS).toISOString(),
    });

    const res = await supertest(app).get("/api/v1/notificationBanner/active");
    const ids = res.body.data.map((banner: NotificationBanner) => banner.id);
    expect(ids).not.toContain(disabledBanner.id);
    expect(ids).not.toContain(scheduledBanner.id);
    // The scheduled banner's start time is the next transition, so a timer is pending
    expect(globalValues.notificationBannerTimer).not.toBeNull();
  });

  test("overlapping timer reschedules leave exactly one banner timer", async () => {
    await createBanner({ ...validInput, startsAt: new Date(Date.now() + HOUR_MS).toISOString() });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      await Promise.all([
        rescheduleBannerTimer(),
        rescheduleBannerTimer(),
        rescheduleBannerTimer(),
      ]);

      // Banner timer callbacks are the only ones that call rescheduleBannerTimer
      const bannerTimers = setTimeoutSpy.mock.calls
        .map(([callback], index) => ({ callback, timer: setTimeoutSpy.mock.results[index].value }))
        .filter(({ callback }) => String(callback).includes("rescheduleBannerTimer"))
        .map(({ timer }) => timer);
      const clearedTimers = new Set(clearTimeoutSpy.mock.calls.map(([timer]) => timer));
      const liveBannerTimers = bannerTimers.filter((timer) => !clearedTimers.has(timer));
      expect(liveBannerTimers).toEqual([globalValues.notificationBannerTimer]);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  test("update changes the banner, updates updatedAt, and notifies clients", async () => {
    const banner = await createBanner(validInput);
    emitMock.mockClear();

    const res = await supertest(app)
      .post(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies)
      .send({ ...validInput, enabled: false, textColor: "#000000" });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.enabled).toBe(false);
    expect(res.body.data.textColor).toBe("#000000");
    expect(res.body.data.updatedAt).not.toBe(banner.updatedAt);
    expect(emitMock).toHaveBeenCalledWith("bannersChanged");
  });

  test("update and delete return 404 for a missing banner", async () => {
    const updateRes = await supertest(app)
      .post("/api/v1/notificationBanner/-1")
      .set("Cookie", superAdminCookies)
      .send(validInput);
    expect(updateRes.statusCode).toBe(404);

    const deleteRes = await supertest(app)
      .delete("/api/v1/notificationBanner/-1")
      .set("Cookie", superAdminCookies);
    expect(deleteRes.statusCode).toBe(404);
  });

  test("delete removes the banner and notifies clients", async () => {
    const banner = await createBanner(validInput);
    emitMock.mockClear();

    const res = await supertest(app)
      .delete(`/api/v1/notificationBanner/${banner.id}`)
      .set("Cookie", superAdminCookies);
    expect(res.statusCode).toBe(200);
    expect(emitMock).toHaveBeenCalledWith("bannersChanged");

    const listRes = await supertest(app)
      .get("/api/v1/notificationBanner")
      .set("Cookie", superAdminCookies);
    const ids = listRes.body.data.map((listed: NotificationBanner) => listed.id);
    expect(ids).not.toContain(banner.id);
  });
});
