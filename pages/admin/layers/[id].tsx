import { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import LayerEdit from "components/admin/layerEdit";
import SublayerEdit from "components/admin/sublayerEdit";
import { deleteLayer, getLayers, upsertLayer } from "http-client/layer";
import { createNewLayer, createNewSublayer } from "components/admin/helper";
import { getMissions } from "http-client/mission";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import FileManager from "components/admin/fileManager";

const Layers: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [missionName, setMissionName] = useState<string>("");

  const [allLayers, setAllLayers] = useState<Layer[]>(null);
  const [editLayer, setEditLayer] = useState<Layer>(null);

  const [editSublayerIndex, setEditSublayerIndex] = useState<number>(null);
  const [editSublayerParentUUID, setEditSublayerParentUUID] = useState("0");

  const [fileList, setFileList] = useState<GISfile[]>(null);

  async function loadLayersfromDB(missionId: number) {
    if (missionId) {
      //load layers
      const res = await getLayers(missionId);
      if (res.data) {
        setAllLayers(res.data);
        if (res.data.length > 0) setEditSublayerParentUUID(res.data[0].uuid);
      }
    }
  }

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      //set mission id state
      const { id } = router.query;
      const intMissionId = parseInt(Array.isArray(id) ? id[0] : id);
      const response = await isLoggedIn(); //check user is logged in
      if (
        response.status === "success" &&
        (response.data.user.isAdmin || response.data.user.isSuperAdmin)
      ) {
        if (
          !response.data.user.isSuperAdmin &&
          !response.data.user.permissionList.some(
            (p) => p.missionId === intMissionId && p.permissions.edit
          )
        ) {
          await router.push("/"); //no permissions to this mission
        }

        setMissionIdSlug(+id);

        //set mission name
        const mission = (await getMissions(intMissionId)).data;
        if (mission) {
          setMissionName(mission[0].name);
        }
      } else {
        await router.push("/");
      }
    })();
  }, [router]);

  //realod db when mission id changes
  useEffect(() => {
    (async () => {
      if (missionIdSlug) {
        await loadLayersfromDB(missionIdSlug);
      }
    })();
  }, [missionIdSlug]);

  //set the current layer and sublayer being edited
  function setCurrentlyEditing(layer: Layer, sublayerIndex: number) {
    setEditLayer(layer);
    setEditSublayerIndex(sublayerIndex);
  }

  //adds a new blank sublayer object to the parent layer and sets it for edit
  function addNewSublayer() {
    const selectedParentLayer = _.cloneDeep(
      allLayers.find((layer) => layer.uuid === editSublayerParentUUID)
    ); //create copy to set in state
    if (selectedParentLayer) {
      selectedParentLayer.layerConfig.sublayers.push(createNewSublayer("tile")); //default new layer to a tile type
      setCurrentlyEditing(
        selectedParentLayer,
        selectedParentLayer.layerConfig.sublayers.length - 1
      );
    } else {
      alert("Error adding new sublayer");
    }
  }

  //save the current editing layer to db
  async function saveLayer() {
    if (editLayer) {
      //loop through sublayers and assign UUIDs if they don't already have one
      for (const sublayer of editLayer.layerConfig.sublayers) {
        if (!sublayer.uuid) sublayer.uuid = uuidv4();
      }

      const res: WrappedResponse<Layer> = await upsertLayer(editLayer);
      await loadLayersfromDB(missionIdSlug);
      alert(`${res.status} - ${res.message}`);
    }
  }

  //inserts uuids for any layer/sublayer if it doesn't exist
  //Once all presets in all environments have UUIDs this func and button can be removed.
  async function fixLayerUuids() {
    let totalCount = 0;
    for (const layer of allLayers) {
      let updateCount = 0;
      if (!layer.uuid) {
        layer.uuid = uuidv4();
        updateCount++;
      }
      for (const sublayer of layer.layerConfig.sublayers) {
        if (!sublayer.uuid) {
          sublayer.uuid = uuidv4();
          updateCount++;
        }
      }
      if (updateCount > 0) {
        await upsertLayer(layer);
      }
      totalCount += updateCount;
    }
    if (totalCount > 0) {
      await loadLayersfromDB(missionIdSlug);
    }
    alert(`Complete - ${totalCount} layers/sublayers did not have UUIDs`);
  }

  const checkLayerUsesFolder = useCallback(
    (folderName: string) => {
      for (const layer of allLayers) {
        for (const sublayers of layer.layerConfig.sublayers) {
          if (sublayers.aegisURL?.startsWith(folderName + "/")) {
            return true;
          }
        }
      }
    },
    [allLayers]
  );

  return (
    <div>
      <h2>Mission: {missionName}</h2>
      <button
        type="button"
        onClick={() => {
          router.push("/admin/mission");
        }}
      >
        Back to Mission
      </button>
      <div id="layerList_div">
        <h3>Layers and Sublayers</h3>
        <button
          type="button"
          onClick={() => {
            fixLayerUuids();
          }}
        >
          Fix Layer/Sublayer UUIDs
        </button>
        <LayerList
          layers={allLayers}
          missionId={missionIdSlug}
          refreshLayerList={loadLayersfromDB}
          setEdit={setCurrentlyEditing}
        />
      </div>
      <div id="addLayer_div">
        <button
          type="button"
          onClick={() => {
            setCurrentlyEditing(createNewLayer(missionIdSlug), null);
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
                    {`${layer.layerConfig.name}`}
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
      <br />
      <div className={adminStyles.sectionDiv}>
        Manage files in the /Layers folder for this mission
        <br />
        <br />
        {missionIdSlug ? (
          <>
            <FileManager
              path={`missionFiles/${missionIdSlug}/Layers`}
              setFileList={setFileList}
              isUsed={checkLayerUsesFolder}
            />
          </>
        ) : (
          <div>A new mission must be saved first before you can upload files</div>
        )}
      </div>
      <div id="editLayer_div">
        {editLayer && editSublayerIndex === null && (
          <>
            {editLayer.uuid ? (
              <h3>Edit Header Layer &quot;{editLayer.layerConfig.name}&quot;</h3>
            ) : (
              <h3>Add Header Layer</h3>
            )}
            <button
              type="button"
              onClick={() => {
                saveLayer();
              }}
            >
              Save Header Layer
            </button>
            <LayerEdit layer={editLayer} setLayer={setEditLayer} />
          </>
        )}
        {editSublayerIndex !== null && editLayer && (
          <>
            {editLayer.layerConfig.sublayers[editSublayerIndex].name ? (
              <h3>
                Edit Sublayer &quot;{editLayer.layerConfig.sublayers[editSublayerIndex].name}&quot;
              </h3>
            ) : (
              <h3>Edit Sublayer</h3>
            )}

            <button
              type="button"
              onClick={() => {
                saveLayer();
              }}
            >
              Save Sublayer
            </button>
            <br />
            <SublayerEdit
              sublayerIndex={editSublayerIndex}
              sublayer={editLayer.layerConfig.sublayers[editSublayerIndex]}
              setLayer={setEditLayer}
              missionId={missionIdSlug}
              fileList={fileList}
            />
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Component to list out all the layers and sublayers in bulleted form
 * @param props
 *  layers: Array of Layers to render.
 *  missionId: Mission ID used tp refresh the layer list.
 *  refreshLayerList: function to refresh layer list. Takes in mission Id.
 *  setEditLayer: function to set the state of which layer is currently being edited.
 * @returns
 */
const LayerList = (props: {
  layers: Layer[];
  missionId: number;
  refreshLayerList: (missionId: number) => {};
  setEdit: (layer: Layer, sublayerIndex: number) => void;
}) => {
  async function delSubLayer(layer: Layer, sublayerIndex: number) {
    if (
      confirm(
        "Are you sure you want to delete sublayer " +
          layer.layerConfig.sublayers[sublayerIndex].name
      )
    ) {
      layer.layerConfig.sublayers.splice(sublayerIndex, 1);
      const res: WrappedResponse<Layer> = await upsertLayer(layer);
      alert(`Delete sublayer ${res.status} - ${res.message}`);
      props.refreshLayerList(props.missionId); //reload layer listing in parent component.
    }
  }

  async function delLayer(layer: Layer) {
    if (confirm("Are you sure you want to delete layer " + layer.layerConfig.name)) {
      if (layer.layerConfig.sublayers?.length > 0) {
        alert(
          `Error: Cannot delete layer ${layer.layerConfig.name}. This layer has sublayers. Delete sublayers first`
        );
      } else {
        const res: WrappedResponse<null> = await deleteLayer(layer.uuid, props.missionId);
        alert(`Delete ${res.status} - ${res.message} for uuid ${layer.uuid}`);
        props.refreshLayerList(props.missionId); //reload layer listing in parent component.
      }
    }
  }

  if (props.layers?.length > 0) {
    return (
      <ul>
        {props.layers.map((layer) => {
          return (
            <li key={"layer" + layer.uuid}>
              {layer.layerConfig?.name}&nbsp;
              <button
                type="button"
                onClick={() => {
                  props.setEdit(layer, null);
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
              {layer.layerConfig?.sublayers.map((sublayer, index) => {
                return (
                  <ul key={sublayer.name + index}>
                    <li>
                      {sublayer.name}
                      <button
                        type="button"
                        onClick={() => {
                          props.setEdit(layer, index);
                        }}
                      >
                        Edit Sublayer
                      </button>
                      &nbsp;
                      <button
                        className={adminStyles.deleteButton}
                        type="button"
                        onClick={() => {
                          delSubLayer(layer, index);
                        }}
                      >
                        Delete Layer
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
