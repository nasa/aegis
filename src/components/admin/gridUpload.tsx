import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { deleteGrids, getGrids, upsertGrids } from "http-client/grid";
import type { ChangeEventHandler, FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import styles from "components/admin/admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
import { v4 as uuidv4 } from "uuid";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
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

const parseFullGrid = async (selectedFile: Blob, intMissionId: number): Promise<MissionGrid> => {
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
      uuid: uuidv4(),
      numRows: parsedData.row_total,
      numCols: parsedData.column_total,
      missionId: intMissionId,
      spacing: 0,
      name: parsedData.name,
      fileName: `${parsedData.name}_${Date.now()}.json`,
      isActiveGrid: false,
    },
    coordinates: gridCoords,
  } as MissionGrid;
};

const AdminMissionGrid: FunctionComponent<{}> = () => {
  const [grids, setGrids] = useState<MissionGrid[]>(null);
  const [isSubmitValid, setIsSubmitValid] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFilePicked, setIsFilePicked] = useState(false);
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
  const [missionDoc, changeMissionDoc] = useDocument<Mission>(automergeUrl);

  const readAndUploadGrid = async (selectedFile: Blob) => {
    const grid: MissionGrid = await parseFullGrid(selectedFile, intMissionId);
    const res = await upsertGrids([grid], intMissionId, true);
    alert(`${res.status} - ${res.message}`);
    const reloadResponse = await getGrids(intMissionId);
    if (reloadResponse.data) {
      setGrids(reloadResponse.data);
    }
  };

  const fileChangeHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]); //put into state
      setIsFilePicked(true); //toggle to show file details
    } else {
      setSelectedFile(null);
      setIsFilePicked(false);
      setIsSubmitValid(false);
    }
  };

  const handleGridSelection = async (selectedUuid: string) => {
    setGrids((prevGrids) =>
      prevGrids.map((grid) => ({
        coordinates: grid.coordinates,
        gridInformation: {
          ...grid.gridInformation,
          isActiveGrid: grid.gridInformation.uuid === selectedUuid,
        },
      }))
    );
    await upsertGrids(grids, intMissionId, false);
    if (selectedUuid === null) {
      changeMissionDoc((m: Mission) => {
        m.activeGridUuid = null;
        m.updatedAt = new Date().getTime();
      });
    }
  };

  const deleteGrid = async (gridUuid: string) => {
    const grid = grids.find((g) => g.gridInformation.uuid === gridUuid);
    if (
      !confirm(`Are you sure you want to delete grid "${grid?.gridInformation.name ?? gridUuid}"?`)
    )
      return;
    await deleteGrids(gridUuid, intMissionId);
    setGrids((prevGrids) => prevGrids.filter((grid) => grid.gridInformation.uuid !== gridUuid));
  };

  useEffect(() => {
    if (selectedFile?.name.slice(-8).toLowerCase() === ".geojson") {
      setIsSubmitValid(true);
    } else {
      setIsSubmitValid(false);
    }
  }, [grids, intMissionId, isFilePicked, selectedFile?.name]);

  useEffect(() => {
    const upsertGridInfo = async () => {
      await upsertGrids(grids, intMissionId, false);
    };

    if (grids?.length > 0) {
      upsertGridInfo();
    }
  }, [grids, intMissionId]);

  useEffect(() => {
    const loadGrid = async () => {
      const response = await getGrids(intMissionId);
      if (response.data) {
        setGrids(response.data);
      }
    };
    loadGrid();
  }, [intMissionId]);

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
                <p>Upload grid (.geojson only)</p>
                <p>The below values MUST correspond to the grid file you are uploading.</p>
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
                  {isFilePicked ? (
                    <p>
                      Filename: {selectedFile.name}
                      <br />
                      Filetype: {selectedFile.type}
                      <br />
                      File size: {prettyBytes(selectedFile.size)}
                      <br />
                      Last modified date:{" "}
                      {
                        selectedFile.lastModifiedDate
                          ? selectedFile.lastModifiedDate.toLocaleDateString()
                          : "Not Available" //some browsers don't have this data (Firefox, Safari)
                      }
                    </p>
                  ) : null}
                </div>
                {!isSubmitValid && isFilePicked ? (
                  <p style={{ color: "#f87171" }}>Please select a valid file</p>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    className={adminCommon.buttonPrimary}
                    type="submit"
                    onClick={() => readAndUploadGrid(selectedFile)}
                    disabled={!isSubmitValid}
                  >
                    Save Mission
                  </button>
                </div>
              </div>

              <div className={adminCommon.details}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>Mission Grids</h3>
                {grids && (
                  <table className={styles.fileTable}>
                    <thead>
                      <tr>
                        <th>Grid Name</th>
                        <th>Rows</th>
                        <th>Columns</th>
                        <th>Active</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grids.map((grid) => (
                        <tr key={grid.gridInformation.uuid}>
                          <td>{grid.gridInformation.name}</td>
                          <td>{grid.gridInformation.numRows}</td>
                          <td>{grid.gridInformation.numCols}</td>
                          <td className={styles.gridInputContainer}>
                            <input
                              type="radio"
                              id={grid.gridInformation.uuid}
                              name="chooseGrid"
                              checked={grid.gridInformation.isActiveGrid}
                              onChange={() => handleGridSelection(grid.gridInformation.uuid)}
                            />
                          </td>
                          <td className={styles.gridInputContainer}>
                            <FontAwesomeIcon
                              icon={faTrash}
                              onClick={() => deleteGrid(grid.gridInformation.uuid)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 12 }}>
                  <button className={adminCommon.button} onClick={() => handleGridSelection(null)}>
                    Clear Active Grid
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
