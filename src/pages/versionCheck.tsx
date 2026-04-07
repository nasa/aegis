import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "components/interface/form/globalFields";
import { clientLogger } from "utils/logging/clientLogger";

const VersionCheck: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams();
  const [serverVersion, setServerVersion] = useState<AppVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);

  const clientVersion: AppVersion = {
    version: __APP_VERSION__,
    gitCommit: __GIT_COMMIT__,
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

  // Fetch server version on load
  useEffect(() => {
    const fetchServerVersion = async () => {
      try {
        const res = await fetch(`/api/v1/version`);
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

  // Check if versions match
  const versionsMatch =
    serverVersion &&
    clientVersion.version === serverVersion.version &&
    clientVersion.gitCommit === serverVersion.gitCommit;

  // Countdown timer when versions match
  useEffect(() => {
    if (versionsMatch && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (versionsMatch && countdown === 0) {
      // Redirect when countdown reaches 0
      window.location.href = returnUrl;
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
        <h1>✓ Version Up to Date</h1>
        <p>Your version of AEGIS is current. Redirecting you back in {countdown} seconds...</p>

        <div>
          Current Version:
          {clientVersion.version} ({clientVersion.gitCommit})
        </div>

        <br />
        <Button
          onClick={() => {
            window.location.href = returnUrl;
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
      <h1>Version Update Required</h1>
      <p>
        Your version of AEGIS is out of date. Please perform a hard refresh (Ctrl+F5 or Cmd+Shift+R)
        to update to the latest version.
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
          window.location.reload();
        }}
        label="Refresh Page Now"
      />
    </div>
  );
};

export default VersionCheck;
