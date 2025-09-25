import React from "react";
import { Route, Routes } from "react-router";
import Home from "pages/index";
import Mission from "pages/mission";
import Dashboard from "pages/dashboard";
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
import { EnsureLogin } from "packages/EnsureLogin";

const App = (): React.ReactElement => {
  return (
    <>
      <EnsureLogin />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mission/:id" element={<Mission />} />
        <Route path="/dashboard/:id" element={<Dashboard />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/export/:id" element={<AdminExport />} />
        <Route path="/admin/missions" element={<AdminMissions />} />
        <Route path="/admin/mission/:id" element={<AdminMission />} />
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
