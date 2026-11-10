import type { FunctionComponent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchPath, useLocation } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { getActiveNotificationBanners } from "http-client/notificationBanner";
import { getClientSocket } from "utils/clientSocketHelpers";
import { clientLogger } from "utils/logging/clientLogger";
import styles from "./notificationBannerBar.module.css";

/** Mission id from a mission page URL, or null on every other page. */
export function getMissionIdFromPath(pathname: string): number | null {
  const match = matchPath("/mission/:id", pathname);
  if (!match?.params.id) return null;
  const missionId = Number(match.params.id);
  return Number.isInteger(missionId) ? missionId : null;
}

/** The dashboard is the one page that never shows banners. */
export const isBannerHiddenOnPath = (pathname: string): boolean =>
  matchPath("/dashboard/*", pathname) !== null;

/** Identifies one version of a banner, so editing a dismissed banner shows it again. */
const getDismissKey = (banner: NotificationBanner): string => `${banner.id}:${banner.updatedAt}`;

/**
 * Shows admin-managed notification banners at the top of every page except the dashboard. Mounted once in the app
 * shell so dismissals last until the page is refreshed. Refetches when the route's mission
 * changes, when the server sends `bannersChanged`, and when the socket reconnects. Does not fetch
 * on the dashboard.
 */
const NotificationBannerBar: FunctionComponent = () => {
  const { pathname } = useLocation();
  const missionId = getMissionIdFromPath(pathname);
  const isBannerHidden = isBannerHiddenOnPath(pathname);

  const [banners, setBanners] = useState<NotificationBanner[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());

  // Read by the socket handlers so they always fetch for the current page without reconnecting
  const missionIdRef = useRef(missionId);
  const isBannerHiddenRef = useRef(isBannerHidden);
  // Responses for older requests are dropped so fast navigation cannot show another page's banners
  const latestRequestIdRef = useRef(0);

  const refreshBanners = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    // Pages that never show banners skip the request
    if (isBannerHiddenRef.current) return;
    try {
      const res = await getActiveNotificationBanners(missionIdRef.current);
      if (requestId !== latestRequestIdRef.current) return;
      if (res.status === "success") {
        setBanners(res.data ?? []);
      } else {
        clientLogger.warning({
          logId:
            "notification-banner-bar:refreshBanners:activeBannersRequestReturnedUnsuccessfulStatus",
          logValue: `Failed to load notification banners: ${res.message}`,
        });
      }
    } catch (error) {
      clientLogger.warning({
        logId: "notification-banner-bar:refreshBanners:activeBannersRequestThrewError",
        logValue: `Failed to load notification banners: ${error}`,
      });
    }
  }, []);

  useEffect(() => {
    missionIdRef.current = missionId;
    isBannerHiddenRef.current = isBannerHidden;
    refreshBanners();
  }, [missionId, isBannerHidden, refreshBanners]);

  useEffect(() => {
    const socket = getClientSocket();
    const handleBannersChanged = (): void => {
      refreshBanners();
    };
    socket.on("bannersChanged", handleBannersChanged);
    // Picks up changes made while the socket was disconnected
    socket.io.on("reconnect", handleBannersChanged);
    return () => {
      socket.off("bannersChanged", handleBannersChanged);
      socket.io.off("reconnect", handleBannersChanged);
    };
  }, [refreshBanners]);

  const visibleBanners = banners.filter((banner) => !dismissedKeys.has(getDismissKey(banner)));
  if (isBannerHidden || visibleBanners.length === 0) return null;

  const dismissBanner = (banner: NotificationBanner) => {
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
