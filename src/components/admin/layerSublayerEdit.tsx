import { FunctionComponent, useState, useEffect } from "react";
import styles from "./admin.module.css";
import { upsertSublayers } from "http-client/sublayer";
import { roundDateToSecond } from "utils/formatting";
import { validators } from "components/interface/form/formValidators";
interface SublayerProps {
  sublayer: Sublayer;
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

  useEffect(() => {
    setSublayer(props.sublayer);
    setBoundingBox(props.sublayer.boundingBox?.toString());
    setLegend(props.sublayer.legend ? JSON.stringify(props.sublayer.legend) : "");
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

  async function loadLegendFromFile(folderName: string) {
    //read in the legend
    const res = await fetch(
      `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}/legend.json`
    );
    if (res.status === 200) {
      const legendJson = await res.json();
      //set values
      setSublayer((state) => {
        return { ...state, legend: legendJson };
      });
      setLegend(JSON.stringify(legendJson));
    }
  }

  async function loadDescriptionFromFile(folderName: string) {
    //read in the legend
    const res = await fetch(
      `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}/description.json`
    );
    if (res.status === 200) {
      const descriptionJson: { layerDescription: string } = await res.json();
      //set values
      setSublayer((state) => {
        return { ...state, description: descriptionJson.layerDescription };
      });
      setDescription(descriptionJson.layerDescription);
    }
  }

  async function loadTileMapResourceFromFile(folderName: string) {
    if (!folderName) return;
    //read in the timemapresource.xml
    const res = await fetch(
      `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}/tilemapresource.xml`
    );
    const xmlFileContent = await res.text();
    if (xmlFileContent) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlFileContent, "application/xml");

      //get bounding box
      const xmlBoundingBox = doc.querySelector("BoundingBox");
      const boxArray = [
        parseFloat(xmlBoundingBox.getAttribute("minx")),
        parseFloat(xmlBoundingBox.getAttribute("miny")),
        parseFloat(xmlBoundingBox.getAttribute("maxx")),
        parseFloat(xmlBoundingBox.getAttribute("maxy")),
      ];
      setBoundingBox(boxArray.toString());

      //get min/max zoom
      const xmlTileSets = doc.querySelector("TileSets").children;
      let maxZoom: number = null;
      let minZoom: number = null;
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
      //set values
      setSublayer((state) => {
        return { ...state, minNativeZoom: minZoom, maxNativeZoom: maxZoom, boundingBox: boxArray };
      });
    }
  }

