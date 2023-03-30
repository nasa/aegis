import _ from "lodash";
import { useState, useEffect, Dispatch, SetStateAction, FunctionComponent } from "react";
import styles from "./admin.module.css";

interface PanelProps {
  config_panels: string[];
  config_panelSettings: MMGIS_PanelSettings;
  setConfig: Dispatch<SetStateAction<Config>>;
}

const Panels: FunctionComponent<PanelProps> = (props: PanelProps) => {
  const [panels, setPanels] = useState({ viewer: false, map: false, globe: false });
  const { config_panels, config_panelSettings, setConfig } = props;

  useEffect(() => {
    if (config_panels) {
      setPanels((prevPanels) => {
        const tempPanels = { ...prevPanels };
        config_panels.forEach((panelString) => {
          tempPanels[panelString] = true;
        });
        return tempPanels;
      });
    }
  }, [config_panels]);

  //handles the onchange when checkboxes are toggled
  function updatePanels(panel: { panelName: string; value: boolean }) {
    //update state
    const updatedPanels = { ...panels, [panel.panelName]: panel.value };
    setPanels(updatedPanels);

    //update parent
    const panelArray = [];
    _.forIn(updatedPanels, (value, key) => {
      if (value) {
        panelArray.push(key);
      }
    });
    setConfig((previousConfig: Config) => {
      return { ...previousConfig, panels: panelArray };
    });
  }

  return (
    <>
      <h4>Panels and Panel Settings</h4>
      <div className={styles.sectionDiv}>
        <div id="viewerDiv">
          <div className={styles.editDiv}>
            <label htmlFor="viewer">Viewer</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="viewer"
              type="checkbox"
              onChange={(e) => {
                updatePanels({ panelName: "viewer", value: e.target.checked });
              }}
              checked={panels.viewer}
            />
          </div>
        </div>
        <div id="mapDiv">
          <div className={styles.editDiv}>
            <label htmlFor="map">Map (mandatory)</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="map"
              type="checkbox"
              onChange={(e) => {
                updatePanels({ panelName: "map", value: e.target.checked });
              }}
              checked={panels.map}
            />
          </div>
        </div>
        <div id="globeDiv">
          <div className={styles.editDiv}>
            <label htmlFor="globe">Globe</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="globe"
              type="checkbox"
              onChange={(e) => {
                updatePanels({ panelName: "globe", value: e.target.checked });
              }}
              checked={panels.globe}
            />
          </div>
        </div>

        <div id="demurlDiv">
          <div className={styles.editDiv}>
            <label htmlFor="demurl">DEM Fallback URL</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="demurl"
              type="text"
              onChange={(e) => {
                setConfig((previousConfig: Config) => {
                  return {
                    ...previousConfig,
                    panelSettings: {
                      ...previousConfig.panelSettings,
                      demFallbackPath: e.target.value,
                    },
                  };
                });
              }}
              value={config_panelSettings?.demFallbackPath}
            />
          </div>
        </div>
        <div id="formatDiv">
          <div className={styles.editDiv}>
            <label htmlFor="format">Fallback Format</label>
          </div>
          <div className={styles.editDiv}>
            <select
              id="format"
              onChange={(e) => {
                setConfig((previousConfig: Config) => {
                  return {
                    ...previousConfig,
                    panelSettings: {
                      ...previousConfig.panelSettings,
                      demFallbackFormat: e.target.value === "" ? null : e.target.value,
                    },
                  };
                });
              }}
              value={
                config_panelSettings?.demFallbackFormat
                  ? config_panelSettings.demFallbackFormat
                  : ""
              }
            >
              <option value="" />
              <option value="tms">TMS</option>
              <option value="wtms">WTMS</option>
              <option value="wms">WMS</option>
            </select>
          </div>
        </div>
        <div id="typeDiv">
          <div className={styles.editDiv}>
            <label htmlFor="type">Fallback Type</label>
          </div>
          <div className={styles.editDiv}>
            <select
              id="type"
              onChange={(e) => {
                setConfig((previousConfig: Config) => {
                  return {
                    ...previousConfig,
                    panelSettings: {
                      ...previousConfig.panelSettings,
                      demFallbackType: e.target.value === "" ? null : e.target.value,
                    },
                  };
                });
              }}
              value={
                config_panelSettings?.demFallbackType ? config_panelSettings.demFallbackType : ""
              }
            >
              <option value="" />
              <option value="rgba">RGBA</option>
              <option value="tif">TIF</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
};

export default Panels;
