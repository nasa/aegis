import { FunctionComponent, useState, useEffect } from "react";
import styles from "./admin.module.css";
import { upsertSublayer } from "http-client/sublayer";

interface SublayerProps {
  sublayer: Sublayer;
  refreshLayerList: Function;
  fileList: GISfile[];
}

/** Render a single sublayer record from the DB */
const SublayerEdit: FunctionComponent<SublayerProps> = (props: SublayerProps) => {
  const [sublayer, setSublayer] = useState<Sublayer>(props.sublayer);
  const [boundingBox, setBoundingBox] = useState<string>(props.sublayer.boundingBox?.toString());

  useEffect(() => {
    setSublayer(props.sublayer);
    setBoundingBox(props.sublayer.boundingBox?.toString());
  }, [props.sublayer]);

  //save the current editing sublayer to db
  async function saveSublayer() {
    const res: WrappedResponse<Sublayer> = await upsertSublayer(sublayer);
    props.refreshLayerList();
    alert(`${res.status} - ${res.message}`);
  }

  return (
    <>
      {sublayer.name ? <h3>Edit Sublayer &quot;{sublayer.name}&quot;</h3> : <h3>Edit Sublayer</h3>}
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
            value={sublayer.description || ""}
          />
        </div>
      </div>

      <div id="typeDiv">
        <div className={styles.editDiv}>
          <label htmlFor="layerType">Layer Type</label>
        </div>
        <div className={styles.editDiv}>
          <select
            id="layerType"
            onChange={(e) => {
              setSublayer({ ...sublayer, type: e.target.value as "vector" | "tile" });
            }}
            value={sublayer.type || "tile"}
          >
            <option value="tile">Tile</option>
            <option value="vector">Vector</option>
          </select>
        </div>
      </div>

      <div id="urlDiv">
        <div className={styles.editDiv}>
          <label htmlFor="url">URL</label>
        </div>

        <div className={styles.editDiv}>
          <label htmlFor="folderNames">Folder </label>
          <select
            id="folderNames"
            title="folder names"
            onChange={(e) => {
              const tilePattern = sublayer.url
                ? sublayer.url.substring(sublayer.url.indexOf("/") + 1)
                : "";
              setSublayer({ ...sublayer, url: `${e.target.value}/${tilePattern}` });
            }}
            value={sublayer.url ? sublayer.url.substring(0, sublayer.url.indexOf("/")) : ""}
          >
            <option value="" />
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
              const folderName = sublayer.url
                ? sublayer.url.substring(0, sublayer.url.indexOf("/"))
                : "";
              setSublayer({ ...sublayer, url: `${folderName}/${e.target.value}` });
            }}
            value={sublayer.url ? sublayer.url.substring(sublayer.url.indexOf("/") + 1) : ""}
          />
        </div>
      </div>

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

      <div id="boundingDiv">
        <div className={styles.editDiv}>
          <label htmlFor="boundingbox">Bounding Box (minx, miny, maxx, maxy)</label>
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

      <div id="minZoomDiv">
        <div className={styles.editDiv}>
          <label htmlFor="minZoom">Minimum Zoom</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="minZoom"
            type="text"
            onChange={(e) => {
              setSublayer({ ...sublayer, minZoom: +e.target.value });
            }}
            value={sublayer.minZoom || ""}
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

      <button
        type="button"
        onClick={() => {
          saveSublayer();
        }}
      >
        Save Sublayer
      </button>
    </>
  );
};

export default SublayerEdit;
