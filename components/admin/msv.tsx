import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { TextInputField } from "components/form/FormInput";
import { validators } from "utils/formValidators";

//create a type for props to make typescript happy

const { mustBeNumber } = validators;

const MSV: FunctionComponent = () => {
  return (
    <>
      <h4>Initial (MSV)</h4>
      <div className={styles.sectionDiv}>
        <div id="missionDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.mission"
              label={{ label: "Mission Name" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="siteDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.site"
              label={{ label: "Initial Site" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="masterdbDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.masterdb"
              label={{ label: "Master DB" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="latDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.view[0]"
              label={{ label: "Initial Latitude" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="longDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.view[1]"
              label={{ label: "Initial Longitude" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.view[2]"
              label={{ label: "Initial Zoom Level" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="radMajDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.radius.major"
              label={{ label: "Planet Radius Major (meters)" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="radMinDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.radius.minor"
              label={{ label: "Planet Radius Minor (meters)" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="scaleDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.msv.mapscale"
              label={{ label: "Zoom Level of Map Scale" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default MSV;
