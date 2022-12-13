import { Dispatch, FunctionComponent, SetStateAction } from "react";
import styles from "./admin.module.css";

interface ProjectionProps {
  config_projection: MMGIS_Projection;
  setConfig: Dispatch<SetStateAction<Config>>;
}

const Projection: FunctionComponent<ProjectionProps> = (props: ProjectionProps) => {
  return (
    <>
      <h4>Projection</h4>
      <div id="customDiv">
        <div className={styles.editDiv}>
          <label htmlFor="custom">Using Custom Projection</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="custom"
            type="checkbox"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, custom: e.target.checked },
                };
              });
            }} //use a functional/callback in the setter since multiple components will be using this
            checked={props.config_projection?.custom}
          />
        </div>
      </div>
      <div id="epsgDiv">
        <div className={styles.editDiv}>
          <label htmlFor="espg">EPSG (or similar code)</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="espg"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, epsg: e.target.value },
                };
              });
            }}
            value={props.config_projection?.epsg}
          />
        </div>
      </div>
      <div id="projDiv">
        <div className={styles.editDiv}>
          <label htmlFor="proj">Proj4 v2.3.14 String</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="proj"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, proj: e.target.value },
                };
              });
            }}
            value={props.config_projection?.proj}
          />
        </div>
      </div>
      <div id="xmlpathDiv">
        <div className={styles.editDiv}>
          <label htmlFor="xmlpath" title="Path to tilemapresource.xml (from MMGIS home directory)">
            Path to timemapresource.xml
          </label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="xmlpath"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, xmlpath: e.target.value },
                };
              });
            }}
            value={props.config_projection?.xmlpath}
          />
        </div>
      </div>

      <div id="minxDiv">
        <div className={styles.editDiv}>
          <label htmlFor="minx">Bounds MinX</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="minx"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newBounds: string[] = previousConfig.projection.bounds;
                newBounds[0] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, bounds: newBounds },
                };
              });
            }}
            value={props.config_projection?.bounds[0]}
          />
        </div>
      </div>
      <div id="minyDiv">
        <div className={styles.editDiv}>
          <label htmlFor="miny">Bounds MinY</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="miny"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newBounds: string[] = previousConfig.projection.bounds;
                newBounds[1] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, bounds: newBounds },
                };
              });
            }}
            value={props.config_projection?.bounds[1]}
          />
        </div>
      </div>
      <div id="maxxDiv">
        <div className={styles.editDiv}>
          <label htmlFor="maxx">Bounds MaxX</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="maxx"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newBounds: string[] = previousConfig.projection.bounds;
                newBounds[2] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, bounds: newBounds },
                };
              });
            }}
            value={props.config_projection?.bounds[2]}
          />
        </div>
      </div>
      <div id="maxyDiv">
        <div className={styles.editDiv}>
          <label htmlFor="maxy">Bounds MaxY</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="maxy"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newBounds: string[] = previousConfig.projection.bounds;
                newBounds[3] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, bounds: newBounds },
                };
              });
            }}
            value={props.config_projection?.bounds[3]}
          />
        </div>
      </div>
      <div id="originxDiv">
        <div className={styles.editDiv}>
          <label htmlFor="originx">Origin X</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="originx"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newOrigin: string[] = previousConfig.projection.origin;
                newOrigin[0] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, view: newOrigin },
                };
              });
            }}
            value={props.config_projection?.origin[0]}
          />
        </div>
      </div>
      <div id="originyDiv">
        <div className={styles.editDiv}>
          <label htmlFor="originy">Origin Y</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="originy"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                const newOrigin: string[] = previousConfig.projection.origin;
                newOrigin[1] = e.target.value;
                return {
                  ...previousConfig,
                  projection: { ...previousConfig.projection, view: newOrigin },
                };
              });
            }}
            value={props.config_projection?.origin[1]}
          />
        </div>
      </div>
      <div id="zoomDiv">
        <div className={styles.editDiv}>
          <label htmlFor="zoom">At Zoom Level</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="zoom"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: {
                    ...previousConfig.projection,
                    reszoomlevel: parseInt(e.target.value),
                  },
                };
              });
            }}
            value={props.config_projection?.reszoomlevel}
          />
        </div>
      </div>
      <div id="resunitsDiv">
        <div className={styles.editDiv}>
          <label htmlFor="resunits">The Units per Pixel are: </label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="resunits"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  projection: {
                    ...previousConfig.projection,
                    resunitsperpixel: parseInt(e.target.value),
                  },
                };
              });
            }}
            value={props.config_projection?.resunitsperpixel}
          />
        </div>
      </div>
    </>
  );
};

export default Projection;
