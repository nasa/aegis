import { Dispatch, FunctionComponent, useCallback, useEffect, useState } from "react";
import adminStyles from "./admin.module.css";
import LayerEdit from "components/admin/layerEdit";
import SublayerEdit from "components/admin/layerSublayerEdit";
import { deleteLayers, getLayers } from "http-client/layer";
import FileManager from "components/admin/fileManager";
import { deleteSublayers, getSublayers } from "http-client/sublayer";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import {
  faLayerGroup,
  faBezierCurve,
  faClock,
  faCaretDown,
  faCaretUp,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import GridSquareIcon from "assets/draw-square-regular-full.svg?react";
import { getAutomergeDocListing } from "http-client/docListing";
import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useRepo } from "@automerge/automerge-repo-react-hooks";

const Layers: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const automergeRepo = useRepo();

  const [allLayers, setAllLayers] = useState<Layer[]>(null);
  const [allSublayers, setAllSublayers] = useState<Sublayer[]>(null);
  const [editSublayerParentUUID, setEditSublayerParentUUID] = useState("0");
  const [editComponent, setEditComponent] = useState<JSX.Element>(null);
  const [fileList, setFileList] = useState<GISfile[]>(null);
  const [automergeMission, setAutomergeMission] = useState<Mission>(null);
  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();

  const reloadLayers = useCallback(() => {
    if (!missionId) return;
    const getLayersAsync = async () => {
      //load layers
      const resLayers = await getLayers(missionId);
      if (resLayers.data) {
        setAllLayers(resLayers.data);
        if (resLayers.data.length > 0) setEditSublayerParentUUID(resLayers.data[0].uuid);
      }

      //load sublayers
      const resSublayer = await getSublayers(missionId);
      if (resSublayer.data) {
        setAllSublayers(resSublayer.data);
      }
    };
    getLayersAsync();
  }, [missionId]);

  //adds a new blank sublayer object to the parent layer and sets it for edit
  function addNewSublayer() {
    const newSublayer = generateBlankSublayer({
      layerUuid: editSublayerParentUUID,
      missionId: missionId,
    });
    setEditComponent(
      <SublayerEdit
        sublayer={newSublayer}
        allSublayers={allSublayers}
        refreshLayerList={reloadLayers}
        fileList={fileList}
        missionId={missionId}
      />
    );
  }

  function addNewLayer() {
    const newLayer = generateBlankLayer({ missionId });
    setEditComponent(<LayerEdit layer={newLayer} refreshLayerList={reloadLayers} />);
  }

  const checkLayerUsesFolder = useCallback(
    (folderName: string) => {
      if (!allSublayers) return false;
      for (const sublayer of allSublayers) {
        if (sublayer.path === folderName) {
          return true;
        }
      }
    },
    [allSublayers]
  );

  // get the automerge URL from the automerge records db
  const getAutomerge = useCallback(async () => {
    if (!missionId) return;
    const res = await getAutomergeDocListing(missionId);
    if (isValidAutomergeUrl(res.data[0].automergeUrl)) {
      setAutomergeUrl(res.data[0].automergeUrl);
    }
  }, [missionId]);

  // load the mission from automerge once we've got the URL
  useEffect(() => {
    if (!automergeUrl || !automergeRepo) return;
    (async () => {
      const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(automergeUrl);
      setAutomergeMission(missionDocHandle.doc());
    })();
  }, [automergeRepo, automergeUrl]);

  useEffect(() => {
    reloadLayers();
    getAutomerge();
  }, [missionId, reloadLayers, getAutomerge]);

  return (
    <div>
      <h2>Layers for Mission: {automergeMission?.name}</h2>
      <div className={adminStyles.layerContainer}>
        <div>
          <div id="layerList_div" className={adminStyles.sectionDiv}>
            <div className={adminStyles.sectionDivHeading}>Layers and Sublayers</div>
            <LayerList
              layers={allLayers}
              sublayers={allSublayers}
              missionId={missionId}
              refreshLayerList={reloadLayers}
              setEditComponent={setEditComponent}
              fileList={fileList}
            />
          </div>
          <div id="addLayer_div">
            <button
              type="button"
              onClick={() => {
                addNewLayer();
              }}
            >
              Add New Header Layer (Clear Form)
            </button>
            <br />
            {allLayers?.length > 0 && (
              <div id="addNewSublayer_div">
                <label htmlFor="layerSelect" className={adminStyles.selectLabel}>
                  Select Header Layer
                </label>
                &nbsp;
                <select
                  id="layerSelect"
                  onChange={(e) => setEditSublayerParentUUID(e.target.value)}
                  value={editSublayerParentUUID}
                >
                  {allLayers.map((layer: Layer) => {
                    return (
                      <option key={"select" + layer.uuid} value={layer.uuid}>
                        {`${layer.name}`}
                      </option>
                    );
                  })}
                </select>
                &nbsp;
                <button
                  type="button"
                  onClick={() => {
                    addNewSublayer();
                  }}
                >
                  Add New Sub Layer (Clear Form)
                </button>
              </div>
            )}
          </div>
        </div>
        <div id="editLayer_div">
          <>{editComponent}</>
        </div>
      </div>
      <div className={adminStyles.sectionDiv} style={{ width: "fit-content" }}>
        <div className={adminStyles.sectionDivHeading}>
          Manage files in the /Layers folder for this mission
        </div>
        {missionId ? (
          <FileManager
            missionId={missionId}
            path={`missionFiles/${missionId}/Layers`}
            setFileList={setFileList}
            isUsed={checkLayerUsesFolder}
            zipOnly={true}
          />
        ) : (
          <div>A new mission must be saved first before you can upload files</div>
        )}
      </div>
    </div>
  );
};

