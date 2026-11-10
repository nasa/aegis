import type { Request, Response } from "express";

import express from "express";
import { asError } from "@emss/utils";

import { Notification_Banner_db } from "server/database/models/_allModels";
import { globalValues } from "../global";
import { upsertDatabaseRetry } from "utils/database";
import { emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { getBannerTimeError } from "utils/notificationBannerValidation";

/** Notification banner create/update body after validation, with times parsed to Dates. */
type ValidatedNotificationBannerInput = Omit<
  NotificationBanner,
  "id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt" | "startsAt" | "endsAt"
> & {
  startsAt: Date | null;
  endsAt: Date | null;
};

type NotificationBannerValidationResult =
  { ok: true; value: ValidatedNotificationBannerInput } | { ok: false; message: string };

const router = express.Router();

const MAX_MESSAGE_LENGTH = 500;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
// setTimeout overflows above ~24.8 days, so long waits are split into daily wake-ups
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
// Fire slightly after the boundary so `now` is past it when clients re-fetch
const TIMER_MARGIN_MS = 250;
// Incremented by each rescheduleBannerTimer call so overlapping calls create only one timer
let latestBannerTimerScheduleCallNumber = 0;

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /active?missionId=N — banners to display on a page. missionId is omitted on non-mission pages.
router.get("/active", async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");

  let missionId: number | null = null;
  if (req.query.missionId !== undefined) {
    missionId = Number(req.query.missionId);
    if (!Number.isInteger(missionId)) {
      res.status(400).json({ status: "failure", message: "missionId must be an integer" });
      return;
    }
  }

  try {
    const em = globalValues.orm.em;
    const rows = await em.find(Notification_Banner_db, { enabled: true });
    const banners = selectBannersForPage(rows, missionId, new Date()).map(serializeBanner);
    res
      .status(200)
      .json({ status: "success", message: "active notification banners", data: banners });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:GET:errorRetrievingActiveNotificationBanners",
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "notificationBanner",
      appUsername: req.session?.appUser?.username,
      missionId: missionId ?? undefined,
      message: `Error retrieving active notification banners: ${e}`,
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error retrieving active notification banners: ${e}` });
  }
});

// GET / — every banner, including disabled and expired ones, for the admin page
router.get("/", async (req: Request, res: Response): Promise<void> => {
  if (!rejectIfNotSuperAdmin(req, res, "GET")) return;

  try {
    const em = globalValues.orm.em;
    const rows = await em.find(Notification_Banner_db, {}, { orderBy: { createdAt: "desc" } });
    res.status(200).json({
      status: "success",
      message: "notification banners retrieved",
      data: rows.map(serializeBanner),
    });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:GET:errorRetrievingNotificationBanners",
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "notificationBanner",
      appUsername: req.session?.appUser?.username,
      message: `Error retrieving notification banners: ${e}`,
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error retrieving notification banners: ${e}` });
  }
});

// POST / — create a banner
router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!rejectIfNotSuperAdmin(req, res, "POST")) return;

  try {
    const now = new Date();
    const validation = validateBannerInput(req.body, now);
    if (validation.ok === false) {
      res.status(400).json({ status: "failure", message: validation.message });
      return;
    }

    const em = globalValues.orm.em;
    const username = getRequestUsername(req);
    const row = em.create(Notification_Banner_db, {
      ...validation.value,
      createdBy: username,
      updatedBy: username,
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(row).flush();

    onBannersChanged();
    res.status(200).json({
      status: "success",
      message: "notification banner created",
      data: serializeBanner(row),
    });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:POST:errorCreatingNotificationBanner",
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "notificationBanner",
      appUsername: req.session?.appUser?.username,
      message: `Error creating notification banner: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error creating notification banner: ${e}` });
  }
});

// POST /:id — replace a banner's editable fields
router.post("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!rejectIfNotSuperAdmin(req, res, "POST")) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ status: "failure", message: "Banner id must be an integer" });
    return;
  }

  try {
    const username = getRequestUsername(req);
    const result = await upsertDatabaseRetry(async () => {
      const em = globalValues.orm.em.fork();
      const row = await em.findOne(Notification_Banner_db, { id });
      if (!row) return { found: false as const };
      const validation = validateBannerInput(req.body);
      if (validation.ok === false) return { found: true as const, error: validation.message };
      em.assign(row, { ...validation.value, updatedBy: username, updatedAt: new Date() });
      await em.flush();
      return { found: true as const, banner: serializeBanner(row) };
    });

    if (!result) {
      serverLogger.apiRoute({
        logId: "api-route:notificationBanner:POST:failedToUpdateAfterOptimisticLockRetries",
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "notificationBanner",
        appUsername: req.session?.appUser?.username,
        message:
          "Failed to update notification banner after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to update notification banner after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message:
          "Failed to update notification banner after multiple tries due to optimistic locking",
      });
      return;
    }
    if (!result.found) {
      res.status(404).json({ status: "failure", message: `Notification banner ${id} not found` });
      return;
    }
    if ("error" in result) {
      res.status(400).json({ status: "failure", message: result.error });
      return;
    }

    onBannersChanged();
    res
      .status(200)
      .json({ status: "success", message: "notification banner updated", data: result.banner });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:POST:errorUpdatingNotificationBanner",
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "notificationBanner",
      appUsername: req.session?.appUser?.username,
      message: `Error updating notification banner: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error updating notification banner: ${e}` });
  }
});

