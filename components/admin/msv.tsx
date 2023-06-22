import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { FFInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";

//create a type for props to make typescript happy

const { mustBeNumber } = validators;

const MSV: FunctionComponent = () => {
  return (
    <>
      <h4>Initial (MSV)</h4>
      <div className={styles.sectionDiv}>
        <div id="missionDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.msv.mission" label={{ label: "Mission Name" }} />
          </div>
        </div>
        <div id="siteDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.msv.site" label={{ label: "Initial Site" }} />
          </div>
        </div>
        <div id="masterdbDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.msv.masterdb" label={{ label: "Master DB" }} />
          </div>
        </div>
        <div id="latDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.view[0]"
              label={{ label: "Initial Latitude" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="longDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.view[1]"
              label={{ label: "Initial Longitude" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.view[2]"
              label={{ label: "Initial Zoom Level" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="radMajDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.radius.major"
              label={{ label: "Planet Radius Major (meters)" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="radMinDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.radius.minor"
              label={{ label: "Planet Radius Minor (meters)" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="scaleDiv">
          <div className={styles.editDiv}>
            <FFInput
              name="config.msv.mapscale"
              label={{ label: "Zoom Level of Map Scale" }}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default MSV;