/**
 * Component to list out all the layers and sublayers in bulleted form
 * @returns
 */
const LayerList = (props: {
  layers: Layer[];
  sublayers: Sublayer[];
  missionId: number;
  refreshLayerList: Function;
  setEditComponent: Dispatch<JSX.Element>;
  fileList: GISfile[];
}) => {
  const [collapsedLayers, setCollapsedLayers] = useState<string[]>([]);

  async function delSubLayer(sublayer: Sublayer) {
    if (confirm("Are you sure you want to delete sublayer " + sublayer.name)) {
      const res: WrappedResponse<null> = await deleteSublayers([sublayer.uuid]);
      alert(`Delete sublayer ${res.status} - ${res.message}`);
      props.refreshLayerList(); //reload layer listing in parent component.
    }
  }

  async function delLayer(layer: Layer) {
    if (confirm("Are you sure you want to delete layer " + layer.name)) {
      if (props.sublayers.some((sublayer) => sublayer.layerUuid === layer.uuid)) {
        alert(
          `Error: Cannot delete layer ${layer.name}. This layer has sublayers. Delete sublayers first`
        );
      } else {
        const res: WrappedResponse<null> = await deleteLayers([layer.uuid]);
        alert(`Delete ${res.status} - ${res.message} for uuid ${layer.uuid}`);
        props.refreshLayerList(); //reload layer listing in parent component.
      }
    }
  }

  const setEdit = (type: "layer" | "sublayer", layerOrSublayer: Layer | Sublayer) => {
    if (type === "layer") {
      props.setEditComponent(
        <LayerEdit layer={layerOrSublayer as Layer} refreshLayerList={props.refreshLayerList} />
      );
    } else if (type === "sublayer") {
      props.setEditComponent(
        <SublayerEdit
          sublayer={layerOrSublayer as Sublayer}
          allSublayers={props.sublayers}
          refreshLayerList={props.refreshLayerList}
          fileList={props.fileList}
          missionId={props.missionId}
        />
      );
    }
  };

  if (props.layers?.length > 0) {
    return (
      <ul>
        {props.layers.map((layer) => {
          return (
            <li key={layer.uuid}>
              <FontAwesomeIcon
                icon={collapsedLayers.includes(layer.uuid) ? faCaretUp : faCaretDown}
                onClick={() => {
                  if (!collapsedLayers.includes(layer.uuid)) {
                    const newCollapsed = [...collapsedLayers];
                    newCollapsed.push(layer.uuid);
                    setCollapsedLayers(newCollapsed);
                  } else {
                    setCollapsedLayers(collapsedLayers.filter((uuid) => uuid !== layer.uuid));
                  }
                }}
                className={adminStyles.collapsable}
              />
              &nbsp;
              {layer.name}&nbsp;
              <button
                type="button"
                onClick={() => {
                  setEdit("layer", layer);
                }}
              >
                Edit Header Layer
              </button>
              &nbsp;
              <button
                className={adminStyles.deleteButton}
                type="button"
                onClick={() => {
                  delLayer(layer);
                }}
              >
                Delete Layer
              </button>
              &nbsp; {layer.uuid ? "" : "Missing UUID"}
              {!collapsedLayers.includes(layer.uuid) &&
                props.sublayers?.map((sublayer) => {
                  if (sublayer.layerUuid !== layer.uuid) return;
                  return (
                    <ul key={sublayer.uuid}>
                      <li>
                        {sublayer.type === "tile" && <FontAwesomeIcon icon={faLayerGroup} />}
                        {sublayer.type === "vector-tile" && (
                          <GridSquareIcon className={adminStyles.iconSvg} />
                        )}
                        {sublayer.type === "vector" && <FontAwesomeIcon icon={faBezierCurve} />}
                        {sublayer.isTimeBased && <FontAwesomeIcon icon={faClock} />}
                        &nbsp;
                        {sublayer.name}
                        &nbsp;
                        <button
                          type="button"
                          onClick={() => {
                            setEdit("sublayer", sublayer);
                          }}
                        >
                          Edit Sublayer
                        </button>
                        &nbsp;
                        <button
                          className={adminStyles.deleteButton}
                          type="button"
                          onClick={() => {
                            delSubLayer(sublayer);
                          }}
                        >
                          Delete Sublayer
                        </button>
                        &nbsp;{sublayer.uuid ? "" : "Missing UUID"}
                      </li>
                    </ul>
                  );
                })}
            </li>
          );
        })}
      </ul>
    );
  } else {
    return <div>No Layers Found</div>;
  }
};

export default Layers;
