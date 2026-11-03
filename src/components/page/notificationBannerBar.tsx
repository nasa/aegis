import type { FunctionComponent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchPath, useLocation } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { getActiveNotificationBanners } from "http-client/notificationBanner";
import { createClientSocket } from "utils/clientSocketHelpers";
import { clientLogger } from "utils/logging/clientLogger";
import styles from "./notificationBannerBar.module.css";

// Pages whose banners include the mission-scoped banners for the :id in the URL
const MISSION_PAGE_PATTERNS = ["/mission/:id", "/dashboard/:id"];

/** Mission id from a mission or dashboard URL, or null on every other page. */
export function getMissionIdFromPath(pathname: string): number | null {
  for (const pattern of MISSION_PAGE_PATTERNS) {
    const match = matchPath(pattern, pathname);
    if (match?.params.id) {
      const missionId = Number(match.params.id);
      return Number.isInteger(missionId) ? missionId : null;
    }
  }
  return null;
}

/** Formats a UTC ISO time in the viewer's local time zone, including the zone name. */
export function formatBannerTime(isoTime: string, timeZone?: string): string {
  return new Date(isoTime).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  });
}

/** Identifies one version of a banner, so editing a dismissed banner shows it again. */
const getDismissKey = (banner: ActiveNotificationBanner): string =>
  `${banner.id}:${banner.updatedAt}`;

/**
 * Shows admin-managed notification banners at the top of every page. Mounted once in the app
 * shell so dismissals last until the page is refreshed. Refetches when the route's mission
 * changes, when the server sends `bannersChanged`, and when the socket reconnects.
 */
const NotificationBannerBar: FunctionComponent = () => {
  const { pathname } = useLocation();
  const missionId = getMissionIdFromPath(pathname);

  const [banners, setBanners] = useState<ActiveNotificationBanner[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());

  // Read by the socket handlers so they always fetch for the current page without reconnecting
  const missionIdRef = useRef(missionId);
  // Responses for older requests are dropped so fast navigation cannot show another page's banners
  const latestRequestIdRef = useRef(0);

  const refreshBanners = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    try {
      const res = await getActiveNotificationBanners(missionIdRef.current);
      if (requestId !== latestRequestIdRef.current) return;
      if (res.status === "success") {
        setBanners(res.data ?? []);
      } else {
        clientLogger.warning({
          logId: "notificationBanner",
          logValue: `Failed to load notification banners: ${res.message}`,
        });
      }
    } catch (error) {
      clientLogger.warning({
        logId: "notificationBanner",
        logValue: `Failed to load notification banners: ${error}`,
      });
    }
  }, []);

  useEffect(() => {
    missionIdRef.current = missionId;
    refreshBanners();
  }, [missionId, refreshBanners]);

  useEffect(() => {
    // Default namespace; this socket never sends visitorJoin, so it is not counted as a visitor
    const socket = createClientSocket(window.location.origin);
    const handleBannersChanged = (): void => {
      refreshBanners();
    };
    socket.on("bannersChanged", handleBannersChanged);
    // Picks up changes made while the socket was disconnected
    socket.io.on("reconnect", handleBannersChanged);
    return () => {
      socket.off("bannersChanged", handleBannersChanged);
      socket.io.off("reconnect", handleBannersChanged);
      socket.disconnect();
    };
  }, [refreshBanners]);

  const visibleBanners = banners.filter((banner) => !dismissedKeys.has(getDismissKey(banner)));
  if (visibleBanners.length === 0) return null;

  const dismissBanner = (banner: ActiveNotificationBanner) => {
    setDismissedKeys((previous) => new Set(previous).add(getDismissKey(banner)));
  };

  return (
    <div className={styles.bannerStack}>
      {visibleBanners.map((banner) => (
        <div
          key={banner.id}
          role="status"
          className={styles.banner}
          style={{ backgroundColor: banner.backgroundColor, color: banner.textColor }}
          data-testid="notification-banner"
        >
          <div className={styles.bannerText}>
            <span className={styles.bannerMessage}>{banner.message}</span>
            {banner.endsAt && (
              <span className={styles.bannerEndTime}>Until {formatBannerTime(banner.endsAt)}</span>
            )}
          </div>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => dismissBanner(banner)}
            aria-label="Dismiss notification"
            title="Dismiss until the page is refreshed"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationBannerBar;
