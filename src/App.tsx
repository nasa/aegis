import React, { useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { Navigate, useParams } from "react-router";
import Home from "pages/index";
import Mission from "pages/mission";
import Dashboard from "pages/dashboard";
import VersionCheck from "pages/versionCheck";
import AdminHome from "pages/admin/index";
import AdminExport from "pages/admin/export";
import AdminMissions from "pages/admin/missions";
import AdminMission from "pages/admin/mission";
import AdminMissionLayers from "pages/admin/missionLayers";
import AdminMissionSTM from "pages/admin/missionSTM";
import AdminMissionDuplicate from "pages/admin/missionDuplicate";
import AdminUser from "pages/admin/user";
import ServerSocketStatus from "pages/admin/serverSocketStatus";
import Emss from "pages/admin/emss";
import MaestroV2 from "pages/admin/maestroV2";
import EnvironmentConfig from "pages/admin/environmentConfig";
import ManageAutomergeDoc from "pages/admin/automerge";
import { useAppDispatch } from "utils/useAppDispatch";
import { setLaunchpadUser } from "store/user";
import { setClientAppVersion } from "store/connection";
import { clientLogger } from "utils/logging/clientLogger";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import appStyles from "./App.module.css";
import { resolveAutomergeMission } from "http-client/docListing";

const TestMapPerformant = React.lazy(() => import("pages/testMapPerformant"));

/**
 * Route wrapper for the admin mission detail page.
 *
 * The admin route includes the Automerge URL as an optional path segment so
 * that deep links can be bookmarked with a stable, human-readable reference.
 * This wrapper resolves the *current* canonical URL from the server before
 * rendering `AdminMission`, and redirects to the updated URL whenever the
 * stored URL has changed (e.g. after a database restore cutover).
 *
 * Renders nothing while the resolution is in flight.
 */
const AdminMissionRoute = (): React.ReactElement => {
  const params = useParams<{ id: string; automergeUrl?: string }>();
  const missionId = Number(params.id);
  const [resolution, setResolution] = useState<MissionResolution | null>(null);

  useEffect(() => {
    resolveAutomergeMission(missionId).then((response) => {
      if (response.status === "success" && response.data) setResolution(response.data);
    });
  }, [missionId]);

  if (!resolution) return null;
  // If the URL in the path is stale, redirect to the resolved URL before rendering.
  if (params.automergeUrl !== resolution.automergeUrl) {
    return (
      <Navigate
        replace
        to={`/admin/mission/${missionId}/${encodeURIComponent(resolution.automergeUrl)}`}
      />
    );
  }
  return <AdminMission />;
};

const App = (props: { launchpadUser: LaunchpadUser | Error }): React.ReactElement => {
  const dispatch = useAppDispatch();
  const databaseEpochStale = useAppSelector(
    (state) => state.connection.databaseEpochStale,
    refEqual
  );
  if (!(props.launchpadUser instanceof Error)) {
    dispatch(setLaunchpadUser(props.launchpadUser));
  }

  // These values are from the vite.config.mts file and are set at build time
  dispatch(
    setClientAppVersion({
      version: __APP_VERSION__,
      gitCommit: __GIT_COMMIT__,
    })
  );
  clientLogger.info({
    logId: "appVersion",
    version: `AEGIS Client Version: ${__APP_VERSION__}, Git Commit: ${__GIT_COMMIT__}`,
  });

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/versionCheck" element={<VersionCheck />} />
        <Route path="/mission/:id" element={<Mission />} />
        <Route path="/dashboard/:id" element={<Dashboard />} />
        <Route
          path="/testMapPerformant"
          element={
            <React.Suspense fallback={null}>
              <TestMapPerformant />
            </React.Suspense>
          }
        />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/export/:id" element={<AdminExport />} />
        <Route path="/admin/automerge/:automergeUrl?" element={<ManageAutomergeDoc />} />
        <Route path="/admin/missions" element={<AdminMissions />} />
        <Route path="/admin/mission/:id/:automergeUrl?" element={<AdminMissionRoute />} />
        <Route path="/admin/mission_layers/:id" element={<AdminMissionLayers />} />
        <Route path="/admin/mission_stm/:id" element={<AdminMissionSTM />} />
        <Route path="/admin/mission_duplicate/:id" element={<AdminMissionDuplicate />} />
        <Route path="/admin/user" element={<AdminUser />} />
        <Route path="/admin/serverSocketStatus" element={<ServerSocketStatus />} />
        <Route path="/admin/maestroV2" element={<MaestroV2 />} />
        <Route path="/admin/environmentConfig" element={<EnvironmentConfig />} />
        <Route path="/admin/emss" element={<Emss />} />
      </Routes>
      {/* Restore overlay — shown when handleDatabaseEpoch detects that the
          server has advanced to a new database epoch since this page was
          loaded.  The overlay blocks interaction while the automatic reload
          is pending; the "Reload now" button lets impatient users skip the
          1.5 s delay. */}
      {databaseEpochStale && (
        <div className={appStyles.restoreOverlay} role="alertdialog" aria-modal="true">
          <div className={appStyles.restoreDialog}>
            <h1>Database restored</h1>
            <p>AEGIS is switching this page to the restored mission data.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload now
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
