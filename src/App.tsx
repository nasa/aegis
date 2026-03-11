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
import AdminMissionGrid from "components/admin/gridUpload";
import AdminMissionDuplicate from "pages/admin/missionDuplicate";
import AdminUser from "pages/admin/user";
import ServerSocketStatus from "pages/admin/serverSocketStatus";
import Emss from "pages/admin/emss";
import ManageAutomergeDoc from "pages/admin/automerge";
import { useAppDispatch } from "utils/useAppDispatch";
import { setLaunchpadUser } from "store/user";
import { setAppVersion } from "store/connection";

const App = (props: { launchpadUser: LaunchpadUser | Error }): React.ReactElement => {
  const dispatch = useAppDispatch();
  if (!(props.launchpadUser instanceof Error)) {
    dispatch(setLaunchpadUser(props.launchpadUser));
  }

  // These values are from the vite.config.mts file and are set at build time
  dispatch(
    setAppVersion({
      version: __APP_VERSION__,
      gitCommit: __GIT_COMMIT__,
    })
  );
  console.log(`AEGIS Version: ${__APP_VERSION__}, Git Commit: ${__GIT_COMMIT__}`);

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/versionCheck" element={<VersionCheck />} />
        <Route path="/mission/:id" element={<Mission />} />
        <Route path="/dashboard/:id" element={<Dashboard />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/export/:id" element={<AdminExport />} />
        <Route path="/admin/automerge/:automergeUrl?" element={<ManageAutomergeDoc />} />
        <Route path="/admin/missions" element={<AdminMissions />} />
        <Route path="/admin/mission/:id/:automergeUrl?" element={<AdminMission />} />
        <Route path="/admin/mission_layers/:id" element={<AdminMissionLayers />} />
        <Route path="/admin/mission_stm/:id" element={<AdminMissionSTM />} />
        <Route path="/admin/mission_grid/:id" element={<AdminMissionGrid />} />
        <Route path="/admin/mission_duplicate/:id" element={<AdminMissionDuplicate />} />
        <Route path="/admin/user" element={<AdminUser />} />
        <Route path="/admin/serverSocketStatus" element={<ServerSocketStatus />} />
        <Route path="/admin/emss" element={<Emss />} />
      </Routes>
    </>
  );
};

export default App;
