import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { FFCheckbox, FFInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";

const { mustBeNumber } = validators;

const Projection: FunctionComponent = () => {
  return (
    <>
      <h4>Projection</h4>
      <div className={styles.sectionDiv}>
        <div id="customDiv">
          <div className={styles.editDiv}>
            <FFCheckbox
              name={"config.projection.custom"}
              label={{ label: "Using Custom Projection" }}
            />
          </div>
        </div>
        <div id="epsgDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.projection.epsg" label={{ label: "EPSG (or similar code)" }} />
          </div>
        </div>
        <div id="projDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.projection.proj" label={{ label: "Proj4 v2.3.14 String" }} />
          </div>
        </div>
        <div id="xmlpathDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.xmlpath"
              label={{
                title: "Path to tilemapresource.xml (from MMGIS home directory)",
                label: "Path to timemapresource.xml",
              }}
            />
          </div>
        </div>
        <br />
        <div id="minxDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.bounds[0]"
              label={{ label: "Bounds MinX" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="minyDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.bounds[1]"
              label={{ label: "Bounds MinY" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="maxxDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.bounds[2]"
              label={{ label: "Bounds MaxX" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="maxyDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.bounds[3]"
              label={{ label: "Bounds MaxY" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="originxDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.origin[0]"
              label={{ label: "Origin X" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="originyDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.origin[1]"
              label={{ label: "Origin Y" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.reszoomlevel"
              label={{ label: "At Zoom Level" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="resunitsDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.projection.resunitsperpixel"
              label={{ label: "The Unity per Pixel are: " }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Projection;
