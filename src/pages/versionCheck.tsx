import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "components/interface/form/globalFields";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { clientLogger } from "utils/logging/clientLogger";

/**
 * Set a unique timestamp query parameter on a same-origin URL, so the browser
 * cannot serve the response from cache and must revalidate against the server.
 */
export const withRevalidationParam = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("_revalidate", Date.now().toString());
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Un-parseable input should still redirect somewhere sane rather than throw.
    return `/?_revalidate=${Date.now()}`;
  }
};

const VersionCheck: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams();
  const [serverVersion, setServerVersion] = useState<AppVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);

  // The epoch is not a build-time constant: it is whatever the server reported
  // when this page was loaded, seeded into the store during bootstrap.
  const loadedEpoch = useAppSelector(
    (state) => state.connection.clientAppVersion?.serverEpochUuid ?? null,
    refEqual
  );

  const clientVersion: AppVersion = {
    version: __APP_VERSION__,
    gitCommit: __GIT_COMMIT__,
    serverEpochUuid: loadedEpoch,
  };

  // Decode and validate returnUrl to prevent open redirect vulnerabilities
  const getValidatedReturnUrl = (url: string | null): string => {
    if (!url) return "/";

    try {
      const decoded = decodeURIComponent(url);
      const targetUrl = new URL(decoded, window.location.origin);

      // Only allow same-origin redirects
      if (targetUrl.origin === window.location.origin) {
        return decoded;
      }
    } catch (error) {
      clientLogger.warning({
        logId: "versionCheck",
        logValue: `Invalid returnUrl parameter: ${url}`,
      });
    }

    return "/";
  };
  const returnUrl = getValidatedReturnUrl(searchParams.get("returnUrl"));

  // Fetch server version on load.
  useEffect(() => {
    const fetchServerVersion = async () => {
      try {
        const res = await fetch(`/api/v1/version?_=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const version: AppVersion = await res.json();
        setServerVersion(version);
      } catch (error) {
        clientLogger.error(
          { logId: "versionCheck", logValue: "Failed to fetch server version" },
          error instanceof Error ? error : new Error(String(error))
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchServerVersion();
  }, []);

  // Check if versions match.
  const versionsMatch =
    serverVersion &&
    clientVersion.version === serverVersion.version &&
    clientVersion.gitCommit === serverVersion.gitCommit &&
    clientVersion.serverEpochUuid === serverVersion.serverEpochUuid;

  // Countdown timer when versions match
  useEffect(() => {
    if (versionsMatch && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (versionsMatch && countdown === 0) {
      // Redirect when countdown reaches 0.
      window.location.href = withRevalidationParam(returnUrl);
    }
  }, [versionsMatch, countdown, returnUrl]);

  if (isLoading) {
    return (
      <div
        style={{
          color: "white",
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        Checking version...
      </div>
    );
  }

  if (versionsMatch) {
    return (
      <div
        style={{
          color: "white",
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <h1>✓ Version Updated</h1>
        <p>
          An updated version of AEGIS has been loaded. Redirecting you back in {countdown}{" "}
          seconds...
        </p>

        <div>
          Current Version:
          {clientVersion.version} ({clientVersion.gitCommit}) | {clientVersion.serverEpochUuid}
        </div>

        <br />
        <Button
          onClick={() => {
            window.location.href = withRevalidationParam(returnUrl);
          }}
          label="Redirect Now"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        color: "white",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <h1>Refresh Required</h1>
      <p>
        Your version of AEGIS is out of date, or the AEGIS server has been restarted since this page
        was opened. Click the button below to fetch the latest version. If that does not work,
        perform a hard refresh (Ctrl+F5 or Cmd+Shift+R).
      </p>

      <div>
        Your Version: {clientVersion.version}/{clientVersion.gitCommit}
      </div>
      <div>
        Required Version: {serverVersion?.version}/{serverVersion?.gitCommit}
      </div>

      <br />
      <Button
        onClick={() => {
          // Force a fresh load from the server with a unique query parameter
          // to make sure a fresh index.html + bundle are fetched.
          window.location.href = withRevalidationParam(returnUrl);
        }}
        label="Get Latest Version"
      />
    </div>
  );
};

export default VersionCheck;
