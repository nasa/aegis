import { FunctionComponent, useEffect, useState } from "react";
import styles from "./admin.module.css";

/**
 * Creates a new emptyLayer object with no mission and no sublayers
 * @returns A new Layer object with required properties
 */
export function createNewLayer(missionId?: number): Layer {
  const layerConfig: MMGIS_LayerConfig = {
    name: "",
    type: "header",
    sublayers: [],
    demparser: "",
    controlled: false,
    tileformat: "tms",
    time: createNewMMGIS_Time(),
    shape: "none",
  };
  return {
    uuid: null,
    missionId: missionId || null,
    layerConfig: layerConfig,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Creates a new empty sublayer
 * @param layerType The type of layer
 * @returns A new MMGIS_Sublayer object with required properties
 */
export function createNewSublayer(layerType: MMGIS_layerTypes): MMGIS_Sublayer {
  const sublayer: MMGIS_Sublayer = {
    name: "",
    type: layerType,
    kind: "",
    query: { endpoint: "", type: "elasticsearch" },
    url: "",
    position: { longtitude: 0, latitude: 0, elevation: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 0,
    tileformat: "tms",
    demtileurl: "",
    demparser: "",
    controlled: false,
    legend: "",
    visibility: false,
    visibilitycutoff: 0,
    minZoom: 0,
    maxNativeZoom: 0,
    maxZoom: 0,
    initialOpacity: 0,
    boundingBox: [],
    time: createNewMMGIS_Time(),
    style: createNewMMGIS_SublayerStyle(),
    radius: 0,
    shape: "",
    variables: undefined,
    togglesWithHeader: false,
  };
  return sublayer;
}

export function createNewMMGIS_SublayerStyle(): MMGIS_SublayerStyle {
  return {
    className: "",
    color: "",
    fillColor: "",
    weight: 0,
    fillOpacity: 0,
    opacity: 0,
    vtId: "",
    vtKey: "",
    vtLayer: undefined,
  };
}

/**
 * Creates a new default MMGIS Time object
 * @returns A new MMGIS time object with the current date
 */
export function createNewMMGIS_Time(): MMGIS_Time {
  return {
    enabled: false,
    type: "global",
    isRelative: true,
    current: new Date(),
    start: "",
    end: "",
    format: "%Y-%m-%dT%H:%M:%SZ",
    refresh: "1 hours",
    increment: "5 minutes",
  };
}

/**
 * Creates a new empty config object. Initilizes all booleans to false, strings to empty, and numbers to 0
 * @returns a empty config object
 */
export function createNewConfig(): Config {
  return {
    msv: {
      mission: "",
      site: "",
      masterdb: false,
      view: ["", "", ""],
      radius: { major: "", minor: "" },
      mapscale: "",
    },
    projection: {
      custom: false,
      epsg: "",
      proj: "",
      xmlpath: "",
      bounds: ["", "", "", ""],
      origin: ["", ""],
      reszoomlevel: 0,
      resunitsperpixel: 0,
    },
    look: {
      pagename: "",
      minimalist: false,
      zoomcontrol: false,
      graticule: false,
      coordll: false,
      coorden: false,
      coordrxy: false,
      coordsite: false,
      coordelev: false,
      coordelevurl: "",
      coordlngoffset: "",
      coordlatoffset: "",
      coordeastoffset: "",
      coordnorthoffset: "",
      coordeastmult: "",
      coordnorthmult: "",
      primarycolor: "",
      secondarycolor: "",
      tertiarycolor: "",
      accentcolor: "",
      bodycolor: "",
      topbarcolor: "",
      toolbarcolor: "",
      mapcolor: "",
      highlightcolor: "",
      copylink: false,
      screenshot: false,
      fullscreen: false,
      help: false,
      logourl: "",
      helpurl: "",
    },
    panels: [],
    panelSettings: { demFallbackPath: "", demFallbackFormat: null, demFallbackType: null },
    tools: [],
    //layers: [],
    time: { enabled: false, visible: false, format: "" },
  };
}

export const DisplayTime: FunctionComponent<{ time: MMGIS_Time }> = (props: {
  time: MMGIS_Time;
}) => {
  return (
    <div id="timeDisplay">
      enabled: {props.time.enabled}
      <br />
      type: {props.time.type}
      <br /> isRelative: {props.time.isRelative}
      <br /> current:{" "}
      {/* {typeof props.time.current === "string"
        ? props.time.current
        : props.time.current.toUTCString()} */}
      <br /> start: {props.time.start}
      <br /> end: {props.time.end}
      <br /> format: {props.time.format}
      <br /> refresh: {props.time.refresh}
      <br /> increment: {props.time.increment}
    </div>
  );
};

/**
 * A generic JSON Editor component with built in validation message
 * @param props fieldName: name of the label for the JSON editor.
 * @returns
 */
export const JSONEditor: FunctionComponent<{
  fieldName: string;
  value: JSON;
  onChange: (jsonValue: JSON) => void;
}> = (props: { fieldName: string; value: JSON; onChange: (jsonValue: JSON) => void }) => {
  const [jsonValidMsg, setJsonValidMsg] = useState("");
  const [jsonString, setJsonString] = useState<string>();

  useEffect(() => {
    setJsonValidMsg("");
    const json = JSON.stringify(props.value);
    if (json) {
      setJsonString(json);
    } else {
      setJsonString("");
    }
  }, [props.value]);

  return (
    <>
      <div className={styles.editDiv}>
        <label htmlFor="jsonField">{props.fieldName}</label>
      </div>
      <div className={styles.editDiv}>
        <textarea
          id="jsonField"
          onChange={(e) => {
            setJsonString(e.target.value);
            setJsonValidMsg("");
            if (e.target.value === "") {
              props.onChange(undefined);
            } else {
              try {
                props.onChange(JSON.parse(e.target.value));
              } catch (e) {
                setJsonValidMsg("Invalid JSON");
              }
            }
          }}
          value={jsonString}
          title={props.fieldName}
        />
        <br />
        <span className={styles.validation}>{jsonValidMsg}</span>
      </div>
    </>
  );
};
