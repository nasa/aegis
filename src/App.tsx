import React from "react";
import { Route, Routes } from "react-router-dom";
import Home from "pages/index";
import Mission from "pages/mission";
import AdminHome from "pages/admin/index";
import AdminExport from "pages/admin/export";
import AdminMission from "pages/admin/mission";
import AdminPOI from "pages/admin/poi";
import AdminUser from "pages/admin/user";

const App = (): React.ReactElement => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/mission/:id" element={<Mission />} />
      <Route path="/admin" element={<AdminHome />} />
      <Route path="/admin/export" element={<AdminExport />} />
      <Route path="/admin/mission" element={<AdminMission />} />
      <Route path="/admin/poi" element={<AdminPOI />} />
      <Route path="/admin/user" element={<AdminUser />} />
    </Routes>
  );
};

export default App;
