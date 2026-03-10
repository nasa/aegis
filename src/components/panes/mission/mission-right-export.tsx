import { FunctionComponent, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Button, Checkbox } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkMakeExportString } from "store/thunk/thunkMission";
import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

const Export_panel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const missionName = useMissionDocSelector((doc) => doc.name, refEqual);

  const [selectEvas, setSelectEvas] = useState(true);
  const [selectMission, setSelectMission] = useState(false);
  const [selectPois, setSelectPois] = useState(false);
  const [selectStations, setSelectStations] = useState(false);
  const [selectActions, setSelectActions] = useState(false);
  const [selectTraverses, setSelectTraverses] = useState(false);
  const [selectRexes, setSelectRexes] = useState(false);

  const exportFile = async () => {
    const output = await dispatch(
      thunkMakeExportString({
        selectEvas,
        selectMission,
        selectPois,
        selectStations,
        selectActions,
        selectTraverses,
        selectRexes,
      })
    );

    const element = document.createElement("a");
    const file = new Blob([output.payload as string], { type: "text/json" });
    element.href = URL.createObjectURL(file);
    let filename = `${missionName}_`;
    if (selectEvas) filename += "evas_";
    if (selectMission) filename += "mission_";
    if (selectPois) filename += "pois_";
    if (selectStations) filename += "stations_";
    if (selectActions) filename += "actions_";
    if (selectTraverses) filename += "traverses_";
    if (selectRexes) filename += "rexes_";
    filename += "export.json";
    element.download = filename;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Data Export</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faFileExport}>Export AEGIS Data</SubpanelHeading>
            </div>
            <div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <Checkbox
                          label="All EVAs (including stations with associated actions and traverses)"
                          checked={selectEvas}
                          onChange={() => setSelectEvas(!selectEvas)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-all-evas"
                        />
                        <Checkbox
                          label="All POIs (including associated actions)"
                          checked={selectPois}
                          onChange={() => setSelectPois(!selectPois)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-pois"
                        />
                        <Checkbox
                          label="All Stations (including associated actions)"
                          checked={selectStations}
                          onChange={() => setSelectStations(!selectStations)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-stations"
                        />
                        <Checkbox
                          label="All Actions (including associated STMs)"
                          checked={selectActions}
                          onChange={() => setSelectActions(!selectActions)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-actions"
                        />
                        <Checkbox
                          label="All Traverses"
                          checked={selectTraverses}
                          onChange={() => setSelectTraverses(!selectTraverses)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-traverses"
                        />
                        <Checkbox
                          label="Mission Details"
                          checked={selectMission}
                          onChange={() => setSelectMission(!selectMission)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-mission"
                        />
                        <Checkbox
                          label="All Real-time Execution Items (REXes)"
                          checked={selectRexes}
                          onChange={() => setSelectRexes(!selectRexes)}
                          labelClassName={missionStyles.exportCheckboxLabel}
                          uniqueId="export-rexes"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                icon={faFileExport}
                label="Export JSON File"
                style={{ width: "135px", marginLeft: "18px", marginTop: "8px" }}
                onClick={() => {
                  exportFile();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Export_panel;
