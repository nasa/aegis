import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { thunkMakeExportRexString } from "store/thunk/thunkRex";

const Export_panel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexName = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid)?.name,
    refEqual
  );

  const exportFile = async () => {
    const output = await dispatch(
      thunkMakeExportRexString({
        rexUuid: selectedRexUuid,
      })
    );

    const element = document.createElement("a");
    const file = new Blob([output.payload as string], { type: "text/json" });
    element.href = URL.createObjectURL(file);
    let filename = `${selectedRexName}_rex_`;
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
              <SubpanelHeading icon={faFileExport}>
                Export this Real-time Execution (including position markers)
              </SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionBody}>
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
