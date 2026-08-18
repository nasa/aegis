import get from "lodash/get";
import isNull from "lodash/isNull";
import { forwardRef, useState, useEffect, useImperativeHandle, type ForwardedRef } from "react";
import styles from "./admin.module.css";
import { upsertSublayers } from "http-client/sublayer";
import { validators } from "components/interface/form/formValidators";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { getManifestJsonTimeBounds } from "utils/mapping/timeLayers";
import { validateImportableSublayer } from "utils/validateSchemaClient";
import { getAccurateNow } from "utils/formatting";
import { listFiles } from "http-client/file";
import type { AnySchemaObject, ErrorObject } from "ajv";

interface SublayerProps {
  sublayer: Sublayer;
  allSublayers: Sublayer[];
  refreshLayerList: Function;
  fileList: GISfile[];
  missionId: number;
}

export type SublayerEditHandle = { save: () => Promise<boolean> };

/** A COG sublayer is a self-describing GeoTIFF, identified by a `.tif`/`.tiff` path. */
function isCogPath(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".tif") || lower.endsWith(".tiff");
}

function isPmtilesPath(path: string): boolean {
  return path?.toLowerCase().endsWith(".pmtiles") ?? false;
}

/**
 * Fetch a URL and return the response, or null if the request fails or the payload is not
 * the expected resource.
 *
 * This is a generic fetch helper used for metadata files and other URL-based inputs.
 */
async function fetchURL(url: string): Promise<Response | null> {
  const res = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache", // legacy support
      Expires: "0", // legacy support
    },
  }).catch((e): null => {
    console.error(`Could not fetch ${url}`, e);
    return null;
  });

  if (!res?.ok) return null;
  if (res.headers.get("content-type")?.toLowerCase().includes("text/html")) return null;
  return res;
}

