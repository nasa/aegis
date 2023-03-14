import { Dispatch, FunctionComponent, SetStateAction } from "react";
import styles from "./admin.module.css";

interface LookProps {
  config_look: MMGIS_Look;
  setConfig: Dispatch<SetStateAction<Config>>;
}

const Look: FunctionComponent<LookProps> = (props: LookProps) => {
  return (
    <>
      <h4>Look</h4>
      <div className={styles.sectionDiv}>
        <h5>Rebranding</h5>
        <div id="nameDiv">
          <div className={styles.editDiv}>
            <label htmlFor="name">Page Name</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="name"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, pagename: e.target.value },
                  };
                });
              }} //use a functional/callback in the setter since multiple components will be using this
              value={props.config_look?.pagename}
            />
          </div>
        </div>
        <div id="logoDiv">
          <div className={styles.editDiv}>
            <label htmlFor="logo">Square Logo Image URL</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="logo"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, logourl: e.target.value },
                  };
                });
              }}
              value={props.config_look?.logourl}
            />
          </div>
        </div>

        <h5>User Interface</h5>
        <div id="uiDiv">
          <div className={styles.editDiv}>
            <label htmlFor="ui">Minimalist UI</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="ui"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, minimalist: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.minimalist}
            />
          </div>
        </div>
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <label htmlFor="zoom">Map Zoom Control</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="zoom"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, zoomcontrol: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.zoomcontrol}
            />
          </div>
        </div>
        <div id="graticuleDiv">
          <div className={styles.editDiv}>
            <label htmlFor="graticule">Map Graticule</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="graticule"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, graticule: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.graticule}
            />
          </div>
        </div>

        <h5>Colors</h5>
        <div id="primaryDiv">
          <div className={styles.editDiv}>
            <label htmlFor="primary">Primary Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="primary"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, primarycolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.primarycolor}
            />
          </div>
        </div>
        <div id="secondaryDiv">
          <div className={styles.editDiv}>
            <label htmlFor="secondary">Secondary Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="secondary"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, secondarycolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.secondarycolor}
            />
          </div>
        </div>
        <div id="tertiaryDiv">
          <div className={styles.editDiv}>
            <label htmlFor="tertiary">Tertiary Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="tertiary"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, tertiarycolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.tertiarycolor}
            />
          </div>
        </div>
        <div id="accentDiv">
          <div className={styles.editDiv}>
            <label htmlFor="accent">Accent Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="accent"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, accentcolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.accentcolor}
            />
          </div>
        </div>
        <div id="bodycolorDiv">
          <div className={styles.editDiv}>
            <label htmlFor="bodycolor">Body Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="bodycolor"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, bodycolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.bodycolor}
            />
          </div>
        </div>
        <div id="topbarDiv">
          <div className={styles.editDiv}>
            <label htmlFor="topbar">Top Bar Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="topbar"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, topbarcolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.topbarcolor}
            />
          </div>
        </div>
        <div id="toolbarDiv">
          <div className={styles.editDiv}>
            <label htmlFor="toolbar">ToolBar Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="toolbar"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, toolbarcolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.toolbarcolor}
            />
          </div>
        </div>
        <div id="mapDiv">
          <div className={styles.editDiv}>
            <label htmlFor="map">Map Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="map"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, mapcolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.mapcolor}
            />
          </div>
        </div>
        <div id="highlightDiv">
          <div className={styles.editDiv}>
            <label htmlFor="highlight">Highlight Color</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="highlight"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, highlightcolor: e.target.value },
                  };
                });
              }}
              value={props.config_look?.highlightcolor}
            />
          </div>
        </div>

        <h5>Coordinates</h5>
        <div id="latlongDiv">
          <div className={styles.editDiv}>
            <label htmlFor="latlong">Longitude, Latitude</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="latlong"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordll: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.coordll}
            />
          </div>
        </div>
        <div id="eastnorthDiv">
          <div className={styles.editDiv}>
            <label htmlFor="eastnorth">Easting, Northing</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="eastnorth"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coorden: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.coorden}
            />
          </div>
        </div>
        <div id="relxyDiv">
          <div className={styles.editDiv}>
            <label htmlFor="relxy">Relative x, Y (Z)</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="relxy"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordrxy: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.coordrxy}
            />
          </div>
        </div>
        <div id="relxyzsiteDiv">
          <div className={styles.editDiv}>
            <label htmlFor="relxyzsite">Relative Y, X, (-Z)</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="relxyzsite"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordsite: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.coordsite}
            />
          </div>
        </div>
        <div id="elevationDiv">
          <div className={styles.editDiv}>
            <label htmlFor="elevation">With Elevation</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="elevation"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordelev: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.coordelev}
            />
          </div>
        </div>
        <div id="demURLDiv">
          <div className={styles.editDiv}>
            <label htmlFor="demurl">DEM URL</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="demurl"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordelevurl: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordelevurl}
            />
          </div>
        </div>

        <h5>Coordinate Display Alterations</h5>
        <div id="longOffsetDiv">
          <div className={styles.editDiv}>
            <label htmlFor="longoffset">Longitude Display Offset</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="longoffset"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordlngoffset: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordlngoffset}
            />
          </div>
        </div>
        <div id="latOffsetDiv">
          <div className={styles.editDiv}>
            <label htmlFor="latoffset">Latitude Display Offset</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="latoffset"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordlatoffset: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordlatoffset}
            />
          </div>
        </div>
        <div id="eastOffsetDiv">
          <div className={styles.editDiv}>
            <label htmlFor="eastoffset">Easting Display Offset</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="eastoffset"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordeastoffset: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordeastoffset}
            />
          </div>
        </div>
        <div id="northOffsetDiv">
          <div className={styles.editDiv}>
            <label htmlFor="northoffset">Northing Display Offset</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="northoffset"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordnorthoffset: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordnorthoffset}
            />
          </div>
        </div>
        <div id="eastmultDiv">
          <div className={styles.editDiv}>
            <label htmlFor="eastmult">Easting Display Multiplier</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="eastmult"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordeastmult: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordeastmult}
            />
          </div>
        </div>
        <div id="northmultDiv">
          <div className={styles.editDiv}>
            <label htmlFor="northmult">Northing Display Multiplier</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="northmult"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, coordnorthmult: e.target.value },
                  };
                });
              }}
              value={props.config_look?.coordnorthmult}
            />
          </div>
        </div>

        <h5>Secondary Tools</h5>
        <div id="linkDiv">
          <div className={styles.editDiv}>
            <label htmlFor="link">Copy Link</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="link"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, copylink: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.copylink}
            />
          </div>
        </div>
        <div id="screenDiv">
          <div className={styles.editDiv}>
            <label htmlFor="screen">Screenshot</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="screen"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, screenshot: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.screenshot}
            />
          </div>
        </div>
        <div id="fullscreenDiv">
          <div className={styles.editDiv}>
            <label htmlFor="fullscreen">Fullscreen</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="fullscreen"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, fullscreen: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.fullscreen}
            />
          </div>
        </div>

        <h5>User Help</h5>
        <div id="helpDiv">
          <div className={styles.editDiv}>
            <label htmlFor="help">Help</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="help"
              type="checkbox"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, help: e.target.checked },
                  };
                });
              }}
              checked={props.config_look?.help}
            />
          </div>
        </div>
        <div id="helpurlDiv">
          <div className={styles.editDiv}>
            <label htmlFor="helpurl">Help URL</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="helpurl"
              type="text"
              onChange={(e) => {
                props.setConfig((previousConfig) => {
                  return {
                    ...previousConfig,
                    look: { ...previousConfig.look, helpurl: e.target.value },
                  };
                });
              }}
              value={props.config_look?.helpurl}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Look;
