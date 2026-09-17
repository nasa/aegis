import React from "react";
import { Route, Routes } from "react-router";
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
import AdminUserDetail from "pages/admin/userDetail";
import AdminGroups from "pages/admin/group";
import AdminGroupDetail from "pages/admin/groupDetail";
import AdminKnownUsers from "pages/admin/knownUsers";
import AdminMissionPermissions from "pages/admin/missionPermissions";
import ServerSocketStatus from "pages/admin/serverSocketStatus";
import MaestroV2 from "pages/admin/maestroV2";
import EnvironmentConfig from "pages/admin/environmentConfig";
import ManageAutomergeDoc from "pages/admin/automerge";
import { useAppDispatch } from "utils/useAppDispatch";

import type { FunctionComponent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { getCurrentUserAndAccess } from "http-client/access";
import { setAppUserId, setIsSuperUser, setLaunchpadUser } from "store/user";

const TestMapPerformant = React.lazy(() => import("pages/testMapPerformant"));

const App = (props: { launchpadUser: LaunchpadUser | Error }): React.ReactElement => {
  const dispatch = useAppDispatch();
  if (!(props.launchpadUser instanceof Error)) {
    dispatch(setLaunchpadUser(props.launchpadUser));
  }

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
        {/* Every admin route is superUser-group-only. */}
        <Route
          path="/admin/*"
          element={
            <RequireSuperUser>
              <Routes>
                <Route path="/" element={<AdminHome />} />
                <Route path="export/:id" element={<AdminExport />} />
                <Route path="automerge/:automergeUrl?" element={<ManageAutomergeDoc />} />
                <Route path="missions" element={<AdminMissions />} />
                <Route path="mission/:id/permissions" element={<AdminMissionPermissions />} />
                <Route path="mission/:id/:automergeUrl?" element={<AdminMission />} />
                <Route path="mission_layers/:id" element={<AdminMissionLayers />} />
                <Route path="mission_stm/:id" element={<AdminMissionSTM />} />
                <Route path="mission_duplicate/:id" element={<AdminMissionDuplicate />} />
                <Route path="user" element={<AdminUser />} />
                <Route path="user/:id" element={<AdminUserDetail />} />
                <Route path="group" element={<AdminGroups />} />
                <Route path="group/:id" element={<AdminGroupDetail />} />
                <Route path="knownUsers" element={<AdminKnownUsers />} />
                <Route path="serverSocketStatus" element={<ServerSocketStatus />} />
                <Route path="maestroV2" element={<MaestroV2 />} />
                <Route path="environmentConfig" element={<EnvironmentConfig />} />
              </Routes>
            </RequireSuperUser>
          }
        />
      </Routes>
    </>
  );
};

export default App;

/**
 * Gate for every /admin page. Membership of the reserved superUser group is the only thing that
 * grants admin access; the old per-page isAdmin / isSuperAdmin checks are gone.
 *
 * Renders nothing while resolving and sends non-members back to the homepage, so children only
 * ever mount for a confirmed super user.
 */
const RequireSuperUser: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const access = await getCurrentUserAndAccess();
      if (access instanceof Error || !access.isSuperUser) {
        navigate("/");
        setAllowed(false);
        return;
      }

      dispatch(setLaunchpadUser(access.launchpadUser));
      dispatch(setAppUserId(access.appUser?.id ?? null));
      dispatch(setIsSuperUser(true));
      setAllowed(true);
    })();
  }, [dispatch, navigate]);

  if (!allowed) return null;
  return <>{children}</>;
};