// DELETE /:id — delete a banner
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  if (!rejectIfNotSuperAdmin(req, res, "DELETE")) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ status: "failure", message: "Banner id must be an integer" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    const deletedCount = await em.nativeDelete(Notification_Banner_db, { id });
    if (deletedCount === 0) {
      res.status(404).json({ status: "failure", message: `Notification banner ${id} not found` });
      return;
    }

    onBannersChanged();
    res.status(200).json({ status: "success", message: "notification banner deleted", data: id });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:DELETE:errorDeletingNotificationBanner",
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "notificationBanner",
      appUsername: req.session?.appUser?.username,
      message: `Error deleting notification banner: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error deleting notification banner: ${e}` });
  }
});

export default router;

// ─── Auth helpers ────────────────────────────────────────────────────────────

/** Sends 401 and returns false unless the request is from a super admin or carries EMSS_TOKEN. */
function rejectIfNotSuperAdmin(
  req: Request,
  res: Response,
  httpMethod: "GET" | "POST" | "DELETE"
): boolean {
  const emssToken = req.headers["emss-token"] as string;
  if (req.session?.appUser?.isSuperAdmin || emssTokenIsValid(emssToken)) return true;

  const unauthorizedLogFields = {
    logLevel: "warning",
    httpMethod,
    responseStatus: 401,
    routeName: "notificationBanner",
    appUsername: req.session?.appUser?.username,
    message: "Unauthorized",
  } as const;
  // One logId per method, since logIds must be string literals
  if (httpMethod === "GET") {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:GET:unauthorizedRequestNotSuperAdmin",
      ...unauthorizedLogFields,
    });
  } else if (httpMethod === "POST") {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:POST:unauthorizedRequestNotSuperAdmin",
      ...unauthorizedLogFields,
    });
  } else {
    serverLogger.apiRoute({
      logId: "api-route:notificationBanner:DELETE:unauthorizedRequestNotSuperAdmin",
      ...unauthorizedLogFields,
    });
  }
  res.status(401).json({ status: "failure", message: "Unauthorized" });
  return false;
}

/** Name recorded in createdBy / updatedBy. */
function getRequestUsername(req: Request): string | null {
  if (req.session?.appUser?.username) return req.session.appUser.username;
  if (emssTokenIsValid(req.headers["emss-token"] as string)) return "EMSS_TOKEN";
  return null;
}

// ─── Client notification and time-window timer ──────────────────────────────

/** Tells every client on the default namespace to refetch its banners. */
export const notifyBannerClients = (): void => {
  globalValues.socketio?.emit("bannersChanged");
};

function onBannersChanged(): void {
  notifyBannerClients();
  rescheduleBannerTimer();
}

/**
 * Schedules one timer for the next banner start or end time. When it fires, clients are told to
 * re-fetch, so banners appear and disappear on schedule without a page refresh.
 */
export async function rescheduleBannerTimer(): Promise<void> {
  const scheduleCallNumber = ++latestBannerTimerScheduleCallNumber;

  try {
    // Forked because this also runs outside a request context (boot and timer callbacks)
    const em = globalValues.orm.em.fork();
    const rows = await em.find(Notification_Banner_db, { enabled: true });
    // A newer call started during the query and will set the timer, so only one timer exists
    if (scheduleCallNumber !== latestBannerTimerScheduleCallNumber) return;

    if (globalValues.notificationBannerTimer) {
      clearTimeout(globalValues.notificationBannerTimer);
      globalValues.notificationBannerTimer = null;
    }
    const nextTransition = getNextBannerTransition(rows, new Date());
    if (!nextTransition) return;

    const delayMs = Math.min(
      Math.max(nextTransition.getTime() - Date.now(), 0),
      MAX_TIMER_DELAY_MS
    );
    globalValues.notificationBannerTimer = setTimeout(() => {
      globalValues.notificationBannerTimer = null;
      // A capped daily wake-up can fire before the real boundary; clients then refetch the same list
      notifyBannerClients();
      rescheduleBannerTimer();
    }, delayMs + TIMER_MARGIN_MS);
    // Do not keep the process alive just for this timer
    globalValues.notificationBannerTimer.unref();
  } catch (e) {
    serverLogger.error(
      {
        logId: "notification-banner:rescheduleBannerTimer:failedToScheduleBannerTimer",
        logValue: "Failed to schedule notification banner timer",
      },
      asError(e)
    );
  }
}

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/** True when the banner is enabled and `now` is inside its time window (end is exclusive). */
export function isBannerActive(
  banner: Pick<Notification_Banner_db, "enabled" | "startsAt" | "endsAt">,
  now: Date
): boolean {
  if (!banner.enabled) return false;
  if (banner.startsAt && now < banner.startsAt) return false;
  if (banner.endsAt && now >= banner.endsAt) return false;
  return true;
}

