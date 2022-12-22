import { Dispatch, SetStateAction, FunctionComponent, useState, useEffect } from "react";
import styles from "./admin.module.css";
import { JSONEditor } from "./helper";
import { MMGIS_LayerProperties, getLayerProperty } from "./layerProperties";

interface SublayerProps {
  sublayerIndex: number;
  sublayer: MMGIS_Sublayer;
  setLayer: Dispatch<SetStateAction<Layer>>;
}

/** Render a single Layer record from the DB */
const SublayerEdit: FunctionComponent<SublayerProps> = (props: SublayerProps) => {
  const { sublayerIndex, sublayer, setLayer } = props;
  const [sublayerView, setSublayerview] = useState<MMGIS_LayerProperties>(null);

  //refresh the fields when the prop changes
  useEffect(() => {
    if (sublayer) {
      setSublayerview(getLayerProperty(sublayer.type));
    } else {
      setSublayerview(getLayerProperty("tile"));
    }
  }, [sublayer]);

  function saveSublayer(sublayer: MMGIS_Sublayer) {
    setLayer((prevLayer) => {
      //replace our new sublayer into the existing sublayer array
      const newSublayers: MMGIS_Sublayer[] = prevLayer.layerConfig.sublayers.map(
        (element: MMGIS_Sublayer, index: number) => {
          return index === sublayerIndex ? sublayer : element;
        }
      );

      return {
        ...prevLayer,
        layerConfig: {
          ...prevLayer.layerConfig,
          sublayers: newSublayers,
        },
      };
    });
  }

  function setVariables(jsonValue: JSON) {
    saveSublayer({ ...sublayer, variables: jsonValue });
  }
  function setVtLayer(jsonValue: JSON) {
    saveSublayer({ ...sublayer, style: { ...sublayer.style, vtLayer: jsonValue } });
  }

  if (sublayerView) {
    return (
      <>
        {sublayerView?.type && (
          <div id="typeDiv">
            <div className={styles.editDiv}>
              <label htmlFor="layerType">Layer Type</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="layerType"
                onChange={(e) => {
                  // setSublayerview(getLayerProperty(e.target.value as MMGIS_layerTypes));
                  saveSublayer({ ...sublayer, type: e.target.value as MMGIS_layerTypes });
                }}
                value={sublayer.type}
              >
                <option value="tile">Tile</option>
                <option value="vector">Vector</option>
                <option value="vectortile">Vector Tile</option>
                <option value="query">Query</option>
                <option value="data">Data</option>
                <option value="model">Model</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView?.name && (
          <div id="nameDiv">
            <div className={styles.editDiv}>
              <label htmlFor="name">Sublayer Name</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="name"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, name: e.target.value });
                }}
                value={sublayer.name || ""}
              />
            </div>
          </div>
        )}

        {sublayerView?.type && (
          <div id="kindDiv">
            <div className={styles.editDiv}>
              <label htmlFor="kind">Layer Type</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="kind"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, kind: e.target.value });
                }}
                value={sublayer.kind}
              >
                <option value="none">None</option>
                <option value="info">Info</option>
                <option value="waypoint">Waypoint</option>
                <option value="chemistrytool">Chemistry Tool</option>
                <option value="drawtool">Draw Tool</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView?.query && (
          <div id="queryDiv" className={styles.divIndent}>
            <h4>Query</h4>
            <div id="queryendpointDiv">
              <div className={styles.editDiv}>
                <label htmlFor="queryendpoint">Endpoint</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="queryendpoint"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      query: { ...sublayer.query, endpoint: e.target.value },
                    });
                  }}
                  value={sublayer.query?.endpoint}
                />
              </div>
            </div>

            <div id="querytypeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="querytype">Type</label>
              </div>
              <div className={styles.editDiv}>
                <select
                  id="querytype"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      query: { ...sublayer.query, type: e.target.value },
                    });
                  }}
                  value={sublayer.query?.type}
                >
                  <option value="elasticsearch">Elastic Search</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {sublayerView?.url && (
          <div id="urlDiv">
            <div className={styles.editDiv}>
              <label htmlFor="url">URL</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="url"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, url: e.target.value });
                }}
                value={sublayer.url}
              />
            </div>
          </div>
        )}

        {sublayerView?.position && (
          <div id="positionDiv" className={styles.divIndent}>
            <h4>Position</h4>
            <div id="longDiv">
              <div className={styles.editDiv}>
                <label htmlFor="long">Longtitude</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="long"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      position: { ...sublayer.position, longtitude: +e.target.value },
                    });
                  }}
                  value={sublayer.position?.longtitude}
                />
              </div>
            </div>

            <div id="latDiv">
              <div className={styles.editDiv}>
                <label htmlFor="lat">Latitude</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="lat"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      position: { ...sublayer.position, latitude: +e.target.value },
                    });
                  }}
                  value={sublayer.position?.latitude}
                />
              </div>
            </div>

            <div id="eleDiv">
              <div className={styles.editDiv}>
                <label htmlFor="ele">Elevation (meters)</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="ele"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      position: { ...sublayer.position, elevation: +e.target.value },
                    });
                  }}
                  value={sublayer.position?.elevation}
                />
              </div>
            </div>
          </div>
        )}

        {sublayerView?.rotation && (
          <div id="rotationDiv" className={styles.divIndent}>
            <h4>Rotation</h4>
            <div id="rotationXDiv">
              <div className={styles.editDiv}>
                <label htmlFor="rotX">Rotation X (radius)</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="rotX"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      rotation: { ...sublayer.rotation, x: +e.target.value },
                    });
                  }}
                  value={sublayer.rotation?.x}
                />
              </div>
            </div>

            <div id="rotationYDiv">
              <div className={styles.editDiv}>
                <label htmlFor="rotY">Rotation Y</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="rotY"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      rotation: { ...sublayer.rotation, y: +e.target.value },
                    });
                  }}
                  value={sublayer.rotation?.y}
                />
              </div>
            </div>

            <div id="rotationZDiv">
              <div className={styles.editDiv}>
                <label htmlFor="rotZ">Rotation Z</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="rotZ"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      rotation: { ...sublayer.rotation, z: +e.target.value },
                    });
                  }}
                  value={sublayer.rotation?.z}
                />
              </div>
            </div>
          </div>
        )}
        <br />

        {sublayerView?.scale && (
          <div id="scaleDiv">
            <div className={styles.editDiv}>
              <label htmlFor="scale">Scale</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="scale"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, scale: +e.target.value });
                }}
                value={sublayer.scale}
              />
            </div>
          </div>
        )}

        {sublayerView?.tileformat && (
          <div id="tileFormatDiv">
            <div className={styles.editDiv}>
              <label htmlFor="tileformat">Tile Format</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="tileformat"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, tileformat: e.target.value as MMGIS_tileFormats });
                }}
                value={sublayer.tileformat}
              >
                <option value="tms">TMS</option>
                <option value="wtms">WTMS</option>
                <option value="wms">WMS</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView.demtileurl && (
          <div id="demurlDiv">
            <div className={styles.editDiv}>
              <label htmlFor="demurl">DEM Tile URL</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="demurl"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, demtileurl: e.target.value });
                }}
                value={sublayer.demtileurl}
              />
            </div>
          </div>
        )}

        {sublayerView.demparser && (
          <div id="demparserDiv">
            <div className={styles.editDiv}>
              <label htmlFor="demparser">DEM Parser</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="demparser"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, demparser: e.target.value });
                }}
                value={sublayer.demparser}
              >
                <option value="RGBA">RGBA</option>
                <option value="TIF">TIF</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView.controlled && (
          <div id="controlledDiv">
            <div className={styles.editDiv}>
              <label htmlFor="controlled">Controlled</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="controlled"
                type="checkbox"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, controlled: e.target.checked });
                }}
                checked={sublayer.controlled}
              />
            </div>
          </div>
        )}

        {sublayerView.legend && (
          <div id="legendURLDiv">
            <div className={styles.editDiv}>
              <label htmlFor="legend">Legend URL</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="legend"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, legend: e.target.value });
                }}
                value={sublayer.legend}
              />
            </div>
          </div>
        )}

        {sublayerView.visibility && (
          <div id="initVisDiv">
            <div className={styles.editDiv}>
              <label htmlFor="initVis">Initial Visibility</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="initVis"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, visibility: e.target.value === "true" });
                }}
                value={sublayer.visibility ? "true" : "false"}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView.visibilitycutoff && (
          <div id="visCutoffDiv">
            <div className={styles.editDiv}>
              <label htmlFor="visCutoff">Visibility Cutoff</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="visCutoff"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, visibilitycutoff: +e.target.value });
                }}
                value={sublayer.visibilitycutoff}
              />
            </div>
          </div>
        )}

        {sublayerView.minZoom && (
          <div id="minZoomDiv">
            <div className={styles.editDiv}>
              <label htmlFor="minZoom">Minimum Zoom</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="minZoom"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, minZoom: +e.target.value });
                }}
                value={sublayer.minZoom}
              />
            </div>
          </div>
        )}

        {sublayerView.maxNativeZoom && (
          <div id="maxNativeDiv">
            <div className={styles.editDiv}>
              <label htmlFor="maxNative">Maximum Native Zoom</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="maxNative"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, maxNativeZoom: +e.target.value });
                }}
                value={sublayer.maxNativeZoom}
              />
            </div>
          </div>
        )}

        {sublayerView.maxZoom && (
          <div id="maxZoomDiv">
            <div className={styles.editDiv}>
              <label htmlFor="maxZoom">Maximum Zoom</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="maxZoom"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, maxZoom: +e.target.value });
                }}
                value={sublayer.maxZoom}
              />
            </div>
          </div>
        )}

        {sublayerView.initialOpacity && (
          <div id="opacityDiv">
            <div className={styles.editDiv}>
              <label htmlFor="initialOpacity">Initial Opacity [0-1]</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="initialOpacity"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, initialOpacity: +e.target.value });
                }}
                value={sublayer.initialOpacity}
              >
                <option value="1">True</option>
                <option value="0">False</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView.boundingBox && (
          <div id="boundingDiv">
            <div className={styles.editDiv}>
              <label htmlFor="boundingbox">Bounding Box [minx, miny, maxx, maxy]</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="boundingbox"
                type="text"
                onChange={(e) => {
                  saveSublayer({
                    ...sublayer,
                    boundingBox: e.target.value.split(",").map((val) => parseInt(val)),
                  });
                }}
                value={sublayer.boundingBox?.toString()}
              />
            </div>
          </div>
        )}

        {sublayerView.time && (
          <div id="timeDiv" className={styles.divIndent}>
            <h4>Time</h4>
            <div id="timeenabledDiv">
              <div className={styles.editDiv}>
                <label htmlFor="timeenabled">Time Enabled</label>
              </div>
              <div className={styles.editDiv}>
                <select
                  id="timeenabled"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      time: { ...sublayer.time, enabled: e.target.value === "true" },
                    });
                  }}
                  value={sublayer.time?.enabled ? "true" : "false"}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
            </div>

            <div id="timetypeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="timetype">Time Type</label>
              </div>
              <div className={styles.editDiv}>
                <select
                  id="timetype"
                  onChange={(e) => {
                    saveSublayer({ ...sublayer, time: { ...sublayer.time, type: e.target.value } });
                  }}
                  value={sublayer.time?.type}
                >
                  <option value="global">Global</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
            </div>

            <div id="timeformatDiv">
              <div className={styles.editDiv}>
                <label htmlFor="timeformat">Time Format</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="timeformat"
                  type="text"
                  onChange={(e) => {
                    saveSublayer({
                      ...sublayer,
                      time: { ...sublayer.time, format: e.target.value },
                    });
                  }}
                  value={sublayer.time?.format}
                />
              </div>
            </div>
          </div>
        )}

        {(sublayerView.styleGeneric || sublayerView.stylevt) && (
          <div id="styleDiv" className={styles.divIndent}>
            <h4>Style</h4>

            {sublayerView.stylevt && (
              <div id="stylevtDiv" className={sublayerView.stylevt ? undefined : styles.hidden}>
                <div id="vtidDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="vtid">Vector Tile Feature Unique Id Key</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="vtid"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, vtId: e.target.value },
                        });
                      }}
                      value={sublayer.style?.vtId}
                    />
                  </div>
                </div>

                <div id="vtkeyDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="vtkey">Use Key As Name</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="vtkey"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, vtKey: e.target.value },
                        });
                      }}
                      value={sublayer.style?.vtKey}
                    />
                  </div>
                </div>

                <div id="vtlayerDiv">
                  <JSONEditor
                    fieldName="Vector Tile Stylings (JSON)"
                    value={sublayer.style?.vtLayer}
                    onChange={(value) => {
                      setVtLayer(value);
                    }}
                  />
                </div>
              </div>
            )}

            {sublayerView.styleGeneric && (
              <div id="styleGenreicDiv">
                <div id="strokeColorDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="strokecolor">Stroke Color</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="strokecolor"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, color: e.target.value },
                        });
                      }}
                      value={sublayer.style?.color}
                    />
                  </div>
                </div>

                <div id="fillColorDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="fillColor">Fill Color</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="fillColor"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, fillColor: e.target.value },
                        });
                      }}
                      value={sublayer.style?.fillColor}
                    />
                  </div>
                </div>

                <div id="strokeWeightDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="strokeweight">Stroke Weight</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="strokeweight"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, weight: +e.target.value },
                        });
                      }}
                      value={sublayer.style?.weight}
                    />
                  </div>
                </div>

                <div id="fillOpacityDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="fillOpacity">Fill Opacity</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="fillOpacity"
                      type="text"
                      onChange={(e) => {
                        saveSublayer({
                          ...sublayer,
                          style: { ...sublayer.style, fillOpacity: +e.target.value },
                        });
                      }}
                      value={sublayer.style?.fillOpacity}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <br />
        {sublayerView.radius && (
          <div id="radiusDiv">
            <div className={styles.editDiv}>
              <label htmlFor="radius">Radius</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="radius"
                type="text"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, radius: +e.target.value });
                }}
                value={sublayer.radius}
              />
            </div>
          </div>
        )}

        {sublayerView.shape && (
          <div id="shapeDiv">
            <div className={styles.editDiv}>
              <label htmlFor="shape">Shape</label>
            </div>
            <div className={styles.editDiv}>
              <select
                id="shape"
                onChange={(e) => {
                  saveSublayer({ ...sublayer, shape: e.target.value });
                }}
                value={sublayer.shape}
              >
                <option value="default">Default</option>
                <option value="circle">Circle</option>
                <option value="triangle">Triangle</option>
                <option value="triangleflipped">Triangle Flipped</option>
                <option value="square">Square</option>
                <option value="pentagon">Pentagon</option>
                <option value="hexagon">Hexagon</option>
                <option value="star">Star</option>
                <option value="plus">Plus</option>
                <option value="pin">Pin</option>
              </select>
            </div>
          </div>
        )}

        {sublayerView.variables && (
          <div id="varDiv">
            <JSONEditor
              fieldName="Raw Variables (JSON)"
              value={sublayer.variables}
              onChange={(value) => {
                setVariables(value);
              }}
            />
          </div>
        )}
      </>
    );
  } else {
    return <></>;
  }
};

export default SublayerEdit;
