import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import adminStyles from "./admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
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
  faPlus,
  faCaretRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import GridSquareIcon from "assets/draw-square-regular-full.svg?react";

const Layers: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const loading = useAsyncStatus("Loading layers and sublayers...");
  const { run: runLoad } = loading;
  const saving = useAsyncStatus();
  const [allLayers, setAllLayers] = useState<Layer[]>(null);
  const [allSublayers, setAllSublayers] = useState<Sublayer[]>(null);
  const [editSublayerParentUUID, setEditSublayerParentUUID] = useState("0");
  const [editComponent, setEditComponent] = useState<JSX.Element>(null);
  const [editModalTitle, setEditModalTitle] = useState<string>("");
  const [fileList, setFileList] = useState<GISfile[]>(null);
  const [layersSectionCollapsed, setLayersSectionCollapsed] = useState(false);
  const editRef = useRef<{ save: () => Promise<void> }>(null);

  const reloadLayers = useCallback(
    () =>
      runLoad("Loading layers and sublayers...", async () => {
        if (!missionId) return;
        const [layers, sublayers] = await Promise.all([
          getLayers(missionId),
          getSublayers(missionId),
        ]);
        if (!layers.data || !sublayers.data) {
          throw new Error(
            (!layers.data ? layers.message : sublayers.message) || "Unable to load layers"
          );
        }
        setAllLayers(layers.data);
        setAllSublayers(sublayers.data);
        if (layers.data.length > 0) setEditSublayerParentUUID(layers.data[0].uuid);
      }),
    [missionId, runLoad]
  );

  const openEditModal = (component: JSX.Element, title: string) => {
    saving.clearError();
    setEditComponent(component);
    setEditModalTitle(title);
  };

  const closeEditModal = () => {
    if (saving.pending) return;
    saving.clearError();
    setEditComponent(null);
    setEditModalTitle("");
  };

  //adds a new blank sublayer object to the parent layer and sets it for edit
  function addNewSublayer() {
    const newSublayer = generateBlankSublayer({
      layerUuid: editSublayerParentUUID,
    });
    openEditModal(
      <SublayerEdit
        ref={editRef}
        sublayer={newSublayer}
        allSublayers={allSublayers}
        refreshLayerList={reloadLayers}
        fileList={fileList}
        missionId={missionId}
      />,
      "Add Sub Layer"
    );
  }

  function addNewLayer() {
    const newLayer = generateBlankLayer();
    openEditModal(
      <LayerEdit
        ref={editRef}
        layer={newLayer}
        missionId={missionId}
        refreshLayerList={reloadLayers}
      />,
      "Add Header Layer"
    );
  }

  const checkLayerUsesFolder = useCallback(
    (folderName: string) => {
      if (!allSublayers) return false;
      for (const sublayer of allSublayers) {
        if (sublayer.path === folderName || sublayer.path.startsWith(`${folderName}/`)) {
          return true;
        }
      }
      return false;
    },
    [allSublayers]
  );

  useEffect(() => {
    reloadLayers();
  }, [missionId, reloadLayers]);

  return (
    <>
      <section className={adminCommon.section}>
        <AsyncStatus {...loading} />
        <h2
          className={adminCommon.sectionHeading}
          style={{
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onClick={() => setLayersSectionCollapsed((c) => !c)}
        >
          <FontAwesomeIcon icon={layersSectionCollapsed ? faCaretRight : faCaretDown} />
          Layers and Sublayers
        </h2>
        {!layersSectionCollapsed && (
          <>
            <div className={adminCommon.details}>
              <LayerList
                layers={allLayers}
                sublayers={allSublayers}
                missionId={missionId}
                refreshLayerList={reloadLayers}
                openEditModal={openEditModal}
                editRef={editRef}
                fileList={fileList}
                isLoading={!!loading.pending}
                loadError={!!loading.error}
              />
            </div>
            <div
              id="addLayer_div"
              className={adminCommon.details}
              style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div>
                <button
                  className={adminCommon.buttonPrimary}
                  type="button"
                  disabled={!!loading.pending || !!loading.error}
                  onClick={() => {
                    addNewLayer();
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} /> Add New Header Layer
                </button>
              </div>
              {allLayers?.length > 0 && (
                <div
                  id="addNewSublayer_div"
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <label
                    htmlFor="layerSelect"
                    style={{ color: "#cbd5e1", fontWeight: 600, fontSize: "0.9rem" }}
                  >
                    Select Header Layer
                  </label>
                  <select
                    id="layerSelect"
                    className={adminStyles.select}
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
                  <button
                    className={adminCommon.buttonPrimary}
                    type="button"
                    disabled={!!loading.pending || !!loading.error}
                    onClick={() => {
                      addNewSublayer();
                    }}
                  >
                    <FontAwesomeIcon icon={faPlus} /> Add New Sub Layer
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
      <section className={adminCommon.section}>
        <h2 className={adminCommon.sectionHeading}>Layer Data Files</h2>
        <p className={adminCommon.descriptionText}>
          Manage files in the /Layers folder for this mission.
        </p>
        <div className={adminCommon.details}>
          {missionId ? (
            <FileManager
              missionId={missionId}
              path={`missionFiles/${missionId}/Layers`}
              setFileList={setFileList}
              isUsed={checkLayerUsesFolder}
              usageLoading={!!loading.pending || !!loading.error}
              zipOnly={true}
            />
          ) : (
            <div className={adminCommon.emptyState}>
              A new mission must be saved first before you can upload files
            </div>
          )}
        </div>
      </section>
      {editComponent && (
        <div className={adminCommon.modalOverlay} onClick={closeEditModal}>
          <div
            className={adminCommon.modal}
            style={{ maxWidth: "1300px", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={adminCommon.modalHeader}>
              <h2 className={adminCommon.modalTitle}>{editModalTitle}</h2>
              <button
                disabled={!!saving.pending}
                className={adminCommon.modalClose}
                onClick={closeEditModal}
                title="Close"
              >
                ✕
              </button>
            </div>
            <fieldset
              className={adminCommon.modalBody}
              disabled={!!saving.pending}
              style={{ border: 0, margin: 0, minWidth: 0 }}
            >
              {editComponent}
            </fieldset>
            <AsyncStatus {...saving} />
            <div className={adminCommon.modalFooter}>
              <button
                disabled={!!saving.pending}
                className={adminCommon.buttonCancel}
                type="button"
                onClick={closeEditModal}
              >
                Cancel
              </button>
              <button
                className={adminCommon.buttonPrimary}
                type="button"
                disabled={!!saving.pending}
                onClick={() =>
                  saving.run("Saving layer...", async () => {
                    await editRef.current?.save();
                    setEditComponent(null);
                    setEditModalTitle("");
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
  openEditModal: (component: JSX.Element, title: string) => void;
  editRef: React.RefObject<{ save: () => Promise<void> }>;
  fileList: GISfile[];
  isLoading: boolean;
  loadError: boolean;
}) => {
  const action = useAsyncStatus();
  const [collapsedLayers, setCollapsedLayers] = useState<string[]>([]);

  async function delSubLayer(sublayer: Sublayer) {
    if (confirm("Are you sure you want to delete sublayer " + sublayer.name)) {
      const res: WrappedResponse<null> = await deleteSublayers(props.missionId, [sublayer.uuid]);
      await props.refreshLayerList(); //reload layer listing in parent component.
      if (res.status !== "success") {
        throw new Error(res.message || "Failed to delete sublayer");
      }
    }
  }

  async function delLayer(layer: Layer) {
    if (confirm("Are you sure you want to delete layer " + layer.name)) {
      if (props.sublayers.some((sublayer) => sublayer.layerUuid === layer.uuid)) {
        throw new Error(
          `Cannot delete layer ${layer.name}. This layer has sublayers. Delete sublayers first.`
        );
      }
      const res: WrappedResponse<null> = await deleteLayers(props.missionId, [layer.uuid]);
      await props.refreshLayerList(); //reload layer listing in parent component.
      if (res.status !== "success") {
        throw new Error(res.message || "Failed to delete layer");
      }
    }
  }

  const setEdit = (type: "layer" | "sublayer", layerOrSublayer: Layer | Sublayer) => {
    if (type === "layer") {
      const layer = layerOrSublayer as Layer;
      props.openEditModal(
        <LayerEdit
          ref={props.editRef}
          layer={layer}
          missionId={props.missionId}
          refreshLayerList={props.refreshLayerList}
        />,
        layer.name ? `Edit Header "${layer.name}"` : "Edit Header Layer"
      );
    } else if (type === "sublayer") {
      const sublayer = layerOrSublayer as Sublayer;
      props.openEditModal(
        <SublayerEdit
          ref={props.editRef}
          sublayer={sublayer}
          allSublayers={props.sublayers}
          refreshLayerList={props.refreshLayerList}
          fileList={props.fileList}
          missionId={props.missionId}
        />,
        sublayer.name ? `Edit Sublayer "${sublayer.name}"` : "Edit Sublayer"
      );
    }
  };

  if (props.layers?.length > 0) {
    return (
      <ul style={{ paddingLeft: "1.2rem", margin: "8px 0", listStyle: "none" }}>
        {(action.pending || action.error) && (
          <li>
            <AsyncStatus {...action} />
          </li>
        )}
        {props.layers.map((layer) => {
          return (
            <li key={layer.uuid} className={adminStyles.layerListItem}>
              <FontAwesomeIcon
                icon={collapsedLayers.includes(layer.uuid) ? faCaretRight : faCaretDown}
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
                style={{ marginRight: 6 }}
              />
              <span
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => {
                  if (!collapsedLayers.includes(layer.uuid)) {
                    setCollapsedLayers([...collapsedLayers, layer.uuid]);
                  } else {
                    setCollapsedLayers(collapsedLayers.filter((uuid) => uuid !== layer.uuid));
                  }
                }}
              >
                {layer.name}
              </span>
              &nbsp;
              <span className={adminStyles.layerButtons}>
                <button
                  disabled={!!action.pending || props.isLoading || props.loadError}
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    setEdit("layer", layer);
                  }}
                >
                  Edit
                </button>
                <button
                  disabled={!!action.pending || props.isLoading || props.loadError}
                  className={adminCommon.buttonDanger}
                  type="button"
                  onClick={() => {
                    action.run("Deleting layer...", () => delLayer(layer));
                  }}
                >
                  Delete
                </button>
              </span>
              &nbsp; {layer.uuid ? "" : "Missing UUID"}
              {!collapsedLayers.includes(layer.uuid) &&
                props.sublayers?.map((sublayer) => {
                  if (sublayer.layerUuid !== layer.uuid) return;
                  return (
                    <ul
                      key={sublayer.uuid}
                      style={{ paddingLeft: "1.2rem", margin: "4px 0", listStyle: "none" }}
                    >
                      <li className={adminStyles.layerListItem}>
                        {sublayer.type === "tile" && (
                          <FontAwesomeIcon icon={faLayerGroup} style={{ marginRight: 4 }} />
                        )}
                        {sublayer.type === "vector-tile" && (
                          <GridSquareIcon className={adminStyles.iconSvg} />
                        )}
                        {sublayer.type === "vector" && (
                          <FontAwesomeIcon icon={faBezierCurve} style={{ marginRight: 4 }} />
                        )}
                        {sublayer.isTimeBased && (
                          <FontAwesomeIcon icon={faClock} style={{ marginRight: 4 }} />
                        )}
                        {sublayer.name}&nbsp;
                        <span className={adminStyles.layerButtons}>
                          <button
                            disabled={!!action.pending || props.isLoading || props.loadError}
                            className={adminCommon.button}
                            type="button"
                            onClick={() => {
                              setEdit("sublayer", sublayer);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            disabled={!!action.pending || props.isLoading || props.loadError}
                            className={adminCommon.buttonDanger}
                            type="button"
                            onClick={() => {
                              action.run("Deleting sublayer...", () => delSubLayer(sublayer));
                            }}
                          >
                            Delete
                          </button>
                        </span>
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
    return !props.isLoading && !props.loadError ? <div>No Layers Found</div> : null;
  }
};

export default Layers;
