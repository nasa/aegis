import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { deleteGrids, getGrids, upsertGrids } from "http-client/grid";
import type { ChangeEventHandler, FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { v4 as uuidv4 } from "uuid";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import prettyBytes from "pretty-bytes";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";

type RouteParams = {
  id: string;
  automergeUrl: string;
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

const AdminMissionGrid: FunctionComponent<{}> = () => {
  const navigate = useNavigate();
  const [grids, setGrids] = useState<MissionGrid[]>(null);
  const [isSubmitValid, setIsSubmitValid] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFilePicked, setIsFilePicked] = useState(false);
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);
  // We don't know what mission this is for so use the automergeUrl from the route params
  const missionDocHandle = useDocHandle<Mission>(params.automergeUrl as AutomergeUrl);

  const readAndUploadGrid = async (selectedFile: Blob) => {
    const grid: MissionGrid = await parseFullGrid(selectedFile);
    const res = await upsertGrids([grid], intMissionId, true);
    alert(`${res.status} - ${res.message}`);
    loadGrid();
  };

  const parseFullGrid = async (selectedFile: Blob) => {
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

  const readJsonFile = (file: Blob) =>
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

  const loadGrid = useCallback(async () => {
    const response = await getGrids(intMissionId);
    if (response.data) {
      setGrids(response.data);
    }
  }, [intMissionId]);

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
      missionDocHandle.change((m: Mission) => {
        m.activeGridUuid = null;
        m.updatedAt = new Date().getTime();
      });
    }
  };

  const deleteGrid = async (gridUuid: string) => {
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
    loadGrid();
  }, [intMissionId, loadGrid]);

  return (
    <div className={styles.pageStyle}>
      <div className={styles.header}>
        <Header />
      </div>

      <div className={styles.bodyContent}>
        <div className={styles.missionBack}>
          <FontAwesomeIcon
            icon={faArrowAltCircleLeft}
            size="xl"
            onClick={() => {
              navigate("/admin/missions");
            }}
          />
        </div>
      </div>

      <div>
        <div className={styles.sectionDiv}>
          <div className={styles.sectionDivHeading}>Manage grid for this mission</div>
          {intMissionId ? (
            <div>
              <div className={styles.layerContainer}>
                <div className={styles.divWithBorder}>
                  Upload grid (.geojson only)
                  <br />
                  The below values MUST correspond to the grid file you are uploading.
                  <br />
                  <a href="https://eegitlab.fit.nasa.gov/emss/aegis/-/wikis/Formatting-for-geoJSON-grid-uploads">
                    Grid Upload Instructions
                  </a>
                  <br />
                  <>
                    <br />
                    <input
                      type="file"
                      name="gridFile"
                      title="Upload File"
                      onChange={fileChangeHandler}
                    />
                    <div style={{ marginLeft: 20 }}>
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
                          <br />
                        </p>
                      ) : (
                        <p />
                      )}
                    </div>
                    <div>
                      {!isSubmitValid && isFilePicked ? (
                        <>
                          <br />
                          Please select a valid file
                        </>
                      ) : (
                        ""
                      )}
                    </div>
                  </>
                  <button
                    type="submit"
                    onClick={() => readAndUploadGrid(selectedFile)}
                    disabled={!isSubmitValid}
                  >
                    Save Mission
                  </button>
                </div>
              </div>
              <div className={styles.layerContainer}>
                <div className={styles.divWithBorder}>
                  Mission Grids
                  <div>
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
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <br />
                    <button onClick={() => handleGridSelection(null)}>Clear Active Grid</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>A new mission must be saved first before you can upload files</div>
          )}
        </div>
        <br />
        <br />
      </div>
    </div>
  );
};

export default AdminMissionGrid;
