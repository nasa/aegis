import get from "lodash/get";
import isNull from "lodash/isNull";
import { FunctionComponent, useState, useEffect } from "react";
import styles from "./admin.module.css";
import { upsertSublayers } from "http-client/sublayer";
import { validators } from "components/interface/form/formValidators";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { getManifestJsonTimeBounds } from "utils/mapping/timeLayers";
import { validateImportableSublayer } from "utils/validateSchema";
import { getAccurateNow } from "utils/formatting";
import { listFiles } from "http-client/file";
import { AnySchemaObject, ErrorObject } from "ajv";

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
  const [isExternal, setIsExternal] = useState<boolean>(props.sublayer.path?.startsWith("http"));
  const [refreshDirectoryListing, setRefreshDirectoryListing] = useState(true);
  // geoJSON file names
  const [dataDirGeoJSONs, setDataDirGeoJSONs] = useState<string[]>([]);
  const [propertiesErrs, setPropertiesErrs] = useState<ErrorObject[]>([]);

  // update fields when swapping between sublayers
  useEffect(() => {
    setSublayer(props.sublayer);
    setBoundingBox(props.sublayer.boundingBox?.toString());
    setLegend(props.sublayer.legend ? JSON.stringify(props.sublayer.legend) : "");
    setIsExternal(props.sublayer.path?.startsWith("http"));
  }, [props.sublayer]);

  // call API to get a list of geojson files in mission_id/Data
  useEffect(() => {
    if (!refreshDirectoryListing) {
      return;
    }

    (async function () {
      const path = `missionFiles/${props.missionId}/Data`;
      const fileList: GISfile[] | void = await listFiles(path).catch(console.error);

      if (!fileList) {
        setDataDirGeoJSONs([]);
        return;
      }

      // filter for the GeoJSON files we care about
      const fileStates: string[] = fileList
        // only files
        .filter((file) => !file.isDir)
        // only geojson
        .filter((file) => {
          const lastDot = file.name.lastIndexOf(".");
          if (lastDot === -1) {
            return false;
          }

          return file.name.slice(lastDot) === ".geojson";
        })
        .map((file) => file.name);

      setDataDirGeoJSONs(fileStates);
    })();

    setRefreshDirectoryListing(false);
  }, [props.missionId, refreshDirectoryListing]);

  //save the current editing sublayer to db
  async function saveSublayer() {
    const res: WrappedResponse<Sublayer[]> = await upsertSublayers([
      {
        ...sublayer,
        updatedAt: getAccurateNow().toISOString(),
      },
    ]);
    props.refreshLayerList();
    alert(`${res.status} - ${res.message}`);
  }

  // timeLayerManifest
  async function loadManifestFromFile(folderName: string) {
    if (sublayer.isTimeBased) {
      //read in the manifest
      const res = await fetch(`${folderName}/manifest.json`, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache", // legacy support
          Expires: "0", // legacy support
        },
      });
      if (res.ok) {
        const manifestJson = await res.json();
        const timeLayerJson: TimeLayerJson[] = manifestJson.time_layers;
        const timeLayerManifest: TimeLayerInfo[] = [];
        timeLayerJson.forEach((timeLayer, index) => {
          const layerBounds: [string, string] = getManifestJsonTimeBounds(timeLayerJson, index);
          timeLayerManifest.push({
            datetime: timeLayer.datetime,
            dirName: timeLayer.dirName,
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

  // boundingBox, minNativeZoom, maxNativeZoom
  async function loadTileMapResourceFromFile(rootPath: string) {
    let minZoom = null;
    let maxZoom = null;
    let boxArray: number[] = [];
    //read in the timemapresource.xml
    const res = await fetch(`${rootPath}/tilemapresource.xml`, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache", // legacy support
        Expires: "0", // legacy support
      },
    });
    if (res.status !== 200) return;

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

    //set values
    setBoundingBox(boxArray.toString());
    setSublayer((state) => {
      return { ...state, minNativeZoom: minZoom, maxNativeZoom: maxZoom, boundingBox: boxArray };
    });
  }

  // any property in Sublayer
  async function loadSublayerPropertiesFromFile(rootPath: string) {
    const res = await fetch(`${rootPath}/properties.json`, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache", // legacy support
        Expires: "0", // legacy support
      },
    });
    if (res.status !== 200) return;

    let partialSublayerJson: unknown;
    try {
      partialSublayerJson = await res.json();
    } catch (e) {
      // mimic an AJV validation error for consistency's sake.
      setPropertiesErrs([
        {
          keyword: "missing",
          message: "cannot parse - invalid JSON",
          instancePath: "properties.json",
          schemaPath: null,
          params: null,
        },
      ]);
      return;
    }

    const validationErrors = await validateImportableSublayer(partialSublayerJson);
    // check if the sublayer is valid
    if (validationErrors.length !== 0) {
      console.error("Could not import properties.json. Invalid schema:", validationErrors);
      setPropertiesErrs(validationErrors);
      return;
    }

    //set values
    setSublayer((state) => {
      return { ...state, ...(partialSublayerJson as SublayerImportable) };
    });
    // if we have legend, also push it to the local state
    if (Object.keys(partialSublayerJson).includes("legend")) {
      const layerLegend = (partialSublayerJson as SublayerImportable).legend;
      setLegend(layerLegend ? JSON.stringify(layerLegend) : null);
    }
    // if we have bounding box, also push it to the local state
    if (Object.keys(partialSublayerJson).includes("boundingBox")) {
      const boxArray = (partialSublayerJson as SublayerImportable).boundingBox;
      setBoundingBox(boxArray.toString());
    }
  }

  async function preloadDataFromFiles(folderName: string) {
    // clear errors from the last properties.json loaded, if there were any
    setPropertiesErrs([]);

    if (isExternal) {
      await loadTileMapResourceFromFile(folderName);
      await loadManifestFromFile(folderName);
      await loadSublayerPropertiesFromFile(folderName);
    } else {
      const rootPath = `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`;
      await loadTileMapResourceFromFile(rootPath);
      await loadManifestFromFile(rootPath);
      await loadSublayerPropertiesFromFile(rootPath);
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
      style: tempBlankSublayer.style,
      isTimeBased: tempBlankSublayer.isTimeBased,
      timeLayerManifest: tempBlankSublayer.timeLayerManifest,
    });
    setBoundingBox(tempBlankSublayer.boundingBox?.toString());
    setLegend(tempBlankSublayer.legend ? JSON.stringify(tempBlankSublayer.legend) : "");
  }

  /**
   * AJV JSON errors are zero indexed and formatted with slashes. Rewrite them in a more JSON-like format
   * @param instancePath string
   * @returns string
   */
  function humanReadableJSONErrorPath(instancePath: string): string {
    let res = "";

    const parts = instancePath.split("/");

    parts
      // we'll probably have an empty string at the start of the list because every path starts with a /
      .filter((part) => part !== "")
      .forEach((part, index) => {
        const maybePosition = parseInt(part);
        if (!isNaN(maybePosition)) {
          // we have an array index
          res += `[${maybePosition}]`;
          return;
        }

        // we have a key

        if (index === 0) {
          // the first key doesn't need to be prefixed with a "."...
          res = part;
          return;
        }

        // ...but latter keys do need the "." prefixed
        res += `.${part}`;
      });

    return res;
  }

  /**
   * Grab useful info from the AJV schema to show a user
   * @param parentSchema AnySchemaObject from AJV
   * @returns string
   */
  function humanReadableJSONErrorParent(parentSchema: AnySchemaObject): string {
    const enumValues = get(parentSchema, "enum", null);

    if (!isNull(enumValues)) {
      return `Options: ${enumValues.join(", ")}`;
    }

    return "";
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
                        if (e.target.value !== "") {
                          preloadDataFromFiles(e.target.value);
                        }
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
                    <select
                      id="filePath"
                      onChange={(e) => {
                        setSublayer({ ...sublayer, path: e.target.value });
                      }}
                      value={sublayer.path || "selectafile"}
                    >
                      <option disabled value="selectafile">
                        Select a file
                      </option>
                      {dataDirGeoJSONs.map((filename, i) => {
                        return (
                          <option key={`GEOJSON__${i}__${filename}`} value={filename}>
                            {filename}
                          </option>
                        );
                      })}
                    </select>
                    <br />
                    Vector file options are pulled from /Data
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
        {propertiesErrs.length > 0 && (
          <div className={styles.editDiv}>
            <strong>Errors found in properties.json:</strong> <span>(Arrays are zero-indexed)</span>
            <br />
            <ul>
              {propertiesErrs.map((err, index) => (
                <li key={`PROPERTIES_JSON__ERRORS__${index}`}>
                  <span className={styles.propertiesErrs}>
                    {humanReadableJSONErrorPath(err.instancePath)}: {err.message}.{" "}
                    {humanReadableJSONErrorParent(err.parentSchema)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
            <textarea
              id="desc"
              rows={6}
              cols={40}
              onChange={(e) => {
                setSublayer({ ...sublayer, description: e.target.value });
              }}
              value={sublayer.description || ""}
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
              rows={6}
              cols={40}
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
          </>
        )}
        <br />
        Bounding Box, and Min/Max Native Zoom are pulled from tilemapresource.xml
        <br />
        Time layer information is pulled from manifest.json ("Time Based" must be checked)
        <br />
        {isExternal ? (
          <button
            type="button"
            onClick={() => {
              preloadDataFromFiles(sublayer.path);
            }}
          >
            Import From External Source
          </button>
        ) : (
          <>Fields are populated when the Internal Folder changes</>
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
