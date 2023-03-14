import { Dispatch, FunctionComponent, SetStateAction } from "react";
import styles from "./admin.module.css";

//create a type for props to make typescript happy
interface MSVProps {
  config_msv: MMGIS_Msv;
  setConfig: Dispatch<SetStateAction<Config>>;
}

const MSV: FunctionComponent<MSVProps> = (props: MSVProps) => {
  return (
    <>
      <h4>Initial (MSV)</h4>
      <div className={styles.sectionDiv}>
        <div id="missionDiv">
          <div className={styles.editDiv}>
            <label htmlFor="mission">Mission Name</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="mission"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, mission: e.target.value },
                  };
                });
              }} //use a functional/callback in the setter since multiple components will be using this
              value={props.config_msv?.mission}
            />
          </div>
        </div>
        <div id="siteDiv">
          <div className={styles.editDiv}>
            <label htmlFor="site">Initial Site</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="site"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, site: e.target.value },
                  };
                });
              }}
              value={props.config_msv?.site}
            />
          </div>
        </div>
        <div id="masterdbDiv">
          <div className={styles.editDiv}>
            <label htmlFor="masterdb">Master DB</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="masterdb"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, masterdb: e.target.checked },
                  };
                });
              }}
              checked={props.config_msv?.masterdb}
            />
          </div>
        </div>
        <div id="latDiv">
          <div className={styles.editDiv}>
            <label htmlFor="lat">Initial Latitude</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="lat"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  const newView: string[] = previousConfig.msv.view;
                  newView[0] = e.target.value;
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, view: newView },
                  };
                });
              }}
              value={props.config_msv?.view[0]}
            />
          </div>
        </div>
        <div id="longDiv">
          <div className={styles.editDiv}>
            <label htmlFor="long">Initial Longitude</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="long"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  const newView: string[] = previousConfig.msv.view;
                  newView[1] = e.target.value;
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, view: newView },
                  };
                });
              }}
              value={props.config_msv?.view[1]}
            />
          </div>
        </div>
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <label htmlFor="zoom">Initial Zoom Level</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="zoom"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  const newView: string[] = previousConfig.msv.view;
                  newView[2] = e.target.value;
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, view: newView },
                  };
                });
              }}
              value={props.config_msv?.view[2]}
            />
          </div>
        </div>
        <div id="radMajDiv">
          <div className={styles.editDiv}>
            <label htmlFor="radMaj">Planet Radius Major (meters)</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="radMaj"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  const newRadius = previousConfig.msv.radius;
                  newRadius.major = e.target.value;
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, radius: newRadius },
                  };
                });
              }}
              value={props.config_msv?.radius?.major}
            />
          </div>
        </div>
        <div id="radMinDiv">
          <div className={styles.editDiv}>
            <label htmlFor="radMin">Planet Radius Minor (meters)</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="radMin"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  const newRadius = previousConfig.msv.radius;
                  newRadius.minor = e.target.value;
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, radius: newRadius },
                  };
                });
              }}
              value={props.config_msv?.radius?.minor}
            />
          </div>
        </div>
        <div id="scaleDiv">
          <div className={styles.editDiv}>
            <label htmlFor="scale">Zoom Level of Map Scale</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="scale"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    msv: { ...previousConfig.msv, mapscale: e.target.value },
                  };
                });
              }}
              value={props.config_msv?.mapscale}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default MSV;
