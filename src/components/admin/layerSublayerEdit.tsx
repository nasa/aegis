import { FunctionComponent, useState, useEffect } from "react";
import styles from "./admin.module.css";
import { upsertSublayers } from "http-client/sublayer";
import { roundDateToSecond } from "utils/formatting";
import { validators } from "components/interface/form/formValidators";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { getManifestJsonTimeBounds } from "utils/timeLayers";
interface SublayerProps {
  sublayer: Sublayer;
  allSublayers: Sublayer[];
  refreshLayerList: Function;
  fileList: GISfile[];
  missionId: number;
}

/** Render a single sublayer record from the DB */
const SublayerEdit: FunctionComponent<SublayerProps> = (props: SublayerProps) => {
  const [sublayer, setSublayer] = useState<Sublayer>(props.sublayer);
  const [boundingBox, setBoundingBox] = useState<string>(props.sublayer.boundingBox?.toString());
  const [legend, setLegend] = useState<string>(
    props.sublayer.legend ? JSON.stringify(props.sublayer.legend) : ""
  );
  const [description, setDescription] = useState<string>(props.sublayer.description);
  const [isExternal, setIsExternal] = useState<boolean>(props.sublayer.path?.startsWith("http"));

  // update fields when swapping between sublayers
  useEffect(() => {
    setSublayer(props.sublayer);
    setBoundingBox(props.sublayer.boundingBox?.toString());
    setLegend(props.sublayer.legend ? JSON.stringify(props.sublayer.legend) : "");
    setDescription(props.sublayer.description);
    setIsExternal(props.sublayer.path?.startsWith("http"));
  }, [props.sublayer]);

  //save the current editing sublayer to db
  async function saveSublayer() {
    const res: WrappedResponse<Sublayer[]> = await upsertSublayers([
      {
        ...sublayer,
        updatedAt: roundDateToSecond(new Date()).toISOString(),
      },
    ]);
    props.refreshLayerList();
    alert(`${res.status} - ${res.message}`);
  }

  async function loadManifestFromFile(folderName: string) {
    if (sublayer.isTimeBased) {
      //read in the manifest
      const res = await fetch(`${folderName}/manifest.json`);
      if (res.ok) {
        const manifestJson = await res.json();
        const timeLayerJson: TimeLayerJson[] = manifestJson.time_layers;
        const timeLayerManifest: TimeLayerInfo[] = [];
        timeLayerJson.forEach((timeLayer, index) => {
          const layerBounds: [string, string] = getManifestJsonTimeBounds(timeLayerJson, index);
          timeLayerManifest.push({
            datetime: timeLayer.datetime,
            dirName: timeLayer.dir_name,
            lowerBound: layerBounds[0],
            upperBound: layerBounds[1],
          });
        });

        //set values
        setSublayer((state) => {
          return { ...state, timeLayerManifest: timeLayerManifest };
        });
      } else {
        setSublayer((state) => {
          return { ...state, timeLayerManifest: null };
        });
      }
    } else {
      setSublayer((state) => {
        return { ...state, timeLayerManifest: null };
      });
    }
  }

  async function loadLegendFromFile(rootPath: string) {
    //read in the legend
    const res = await fetch(`${rootPath}/legend.json`);
    let layerLegend = null;
    if (res.status === 200) {
      layerLegend = await res.json();
    }
    //set values
    setSublayer((state) => {
      return { ...state, legend: layerLegend };
    });
    setLegend(layerLegend ? JSON.stringify(layerLegend) : null);
  }

  async function loadDescriptionFromFile(rootPath: string) {
    //read in the legend
    const res = await fetch(`${rootPath}/description.json`);
    let layerDescription = "";
    if (res.status === 200) {
      const descriptionJson: { layerDescription: string } = await res.json();
      layerDescription = descriptionJson.layerDescription;
    }
    //set values
    setSublayer((state) => {
      return { ...state, description: layerDescription };
    });
    setDescription(layerDescription);
  }

  async function loadTileMapResourceFromFile(rootPath: string) {
    let minZoom = null;
    let maxZoom = null;
    let boxArray: number[] = [];
    if (rootPath) {
      //read in the timemapresource.xml
      const res = await fetch(`${rootPath}/tilemapresource.xml`);
      const xmlFileContent = await res.text();
      if (xmlFileContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlFileContent, "application/xml");

        //get bounding box
        const xmlBoundingBox = doc.querySelector("BoundingBox");
        boxArray = [
          parseFloat(xmlBoundingBox.getAttribute("minx")),
          parseFloat(xmlBoundingBox.getAttribute("miny")),
          parseFloat(xmlBoundingBox.getAttribute("maxx")),
          parseFloat(xmlBoundingBox.getAttribute("maxy")),
        ];

        //get min/max zoom
        const xmlTileSets = doc.querySelector("TileSets").children;
        for (const xmltileset of xmlTileSets) {
          const zoom = +xmltileset.getAttribute("href");
          if (!maxZoom) {
            maxZoom = zoom;
          } else {
            if (zoom > maxZoom) maxZoom = zoom;
          }
          if (!minZoom) {
            minZoom = zoom;
          } else {
            if (zoom < minZoom) minZoom = zoom;
          }
        }
      }
    }
    //set values
    setBoundingBox(boxArray.toString());
    setSublayer((state) => {
      return { ...state, minNativeZoom: minZoom, maxNativeZoom: maxZoom, boundingBox: boxArray };
    });
  }

  async function preloadDataFromFiles(folderName: string) {
    if (isExternal) {
      await loadTileMapResourceFromFile(folderName);
      await loadLegendFromFile(folderName);
      await loadDescriptionFromFile(folderName);
      await loadManifestFromFile(folderName);
    } else {
      await loadTileMapResourceFromFile(
        `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`
      );
      await loadLegendFromFile(
        `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`
      );
      await loadDescriptionFromFile(
        `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`
      );
      await loadManifestFromFile(
        `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`
      );
    }
  }

  function clearAllFields(type: SublayerType) {
    // get default values and set them to the sublayer to clear them back to defaults
    // preserve the type field
    const tempBlankSublayer = generateBlankSublayer();
    setSublayer({
      ...sublayer,
      type,
      name: tempBlankSublayer.name,
      description: tempBlankSublayer.description,
      legend: tempBlankSublayer.legend,
      path: tempBlankSublayer.path,
      tilePattern: tempBlankSublayer.tilePattern,
      boundingBox: tempBlankSublayer.boundingBox,
      tileFormat: tempBlankSublayer.tileFormat,
      minNativeZoom: tempBlankSublayer.minNativeZoom,
      maxNativeZoom: tempBlankSublayer.maxNativeZoom,
      maxZoom: tempBlankSublayer.maxZoom,
      color: tempBlankSublayer.color,
      opacity: tempBlankSublayer.opacity,
      fillColor: tempBlankSublayer.fillColor,
      fillOpacity: tempBlankSublayer.fillOpacity,
      weight: tempBlankSublayer.weight,
      isTimeBased: tempBlankSublayer.isTimeBased,
      timeLayerManifest: tempBlankSublayer.timeLayerManifest,
    });
    setBoundingBox(tempBlankSublayer.boundingBox?.toString());
    setLegend(tempBlankSublayer.legend ? JSON.stringify(tempBlankSublayer.legend) : "");
    setDescription(tempBlankSublayer.description);
  }

  return (
    <div className={styles.sublayerEditBoxes}>
      <div className={styles.sectionDiv}>
        {sublayer.name ? (
          <div className={styles.sectionDivHeading}>Edit Sublayer &quot;{sublayer.name}&quot;</div>
        ) : (
          <div>Edit Sublayer</div>
        )}
        <div id="readOnlyDiv">
          UUID: {sublayer.uuid}
          <br />
          MissionId: {sublayer.missionId}
          <br />
          Parent Layer: {sublayer.layerUuid}
        </div>
        <br />
        <div id="internalExternalDiv">
          <label>
            <input
              type="radio"
              checked={!isExternal}
              onChange={() => {
                setIsExternal(false);
                clearAllFields(sublayer.type);
              }}
              radioGroup="internalExternal"
            />
            Internal
          </label>
          <label style={{ marginLeft: "1rem" }}>
            <input
              type="radio"
              checked={isExternal}
              onChange={() => {
                setIsExternal(true);
                clearAllFields(sublayer.type);
              }}
              radioGroup="internalExternal"
            />
            External (http)
          </label>
        </div>
        <br />
        <div id="typeDiv">
          <div className={styles.editDiv}>
            <label htmlFor="layerType">
              <b>Layer Type</b>
            </label>
          </div>
          <div className={styles.editDiv}>
            <select
              id="layerType"
              onChange={(e) => {
                clearAllFields(e.target.value as "vector" | "tile" | "vector-tile");
              }}
              value={sublayer.type || "tile"}
            >
              <option value="tile">Tile</option>
              <option value="vector">Vector</option>
              <option value="vector-tile">Vector Tile</option>
            </select>
          </div>
        </div>
        {sublayer.type === "tile" && (
          <div id="isTimeDiv">
            <div className={styles.editDiv}>
              <label htmlFor="name">Time Based</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="isTimeBased"
                type="checkbox"
                onChange={(e) => {
                  setSublayer({ ...sublayer, isTimeBased: e.target.checked || false });
                }}
                checked={sublayer.isTimeBased || false}
              />
            </div>
          </div>
        )}
        <div id="pathDiv" style={{ paddingBottom: "1rem" }}>
          {sublayer.type === "tile" || sublayer.type === "vector-tile" ? (
            <div id="urlDiv">
              <div className={styles.editDiv}>
                {isExternal ? (
                  <>
                    <label htmlFor="baseURL">External URL</label>
                    <div className={styles.editDiv}>
                      <input
                        id="baseURL"
                        type="text"
                        onChange={(e) => {
                          setSublayer({ ...sublayer, path: `${e.target.value}` });
                        }}
                        value={sublayer.path || ""}
                        style={{ width: "250px" }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label htmlFor="folderNames">Internal Folder </label>
                    <select
                      id="folderNames"
                      title="folder names"
                      onChange={(e) => {
                        setSublayer((state) => {
                          return {
                            ...state,
                            name: e.target.value,
                            path: e.target.value,
                          };
                        });

                        //attempt to pre-load all other fields
                        preloadDataFromFiles(e.target.value);
                      }}
                      value={sublayer.path || ""}
                    >
                      <option value="" key="">
                        None
                      </option>
                      {props.fileList?.map((file) => {
                        return (
                          <option value={file.name} key={file.name}>
                            {file.name}
                          </option>
                        );
                      })}
                    </select>
                  </>
                )}

                <div className={styles.editDiv}>
                  <label htmlFor="aegisUrl">Tile Pattern {`(eg. {z}/{x}/{y}.png)`}</label>
                  <input
                    id="aegisUrl"
                    type="text"
                    onChange={(e) => {
                      setSublayer({ ...sublayer, tilePattern: e.target.value });
                    }}
                    value={sublayer.tilePattern || ""}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {isExternal ? (
                <div>
                  <div className={styles.editDiv}>
                    <label htmlFor="baseURL">External URL to filename</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="baseURL"
                      type="text"
                      onChange={(e) => {
                        setSublayer((state) => {
                          return { ...state, path: `${e.target.value}` };
                        });
                      }}
                      value={sublayer.path || ""}
                      style={{ width: "250px" }}
                    />
                  </div>
                </div>
              ) : (
                <div id="fileDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="filePath">Internal Filename</label>
                  </div>
                  <div className={styles.editDiv}>
                    <input
                      id="filePath"
                      type="text"
                      onChange={(e) => {
                        setSublayer({ ...sublayer, path: e.target.value });
                      }}
                      value={sublayer.path || ""}
                    />
                    <br />
                    Make sure this file is uploaded to mission/data
                  </div>
                </div>
              )}
            </>
          )}
          <div className={styles.editDiv}>
            Path:{" "}
            {`${sublayer.path}${sublayer.type === "vector" ? "" : "/" + sublayer.tilePattern}`}
          </div>
        </div>
        {sublayer.isTimeBased && (
          <div>
            <div className={styles.editDiv}>
              <label htmlFor="name">Manifest Status: </label>
            </div>
            <div className={styles.editDiv}>
              {sublayer.timeLayerManifest
                ? `Manifest Loaded: contains ${sublayer.timeLayerManifest.length} items`
                : "No Manifest Loaded"}
            </div>
          </div>
        )}
        <div id="nameDiv">
          <div className={styles.editDiv}>
            <label htmlFor="name">Sublayer Name</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="name"
              type="text"
              onChange={(e) => {
                setSublayer({ ...sublayer, name: e.target.value });
              }}
              value={sublayer.name || ""}
            />
          </div>
        </div>
        <div id="descDiv">
          <div className={styles.editDiv}>
            <label htmlFor="desc">Sublayer Description</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="desc"
              type="text"
              onChange={(e) => {
                setSublayer({ ...sublayer, description: e.target.value });
                setDescription(e.target.value);
              }}
              value={description || ""}
            />
          </div>
        </div>
        <div id="legendDiv">
          <div className={styles.editDiv}>
            <label htmlFor="legend">Legend</label>
          </div>
          <div className={styles.editDiv}>
            <textarea
              id="legend"
              onBlur={(e) => {
                if (e.target.value === "") {
                  setSublayer({ ...sublayer, legend: null });
                } else {
                  const validator = validators.mustBeValidJSON(e.target.value);
                  if (validator === undefined) {
                    setSublayer({ ...sublayer, legend: JSON.parse(e.target.value) });
                  } else {
                    console.error(validator);
                  }
                }
              }}
              onChange={(e) => {
                setLegend(e.target.value);
              }}
              value={legend || ""}
            />
          </div>
        </div>
        {sublayer.type === "tile" && (
          <>
            <div id="boundingDiv">
              <div className={styles.editDiv}>
                <label htmlFor="boundingbox">Bounding Box (minx, miny, maxx, maxy)</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="boundingbox"
                  type="text"
                  onBlur={(e) => {
                    if (!e.target.value) {
                      setSublayer({ ...sublayer, boundingBox: null });
                      return;
                    } else {
                      setSublayer({
                        ...sublayer,
                        boundingBox: e.target.value.split(",").map((val) => parseFloat(val)),
                      });
                    }
                  }}
                  onChange={(e) => {
                    setBoundingBox(e.target.value);
                  }}
                  value={boundingBox || ""}
                />
              </div>
            </div>
            <div id="tileFormatDiv">
              <div className={styles.editDiv}>
                <label htmlFor="tileformat">Tile Format</label>
              </div>
              <div className={styles.editDiv}>
                <select
                  id="tileformat"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, tileFormat: e.target.value });
                  }}
                  value={sublayer.tileFormat || "TMS"}
                >
                  <option value="tms">TMS</option>
                  <option value="wtms">WTMS</option>
                  <option value="wms">WMS</option>
                </select>
              </div>
            </div>
            <div id="minNativeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="minNative">*Minimum Native Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="minNative"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, minNativeZoom: +e.target.value });
                  }}
                  value={sublayer.minNativeZoom || ""}
                />
              </div>
            </div>
            <div id="maxNativeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="maxNative">*Maximum Native Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="maxNative"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, maxNativeZoom: +e.target.value });
                  }}
                  value={sublayer.maxNativeZoom || ""}
                />
              </div>
            </div>
            <div id="maxZoomDiv">
              <div className={styles.editDiv}>
                <label htmlFor="maxZoom">Maximum Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="maxZoom"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, maxZoom: +e.target.value });
                  }}
                  value={sublayer.maxZoom || ""}
                />
              </div>
            </div>
          </>
        )}
        {sublayer.type === "vector" && (
          <>
            <div id="styleGenericDiv">
              <div id="strokeColorDiv">
                <div className={styles.editDiv}>
                  <label htmlFor="strokecolor">Stroke Color</label>
                </div>
                <div className={styles.editDiv}>
                  <input
                    id="strokecolor"
                    type="text"
                    onChange={(e) => {
                      setSublayer({
                        ...sublayer,
                        color: e.target.value,
                      });
                    }}
                    value={sublayer.color || ""}
                  />
                </div>
              </div>

              <div id="opacityDiv">
                <div className={styles.editDiv}>
                  <label htmlFor="opacity">Opacity</label>
                </div>
                <div className={styles.editDiv}>
                  <input
                    id="opacity"
                    type="text"
                    onChange={(e) => {
                      setSublayer({
                        ...sublayer,
                        opacity: +e.target.value,
                      });
                    }}
                    value={sublayer.opacity || ""}
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
                      setSublayer({
                        ...sublayer,
                        fillColor: e.target.value,
                      });
                    }}
                    value={sublayer.fillColor || ""}
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
                      setSublayer({
                        ...sublayer,
                        fillOpacity: +e.target.value,
                      });
                    }}
                    value={sublayer.fillOpacity || ""}
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
                      setSublayer({
                        ...sublayer,
                        weight: +e.target.value,
                      });
                    }}
                    value={sublayer.weight || ""}
                  />
                </div>
              </div>
            </div>
          </>
        )}
        {sublayer.type === "vector-tile" && (
          <>
            <div id="minNativeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="minNative">Minimum Native Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="minNative"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, minNativeZoom: +e.target.value });
                  }}
                  value={sublayer.minNativeZoom || ""}
                />
              </div>
            </div>
            <div id="maxNativeDiv">
              <div className={styles.editDiv}>
                <label htmlFor="maxNative">Maximum Native Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="maxNative"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, maxNativeZoom: +e.target.value });
                  }}
                  value={sublayer.maxNativeZoom || ""}
                />
              </div>
            </div>
            <div id="maxZoomDiv">
              <div className={styles.editDiv}>
                <label htmlFor="maxZoom">Maximum Zoom</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="maxZoom"
                  type="text"
                  onChange={(e) => {
                    setSublayer({ ...sublayer, maxZoom: +e.target.value });
                  }}
                  value={sublayer.maxZoom || ""}
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
                    setSublayer({
                      ...sublayer,
                      weight: +e.target.value,
                    });
                  }}
                  value={sublayer.weight || ""}
                />
              </div>
            </div>
            <div id="strokeColorDiv">
              <div className={styles.editDiv}>
                <label htmlFor="strokecolor">Stroke Color</label>
              </div>
              <div className={styles.editDiv}>
                <input
                  id="strokecolor"
                  type="text"
                  onChange={(e) => {
                    setSublayer({
                      ...sublayer,
                      color: e.target.value,
                    });
                  }}
                  value={sublayer.color || ""}
                />
              </div>
            </div>
          </>
        )}
        <br />
        Description is pulled from description.json
        <br />
        Legend is pulled from legend.json
        <br />
        Bounding Box, and Min/Max Native Zoom are pulled from tilemapresource.xml
        <br />
        Time layer information is pulled from manifest.json
        <br />
        {isExternal && (
          <button
            type="button"
            onClick={() => {
              preloadDataFromFiles(sublayer.path);
            }}
          >
            Import From External Source
          </button>
        )}
        <br />
        <br />
        <br />
        <button
          type="button"
          onClick={() => {
            if (
              sublayer.isTimeBased &&
              props.allSublayers.some((s) => s.isTimeBased && s.uuid !== sublayer.uuid)
            ) {
              alert(
                "Unable to save a second time-based sublayer. Please remove the first time-based sublayer before adding a new one."
              );
            } else {
              saveSublayer();
            }
          }}
        >
          Save Sublayer
        </button>
      </div>
      {sublayer.isTimeBased && sublayer.timeLayerManifest && (
        <div className={styles.sectionDiv}>
          <h2>Manifest Times: </h2>
          {sublayer.timeLayerManifest.map((item, index) => {
            return (
              <div key={index}>
                {item.datetime}
                <br />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SublayerEdit;
