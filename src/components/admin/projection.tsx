import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { FFCheckbox, FFInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";

const { mustBeNumber } = validators;

const Projection: FunctionComponent = () => {
  return (
    <>
      <div className={styles.sectionDiv}>
        <div className={styles.sectionDivHeading}>Map Projection Details</div>
        <div id="customDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name={"projIsCustom"} label={{ label: "Using Custom Projection" }} />
          </div>
        </div>
        <div id="epsgDiv">
          <div className={styles.editDiv}>
            <FFInput name="projEpsg" label={{ label: "Custom: EPSG (or similar code)" }} />
          </div>
        </div>
        <div id="projDiv">
          <div className={styles.editDiv}>
            <FFInput name="projProj4String" label={{ label: "Custom: Proj4 v2.3.14 String" }} />
          </div>
        </div>
        <br />
        <div id="minxDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="projBoundsMinX"
              label={{ label: "Bounds MinX" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="minyDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="projBoundsMinY"
              label={{ label: "Bounds MinY" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="maxxDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="projBoundsMaxX"
              label={{ label: "Bounds MaxX" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="maxyDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="projBoundsMaxY"
              label={{ label: "Bounds MaxY" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="originxDiv">
          <div className={styles.editDiv}>
            <FFInput name="projOriginX" label={{ label: "Origin X" }} validators={[mustBeNumber]} />
          </div>
        </div>
        <div id="originyDiv">
          <div className={styles.editDiv}>
            <FFInput name="projOriginY" label={{ label: "Origin Y" }} validators={[mustBeNumber]} />
          </div>
        </div>
        <br />
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="projResZoomLevel"
              label={{ label: "At Zoom Level" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="projResUnitsPerPixel">
          <div className={styles.editDiv}>
            <FFInput
              name="projResUnitsPerPixel"
              label={{ label: "Units per Pixel" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Projection;