/** Render a single sublayer record from the DB */
function SublayerEditInner(props: SublayerProps, ref: ForwardedRef<SublayerEditHandle>) {
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

  useImperativeHandle(
    ref,
    () => ({
      save: async (): Promise<boolean> => {
        if (
          sublayer.isTimeBased &&
          props.allSublayers.some((s) => s.isTimeBased && s.uuid !== sublayer.uuid)
        ) {
          alert(
            "Unable to save a second time-based sublayer. Please remove the first time-based sublayer before adding a new one."
          );
          return false;
        }
        const res: WrappedResponse<Sublayer[]> = await upsertSublayers([
          { ...sublayer, updatedAt: getAccurateNow().toISOString() },
        ]);
        props.refreshLayerList();
        alert(`${res.status} - ${res.message}`);
        return true;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sublayer, props.allSublayers]
  );

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

      setDataDirGeoJSONs(
        fileList
          .filter((file) => !file.isDir)
          .filter((file) => file.name.toLowerCase().endsWith(".geojson"))
          .map((file) => file.name)
      );
    })();

    setRefreshDirectoryListing(false);
  }, [props.missionId, refreshDirectoryListing]);

  //save the current editing sublayer to db

  /**
   * Find and parse the timeLayerManifest if it exists in manifest.json
   * @param folderName string
   */
  async function loadManifestFromFile(folderName: string) {
    const clearManifest = () =>
      setSublayer((state) => {
        return { ...state, timeLayerManifest: null, isTimeBased: false };
      });

    // try to read the manifest
    const res = await fetchURL(`${folderName}/manifest.json`);

    if (!res) {
      // there must not be a manifest.json file
      clearManifest();
      return;
    }

    let manifestJson: { time_layers?: TimeLayerJson[] } = {};
    try {
      manifestJson = await res.json();
    } catch (e) {
      console.error("Something went wrong reading manifest.json", e);
      clearManifest();
      return;
    }

    const timeLayerJson: TimeLayerJson[] = manifestJson.time_layers;
    if (!Array.isArray(timeLayerJson) || timeLayerJson.length === 0) {
      // a manifest.json without time_layers describes a non time-based layer
      clearManifest();
      return;
    }

    const timeLayerManifest: TimeLayerInfo[] = [];
    timeLayerJson.forEach((timeLayer, index) => {
      const layerBounds: [string, string] =
        timeLayer.lowerBound && timeLayer.upperBound
          ? [timeLayer.lowerBound, timeLayer.upperBound]
          : getManifestJsonTimeBounds(timeLayerJson, index);
      timeLayerManifest.push({
        datetime: timeLayer.datetime,
        dirName: timeLayer.dirName,
        lowerBound: layerBounds[0],
        upperBound: layerBounds[1],
      });
    });

    // set sublayer values
    setSublayer((state) => {
      return { ...state, timeLayerManifest: timeLayerManifest, isTimeBased: true };
    });
  }

  // boundingBox, minNativeZoom, maxNativeZoom
  async function loadTileMapResourceFromFile(rootPath: string) {
    let minZoom = null;
    let maxZoom = null;
    let boxArray: number[] = [];
    //read in the timemapresource.xml
    const res = await fetchURL(`${rootPath}/tilemapresource.xml`);
    if (!res) return;

    const xmlFileContent = await res.text();
    if (xmlFileContent) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlFileContent, "application/xml");

      //get bounding box
      const xmlBoundingBox = doc.querySelector("BoundingBox");
      const xmlTileSetsEl = doc.querySelector("TileSets");
      if (!xmlBoundingBox || !xmlTileSetsEl) {
        console.error(`${rootPath}/tilemapresource.xml is not a valid tile map resource`);
        return;
      }

      boxArray = [
        parseFloat(xmlBoundingBox.getAttribute("minx")),
        parseFloat(xmlBoundingBox.getAttribute("miny")),
        parseFloat(xmlBoundingBox.getAttribute("maxx")),
        parseFloat(xmlBoundingBox.getAttribute("maxy")),
      ];

      //get min/max zoom
      const xmlTileSets = xmlTileSetsEl.children;
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
  async function loadSublayerPropertiesFromFile(
    rootPath: string,
    detectedSource?: Pick<Sublayer, "type" | "path" | "tilePattern">
  ) {
    const res = await fetchURL(`${rootPath}/properties.json`);
    if (!res) return;

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
      return {
        ...state,
        ...(partialSublayerJson as SublayerImportable),
        ...detectedSource,
      };
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

  async function preloadDataFromFiles(
    folderName: string,
    detectedSource?: Pick<Sublayer, "type" | "path" | "tilePattern">
  ) {
    // clear errors from the last properties.json loaded, if there were any
    setPropertiesErrs([]);

    const rootPath = isExternal
      ? folderName
      : `/static/missionFiles/${props.missionId.toString()}/Layers/${folderName}`;

    // Each metadata file is independent — a failure reading one must not stop the others from loading.
    const loaders = [
      () => loadTileMapResourceFromFile(rootPath),
      () => loadManifestFromFile(rootPath),
      () => loadSublayerPropertiesFromFile(rootPath, detectedSource),
    ];
    for (const load of loaders) {
      try {
        await load();
      } catch (e) {
        console.error(`Could not preload metadata from ${rootPath}`, e);
      }
    }
  }

  /**
   * A user picked an internal folder from Layers/. Inspect its contents to determine the layer
   * type (a `.pmtiles` → vector-tile, a `.tif`/`.tiff` → COG raster, otherwise a raster tile
   * pyramid), set the path accordingly, and preload metadata files.
   */
  async function selectInternalFolder(folder: string) {
    if (folder === "") {
      setSublayer((state) => ({ ...state, name: "", path: "", tilePattern: "" }));
      return;
    }

    // A ZIP uploaded directly to Layers/ can extract a PMTiles or COG file at the root,
    // rather than inside a folder. Those files are already complete source paths.
    const selectedFile = props.fileList?.find((file) => file.name === folder);
    if (selectedFile && !selectedFile.isDir) {
      if (isPmtilesPath(folder)) {
        setSublayer((state) => ({
          ...state,
          type: "vector-tile",
          name: folder,
          path: folder,
          tilePattern: "",
        }));
      } else if (isCogPath(folder)) {
        setSublayer((state) => ({
          ...state,
          type: "tile",
          name: folder,
          path: folder,
          tilePattern: "",
        }));
      }
      return;
    }

    const files: GISfile[] | void = await listFiles(
      `missionFiles/${props.missionId}/Layers/${folder}`
    ).catch(console.error);
    const fileNames: string[] = files ? files.filter((f) => !f.isDir).map((f) => f.name) : [];
    const pmtiles = fileNames.find((n) => isPmtilesPath(n));
    const tif = fileNames.find((n) => isCogPath(n));

    let detectedSource: Pick<Sublayer, "type" | "path" | "tilePattern">;

    if (pmtiles) {
      // PMTiles vector-tile layer — self-describing, no tile pattern.
      detectedSource = {
        type: "vector-tile",
        path: `${folder}/${pmtiles}`,
        tilePattern: "",
      };
      setSublayer((state) => ({ ...state, ...detectedSource, name: folder }));
    } else if (tif) {
      // COG raster layer — self-describing GeoTIFF, no tile pattern.
      detectedSource = {
        type: "tile",
        path: `${folder}/${tif}`,
        tilePattern: "",
      };
      setSublayer((state) => ({ ...state, ...detectedSource, name: folder }));
    } else {
      // Raster tile pyramid — path is the folder; tilePattern is read from properties.json below.
      setSublayer((state) => ({
        ...state,
        type: "tile",
        name: folder,
        path: folder,
        tilePattern: state.tilePattern || "{z}/{x}/{y}.png",
      }));
    }

    // Pull bounding box / zoom / manifest / name / description / legend from the folder's
    // metadata files (tilemapresource.xml / manifest.json / properties.json) where present.
    await preloadDataFromFiles(folder, detectedSource);
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

  // A COG raster layer is self-describing either directly or through a time manifest whose
  // resolved frame target ends in .tif/.tiff.
  const isCogLayer =
    sublayer.type === "tile" &&
    (isCogPath(sublayer.path) ||
      (sublayer.isTimeBased && isCogPath(sublayer.timeLayerManifest?.[0]?.dirName ?? "")));
  const selectedFolder = sublayer.path ? sublayer.path.split("/")[0] : "";

  return (
    <div className={styles.sublayerEditBoxes}>
      <div className={styles.sectionDiv}>
        <div id="readOnlyDiv">UUID: {sublayer.uuid}</div>
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
                    <label htmlFor="folderNames">Internal Source </label>
                    <select
                      id="folderNames"
                      title="folder names"
                      onChange={(e) => {
                        selectInternalFolder(e.target.value);
                      }}
                      value={selectedFolder}
                    >
                      <option value="" key="">
                        None
                      </option>
                      {props.fileList
                        ?.filter(
                          (file) => file.isDir || isPmtilesPath(file.name) || isCogPath(file.name)
                        )
                        .map((file) => {
                          return (
                            <option value={file.name} key={file.name}>
                              {file.name}
                            </option>
                          );
                        })}
                    </select>
                    <br />
                    Layer type is detected from the selected source (tiles, PMTiles, or COG).
                  </>
                )}

                {/* Only a raster tile pyramid uses a {z}/{x}/{y} tile pattern; COG and
                    vector-tile (PMTiles) layers are self-describing. */}
                {sublayer.type === "tile" && !isCogLayer && (
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
                )}
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
                        setSublayer({
                          ...sublayer,
                          path: e.target.value,
                          name: e.target.value.replace(/\.geojson$/i, ""),
                        });
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
            {`${sublayer.path}${sublayer.type === "tile" && !isCogLayer ? "/" + sublayer.tilePattern : ""}`}
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
            {isCogLayer && (
              <div id="cogNoticeDiv" className={styles.editDiv}>
                COG (Cloud-Optimized GeoTIFF) — self-describing, rendered directly; no tile fields.
              </div>
            )}
            {/* A COG is self-describing (extent/resolutions read from the GeoTIFF), so the
                tile-pyramid fields below don't apply. */}
            {!isCogLayer && (
              <>
                <div id="boundingDiv">
                  <div className={styles.editDiv}>
                    <label htmlFor="boundingbox">Bounding Box (minx, miny, maxx, maxy)</label>
                  </div>
                  <div className={styles.editDiv}>
                    <textarea
                      id="boundingbox"
                      rows={4}
                      cols={40}
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
                      value={sublayer.tileFormat || "tms"}
                    >
                      <option value="tms">TMS</option>
                      <option value="xyz">XYZ</option>
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
              </>
            )}
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
        <div className={styles.sublayerEditFooter}>
          <span>Bounding Box, and Min/Max Native Zoom are pulled from tilemapresource.xml</span>
          <span>Time layer information is pulled from manifest.json</span>
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
            <span>Fields are populated when the Internal Folder changes</span>
          )}
        </div>
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
}

const SublayerEdit = forwardRef<SublayerEditHandle, SublayerProps>(SublayerEditInner);

export default SublayerEdit;
