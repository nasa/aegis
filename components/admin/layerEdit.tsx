import { Dispatch, SetStateAction, FunctionComponent } from "react";
import styles from "./admin.module.css";
import { DisplayTime } from "./helper";

interface LayerProps {
  layer: Layer;
  setLayer: Dispatch<SetStateAction<Layer>>;
}

/** Render a single Layer record from the DB */
const LayerEdit: FunctionComponent<LayerProps> = (props: LayerProps) => {
  if (props.layer?.layerConfig) {
    return (
      <>
        <div id="nameDiv">
          <div className={styles.editDiv}>
            <label htmlFor="name">Layer Name</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="name"
              type="text"
              onChange={(e) => {
                props.setLayer((prevLayer) => {
                  return {
                    ...prevLayer,
                    layerConfig: { ...prevLayer.layerConfig, name: e.target.value },
                  };
                });
              }}
              value={props.layer.layerConfig.name}
            />
          </div>
        </div>
        <div id="opacityDiv">
          <div className={styles.editDiv}>
            <label htmlFor="initialOpacity">Initial Visibility</label>
          </div>
          <div className={styles.editDiv}>
            <select
              id="initialOpacity"
              onChange={(e) => {
                props.setLayer((prevLayer) => {
                  return {
                    ...prevLayer,
                    layerConfig: { ...prevLayer.layerConfig, initialOpacity: +e.target.value },
                  };
                });
              }}
              value={props.layer.layerConfig.initialOpacity}
            >
              <option value="1">True</option>
              <option value="0">False</option>
            </select>
          </div>
        </div>
        <h4>Other Read-Only Values for Header Layer</h4>
        <div id="readOnlyDiv" className={styles.divIndent}>
          DEM Parser: {props.layer.layerConfig.demparser}
          <br />
          Controlled: {props.layer.layerConfig.controlled}
          <br />
          Tile Format: {props.layer.layerConfig.tileformat}
          <div className={styles.divIndent}>
            Time:
            <DisplayTime time={props.layer.layerConfig.time} />
          </div>
          Shape: {props.layer.layerConfig.shape}
          <br />
          Number of SubLayers: {props.layer.layerConfig.sublayers?.length}
          <br />
        </div>
      </>
    );
  } else {
    return <div>No Layer Selected</div>;
  }
};

export default LayerEdit;
