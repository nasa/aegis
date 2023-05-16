import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { CheckboxInputField, SelectInputField, TextInputField } from "components/form/FormInput";

const Panels: FunctionComponent = () => {
  return (
    <>
      <h4>Panels and Panel Settings</h4>
      <div className={styles.sectionDiv}>
        <div id="viewerDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="panelValues.viewer"
              label={{ label: "Viewer" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="mapDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="panelValues.map"
              label={{ label: "Map" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="globeDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="panelValues.globe"
              label={{ label: "Globe" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="demurlDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="panelSettings.demFallbackPath"
              label={{ label: "DEM Fallback URL" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="formatDiv">
          <div className={styles.editDiv}>
            <label htmlFor="format">Fallback Format</label>
          </div>
          <div className={styles.editDiv}>
            <SelectInputField
              name="panelSettings.demFallbackFormat"
              label={{ label: "Fallback Format" }}
              className={styles.editDiv}
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
            <SelectInputField
              name="panelSettings.demFallbackType"
              label={{ label: "Fallback Type" }}
              className={styles.editDiv}
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
