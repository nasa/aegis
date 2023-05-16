import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { CheckboxInputField, TextInputField } from "components/form/FormInput";
import { validators } from "utils/formValidators";

const { mustBeNumber } = validators;

const Projection: FunctionComponent = () => {
  return (
    <>
      <h4>Projection</h4>
      <div className={styles.sectionDiv}>
        <div id="customDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name={"config.projection.custom"}
              label={{ label: "Using Custom Projection" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="epsgDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.epsg"
              label={{ label: "EPSG (or similar code)" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="projDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.proj"
              label={{ label: "Proj4 v2.3.14 String" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="xmlpathDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.xmlpath"
              label={{
                title: "Path to tilemapresource.xml (from MMGIS home directory)",
                label: "Path to timemapresource.xml",
              }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <br />
        <div id="minxDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.bounds[0]"
              label={{ label: "Bounds MinX" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="minyDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.bounds[1]"
              label={{ label: "Bounds MinY" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="maxxDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.bounds[2]"
              label={{ label: "Bounds MaxX" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="maxyDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.bounds[3]"
              label={{ label: "Bounds MaxY" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="originxDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.origin[0]"
              label={{ label: "Origin X" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="originyDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.origin[1]"
              label={{ label: "Origin Y" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <br />
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.reszoomlevel"
              label={{ label: "At Zoom Level" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="resunitsDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.projection.resunitsperpixel"
              label={{ label: "The Unity per Pixel are: " }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Projection;
