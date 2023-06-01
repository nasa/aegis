import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { FFCheckbox, FFSelect, FFInput } from "components/interface/form/globalFields";

const Panels: FunctionComponent = () => {
  return (
    <>
      <h4>Panels and Panel Settings</h4>
      <div className={styles.sectionDiv}>
        <div id="viewerDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name="panelValues.viewer" label={{ label: "Viewer" }} />
          </div>
        </div>
        <div id="mapDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name="panelValues.map" label={{ label: "Map" }} />
          </div>
        </div>
        <div id="globeDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name="panelValues.globe" label={{ label: "Globe" }} />
          </div>
        </div>
        <div id="demurlDiv">
          <div className={styles.editDiv}>
            <FFInput name="panelSettings.demFallbackPath" label={{ label: "DEM Fallback URL" }} />
          </div>
        </div>
        <div id="formatDiv">
          <div className={styles.editDiv}>
            <label htmlFor="format">Fallback Format</label>
          </div>
          <div className={styles.editDiv}>
            <FFSelect
              name="panelSettings.demFallbackFormat"
              label={{ label: "Fallback Format" }}
              options={[
                { value: "", label: "" },
                { value: "tms", label: "TMS" },
                { value: "wtms", label: "WTMS" },
              ]}
            />
          </div>
        </div>
        <div id="typeDiv">
          <div className={styles.editDiv}>
            <label htmlFor="type">Fallback Type</label>
          </div>
          <div className={styles.editDiv}>
            <FFSelect
              name="panelSettings.demFallbackType"
              label={{ label: "Fallback Type" }}
              options={[
                { value: "", label: "" },
                { value: "rbga", label: "RGBA" },
                { value: "tif", label: "TIF" },
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Panels;