  return (
    <div className={styles.sectionDiv}>
      {sublayer.name ? (
        <div className={styles.sectionDivHeading}>Edit Sublayer &quot;{sublayer.name}&quot;</div>
      ) : (
        <div>Edit Sublayer</div>
      )}
      <div id="readOnlyDiv" className={styles.divIndent}>
        UUID: {sublayer.uuid}
        <br />
        MissionId: {sublayer.missionId}
        <br />
        Parent Layer: {sublayer.layerUuid}
      </div>
      <br />
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
              setSublayer({
                ...sublayer,
                type: e.target.value as "vector" | "tile" | "vector-tile",
              });
            }}
            value={sublayer.type || "tile"}
          >
            <option value="tile">Tile</option>
            <option value="vector">Vector</option>
            <option value="vector-tile">Vector Tile</option>
          </select>
        </div>
      </div>
      {(!sublayer.type || sublayer.type === "tile") && (
        <>
          <div id="urlDiv">
            <div className={styles.editDiv}>
              <label htmlFor="url">URL</label>
            </div>
          </div>
          <div className={styles.editDiv}>
            <label htmlFor="folderNames">Folder </label>
            <select
              id="folderNames"
              title="folder names"
              onChange={(e) => {
                //get existing tilepattern
                const tilePattern = sublayer.url
                  ? sublayer.url.substring(sublayer.url.indexOf("/") + 1)
                  : "";
                //prepend the folder name to the URL.
                //use callback method to set state or else it will conflict with the setState in loadXML
                setSublayer((state) => {
                  return { ...state, url: `${e.target.value}/${tilePattern}` };
                });

                //attempt to pre-load all other fields
                loadTileMapResourceFromFile(e.target.value);
                loadLegendFromFile(e.target.value);
                loadDescriptionFromFile(e.target.value);
              }}
              value={sublayer.url ? sublayer.url.substring(0, sublayer.url.indexOf("/")) : ""}
            >
              {props.fileList?.map((file) => {
                return (
                  <option value={file.name} key={file.name}>
                    {file.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className={styles.editDiv}>
            <label htmlFor="aegisUrl">Tile Pattern {`(eg. {z}/{x}/{y}.png)`}</label>
            <input
              id="aegisUrl"
              type="text"
              onChange={(e) => {
                //get existing foldername
                const folderName = sublayer.url
                  ? sublayer.url.substring(0, sublayer.url.indexOf("/"))
                  : "";
                //append new tile pattern to the URL
                setSublayer({ ...sublayer, url: `${folderName}/${e.target.value}` });
              }}
              value={sublayer.url ? sublayer.url.substring(sublayer.url.indexOf("/") + 1) : ""}
            />
          </div>
          <div id="boundingDiv">
            <div className={styles.editDiv}>
              <label htmlFor="boundingbox">*Bounding Box (minx, miny, maxx, maxy)</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="boundingbox"
                type="text"
                onBlur={(e) => {
                  setSublayer({
                    ...sublayer,
                    boundingBox: e.target.value.split(",").map((val) => parseFloat(val)),
                  });
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
          * = values pulled from tilemapresource.xml
          <br />
        </>
      )}
      {sublayer.type === "vector" && (
        <>
          <div id="fileDiv">
            <div className={styles.editDiv}>
              <label htmlFor="filePath">File Path (for vectors layers)</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="filePath"
                type="text"
                onChange={(e) => {
                  setSublayer({ ...sublayer, filePath: e.target.value });
                }}
                value={sublayer.filePath || ""}
              />
              Make sure this file is uploaded to mission/data
            </div>
          </div>
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
      {(!sublayer.type || sublayer.type === "vector-tile") && (
        <>
          <div className={styles.editDiv}>
            <label htmlFor="folderNames">Folder </label>
            <select
              id="folderNames"
              title="folder names"
              onChange={(e) => {
                //get existing tilepattern
                const tilePattern = sublayer.url
                  ? sublayer.url.substring(sublayer.url.indexOf("/") + 1)
                  : "";
                //prepend the folder name to the URL.
                //use callback method to set state or else it will conflict with the setState in loadXML
                setSublayer((state) => {
                  return { ...state, url: `${e.target.value}/${tilePattern}` };
                });

                //attempt to pre-load all other fields
                loadTileMapResourceFromFile(e.target.value);
                loadLegendFromFile(e.target.value);
              }}
              value={sublayer.url ? sublayer.url.substring(0, sublayer.url.indexOf("/")) : ""}
            >
              {props.fileList?.map((file) => {
                return (
                  <option value={file.name} key={file.name}>
                    {file.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className={styles.editDiv}>
            <label htmlFor="aegisUrl">Tile Pattern {`(eg. {z}/{x}/{y}.pbf)`}</label>
            <input
              id="aegisUrl"
              type="text"
              onChange={(e) => {
                //get existing foldername
                const folderName = sublayer.url
                  ? sublayer.url.substring(0, sublayer.url.indexOf("/"))
                  : "";
                //append new tile pattern to the URL
                setSublayer({ ...sublayer, url: `${folderName}/${e.target.value}` });
              }}
              value={sublayer.url ? sublayer.url.substring(sublayer.url.indexOf("/") + 1) : ""}
            />
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
      <button
        type="button"
        onClick={() => {
          saveSublayer();
        }}
      >
        Save Sublayer
      </button>
    </div>
  );
};

export default SublayerEdit;
