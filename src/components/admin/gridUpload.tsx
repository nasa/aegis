import { deleteGrid, getGrid, upsertGrid } from "http-client/grid";
import type { ChangeEventHandler, FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import adminCommon from "pages/admin/adminCommon.module.css";
import prettyBytes from "pretty-bytes";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { getAutomergeDocListing } from "http-client/docListing";

type RouteParams = {
  id: string;
};

interface GridGeoJson {
  crs: JSON;
  features: ReadGridPoint[];
  name: string;
  type: string;
  row_total: number;
  column_total: number;
  spacing?: number; // metres between adjacent grid lines (added by the GIS pipeline)
}
interface ReadGridPoint {
  geometry: GridPointGeometry;
  properties: GridPointProps;
  type: string;
}
interface GridPointGeometry {
  coordinates: number[];
  type: string;
}
interface GridPointProps {
  LGRS_ACC: string;
  L_coord: string;
  R_coord: string;
  column: number;
  id: number;
  row: number;
}

const readJsonFile = (file: Blob): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      if (event.target) {
        resolve(JSON.parse(event.target.result as string));
      }
    };
    fileReader.onerror = (error) => reject(error);
    fileReader.readAsText(file);
  });

const parseFullGrid = async (selectedFile: Blob): Promise<MissionGrid> => {
  const parsedData: GridGeoJson = (await readJsonFile(selectedFile)) as GridGeoJson;

  const gridCoords: MissionGridPoint[][] = Array(parsedData.row_total)
    .fill(null)
    .map(() => Array(parsedData.column_total).fill(null));

  parsedData.features.forEach((point: ReadGridPoint) => {
    const coords = point.geometry.coordinates;
    const props = point.properties;
    if (props.row > parsedData.row_total || props.column > parsedData.column_total) {
      return null;
    }
    gridCoords[parsedData.row_total - props.row - 1][props.column] = {
      id: props.id,
      coordinates: { lat: coords[1], lng: coords[0] },
      name: props?.L_coord + " " + props?.R_coord,
      index: { row: parsedData.row_total - props.row - 1, col: props.column },
    } as MissionGridPoint;
  });

  return {
    gridInformation: {
      numRows: parsedData.row_total,
      numCols: parsedData.column_total,
      spacing: parsedData.spacing ?? 0,
      name: parsedData.name,
      fileName: `${parsedData.name}_${Date.now()}.json`,
    },
    coordinates: gridCoords,
  };
};

const AdminMissionGrid: FunctionComponent<{}> = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFilePicked, setIsFilePicked] = useState(false);
  const [isSubmitValid, setIsSubmitValid] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();
  useEffect(() => {
    getAutomergeDocListing(intMissionId).then((res) => {
      if (res.data?.[0] && isValidAutomergeUrl(res.data[0].automergeUrl)) {
        setAutomergeUrl(res.data[0].automergeUrl as AutomergeUrl);
      }
    });
  }, [intMissionId]);
  const [missionDoc] = useDocument<Mission>(automergeUrl);
  const grid = missionDoc?.grid ?? null;

  const readAndUploadGrid = async (fileToUpload: File) => {
    setIsUploading(true);
    try {
      const parsedGrid: MissionGrid = await parseFullGrid(fileToUpload);
      // Sanity check that the coordinate file we just read matches what the
      // server will report before writing.
      await upsertGrid(parsedGrid, intMissionId, true);
      // Confirm the server persisted the metadata to the mission doc.
      await getGrid(intMissionId);
      setSelectedFile(null);
      setIsFilePicked(false);
      setIsSubmitValid(false);
      alert("Grid uploaded successfully.");
    } finally {
      setIsUploading(false);
    }
  };

  const fileChangeHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setIsFilePicked(true);
    } else {
      setSelectedFile(null);
      setIsFilePicked(false);
      setIsSubmitValid(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(`Are you sure you want to delete the grid "${grid?.name ?? ""}" for this mission?`)
    )
      return;
    await deleteGrid(intMissionId);
  };

  useEffect(() => {
    if (selectedFile?.name.toLowerCase().endsWith(".json")) {
      setIsSubmitValid(true);
    } else {
      setIsSubmitValid(false);
    }
  }, [isFilePicked, selectedFile?.name]);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Mission Grid</h1>
        {missionDoc?.name && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionDoc.name}</span>
          </div>
        )}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Grid</h2>
          {intMissionId ? (
            <div>
              <div className={adminCommon.details} style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>Current Grid</h3>
                {grid ? (
                  <table>
                    <tbody>
                      <tr>
                        <td style={{ paddingRight: 16 }}>Name</td>
                        <td>{grid.name}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingRight: 16 }}>Rows</td>
                        <td>{grid.numRows}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingRight: 16 }}>Columns</td>
                        <td>{grid.numCols}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingRight: 16 }}>Spacing (m)</td>
                        <td>{grid.spacing || "unknown"}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p>No grid has been uploaded for this mission.</p>
                )}
                {grid && (
                  <div style={{ marginTop: 12 }}>
                    <button className={adminCommon.button} onClick={handleDelete}>
                      Delete Grid
                    </button>
                  </div>
                )}
              </div>

              <div className={adminCommon.details}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>
                  {grid ? "Replace Grid" : "Upload Grid"}
                </h3>
                <p>
                  Upload grid (LGRS.json from the GIS pipeline, or .geojson). Uploading replaces the
                  mission&apos;s grid.
                </p>
                <p>
                  <a
                    href="https://eegitlab.fit.nasa.gov/emss/aegis/-/wikis/Formatting-for-geoJSON-grid-uploads"
                    style={{ color: "#60a5fa" }}
                  >
                    Grid Upload Instructions
                  </a>
                </p>
                <input
                  type="file"
                  name="gridFile"
                  title="Upload File"
                  onChange={fileChangeHandler}
                  style={{ marginTop: 8 }}
                />
                <div style={{ marginTop: 8 }}>
                  {isFilePicked && selectedFile ? (
                    <p>
                      Filename: {selectedFile.name}
                      <br />
                      Filetype: {selectedFile.type}
                      <br />
                      File size: {prettyBytes(selectedFile.size)}
                    </p>
                  ) : null}
                </div>
                {!isSubmitValid && isFilePicked ? (
                  <p style={{ color: "#f87171" }}>Please select a valid .json/.geojson file</p>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    className={adminCommon.buttonPrimary}
                    type="submit"
                    onClick={() => readAndUploadGrid(selectedFile)}
                    disabled={!isSubmitValid || isUploading}
                  >
                    {isUploading ? "Uploading..." : "Upload Grid"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={adminCommon.emptyState}>
              A new mission must be saved first before you can upload files
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default AdminMissionGrid;