/**
 * Active banners for a page, newest first. Application banners always apply; mission banners
 * apply only when `missionId` (null on non-mission pages) is in their list.
 */
export function selectBannersForPage<
  BannerRow extends Pick<
    Notification_Banner_db,
    "id" | "enabled" | "startsAt" | "endsAt" | "scope" | "missionIds"
  >,
>(banners: BannerRow[], missionId: number | null, now: Date): BannerRow[] {
  return banners
    .filter((banner) => isBannerActive(banner, now))
    .filter(
      (banner) =>
        banner.scope === "application" ||
        (missionId !== null && banner.missionIds.includes(missionId))
    )
    .sort((a, b) => b.id - a.id);
}

/** Earliest start or end time strictly after `now` among enabled banners, or null if none. */
export function getNextBannerTransition(
  banners: Pick<Notification_Banner_db, "enabled" | "startsAt" | "endsAt">[],
  now: Date
): Date | null {
  let next: Date | null = null;
  for (const banner of banners) {
    if (!banner.enabled) continue;
    for (const boundary of [banner.startsAt, banner.endsAt]) {
      if (boundary && boundary > now && (!next || boundary < next)) next = boundary;
    }
  }
  return next;
}

/** Checks and normalizes a create/update request body. Does not check that missions exist. */
export function validateBannerInput(
  body: unknown,
  now: Date = new Date()
): NotificationBannerValidationResult {
  if (!body || typeof body !== "object") return { ok: false, message: "Request body is required" };
  const input = body as Partial<Record<keyof NotificationBanner, unknown>>;

  if (typeof input.message !== "string" || input.message.trim() === "") {
    return { ok: false, message: "Message is required" };
  }
  const message = input.message.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` };
  }

  if (typeof input.enabled !== "boolean") {
    return { ok: false, message: "enabled must be true or false" };
  }

  const startsAt = parseOptionalDate(input.startsAt);
  if (startsAt === undefined) return { ok: false, message: "startsAt must be a date or null" };
  const endsAt = parseOptionalDate(input.endsAt);
  if (endsAt === undefined) return { ok: false, message: "endsAt must be a date or null" };
  const timeError = getBannerTimeError(startsAt, endsAt, now);
  if (timeError) return { ok: false, message: timeError };

  if (input.scope !== "application" && input.scope !== "missions") {
    return { ok: false, message: 'scope must be "application" or "missions"' };
  }

  let missionIds: number[] = [];
  if (input.scope === "missions") {
    if (
      !Array.isArray(input.missionIds) ||
      !input.missionIds.every((missionId) => Number.isInteger(missionId))
    ) {
      return { ok: false, message: "missionIds must be a list of mission ids" };
    }
    missionIds = [...new Set(input.missionIds as number[])].sort((a, b) => a - b);
    if (missionIds.length === 0) {
      return { ok: false, message: "Select at least one mission" };
    }
  }

  if (typeof input.backgroundColor !== "string" || !HEX_COLOR_PATTERN.test(input.backgroundColor)) {
    return { ok: false, message: "Background color must be a hex color like #1D4ED8" };
  }

  if (typeof input.textColor !== "string" || !HEX_COLOR_PATTERN.test(input.textColor)) {
    return { ok: false, message: "Text color must be a hex color like #FFFFFF" };
  }

  return {
    ok: true,
    value: {
      message,
      enabled: input.enabled,
      startsAt,
      endsAt,
      scope: input.scope,
      missionIds,
      backgroundColor: input.backgroundColor.toUpperCase(),
      textColor: input.textColor.toUpperCase(),
    },
  };
}

/** Returns null for null, the Date for a valid date string, and undefined for anything else. */
function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function serializeBanner(row: Notification_Banner_db): NotificationBanner {
  return {
    id: row.id,
    message: row.message,
    enabled: row.enabled,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    // validateBannerInput only stores "application" or "missions"
    scope: row.scope as NotificationBanner["scope"],
    missionIds: row.missionIds,
    backgroundColor: row.backgroundColor,
    textColor: row.textColor,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
