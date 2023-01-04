import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";
import adminStyles from "components/admin/admin.module.css";
import LayerEdit from "components/admin/layerEdit";
import SublayerEdit from "components/admin/sublayerEdit";
import { deleteLayer, getLayers, upsertLayer } from "http-client/layer";
import { createNewLayer, createNewSublayer } from "components/admin/helper";
import { getMissions } from "http-client/mission";
import _ from "lodash";

const Layers: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [missionName, setMissionName] = useState<string>("");
  const [message, setMessage] = useState("");

  const [allLayers, setAllLayers] = useState<Layer[]>(null);
  const [editLayer, setEditLayer] = useState<Layer>(null);

  const [editSublayerIndex, setEditSublayerIndex] = useState<number>(null);
  const [editSublayerParentUUID, setEditSublayerParentUUID] = useState("0");

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
      const response = await isLoggedIn(); //check user is logged in
      if (response.status !== "success") {
        router.push("/"); //user is not logged in. Redirect to homepage
      }

      //set mission id state
      const { id } = router.query;
      if (id) {
        setMissionIdSlug(+id);
        setMessage("Loading mission ID " + id);

        //set mission name
        const mission = (await getMissions(+id)).data;
        if (mission[0]) {
          setMissionName(mission[0].name);
        }
      } else {
        setMessage("No mission ID");
      }
    })();
  }, [router]);

  //realod db when mission id changes
  useEffect(() => {
    if (missionIdSlug) {
      loadLayersfromDB(missionIdSlug);
    }
  }, [missionIdSlug]);

  //set the current layer and sublayer being edited
  function setEdit(layer: Layer, sublayerIndex: number) {
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
      setEdit(selectedParentLayer, selectedParentLayer.layerConfig.sublayers.length - 1);
    } else {
      setMessage("Error adding new sublayer");
    }
  }

  //save the current editing layer to db
  async function saveLayer() {
    if (editLayer) {
      const res: WrappedResponse<Layer> = await upsertLayer(editLayer);
      loadLayersfromDB(missionIdSlug);
      alert(`${res.status} - ${res.message}`);
    }
  }

  return (
    <div>
      Status: {message}
      <h2>Mission: {missionName}</h2>
      <div id="layerList_div">
        <h3>Layers and Sublayers</h3>
        <LayerList
          layers={allLayers}
          missionId={missionIdSlug}
          refreshLayerList={loadLayersfromDB}
          setEdit={setEdit}
        />
      </div>
      <div id="addLayer_div">
        <h3>Add Layer / Sublayer</h3>
        <button
          type="button"
          onClick={() => {
            setEdit(createNewLayer(missionIdSlug), null);
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
      <div id="editLayer_div">
        <h3>Edit</h3>
        {editLayer ? (
          <button
            type="button"
            onClick={() => {
              saveLayer();
            }}
          >
            Save Layer/Sublayer
          </button>
        ) : (
          <div>Please Select a Layer to Edit</div>
        )}
        <br />
        <br />
        {editLayer && editSublayerIndex === null && (
          <>
            <h3>Header Layer</h3>
            <LayerEdit layer={editLayer} setLayer={setEditLayer} />
          </>
        )}
        {editSublayerIndex !== null && editLayer && (
          <>
            <h3>Sublayer</h3>
            <SublayerEdit
              sublayerIndex={editSublayerIndex}
              sublayer={editLayer.layerConfig.sublayers[editSublayerIndex]}
              setLayer={setEditLayer}
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
        "Are you usre you want to delete sublayer " +
          layer.layerConfig.sublayers[sublayerIndex].name
      )
    ) {
      layer.layerConfig.sublayers.splice(sublayerIndex, 1);
      const res: WrappedResponse<Layer> = await upsertLayer(layer);
      alert(`Delete ${res.status} - ${res.message}`);
      props.refreshLayerList(props.missionId); //reload layer listing in parent component.
    }
  }

  async function delLayer(uuid: string, name: string) {
    if (confirm("Are you sure you want to delete layer " + name)) {
      const res: WrappedResponse<null> = await deleteLayer(uuid);
      alert(`Delete ${res.status} - ${res.message} for uuid ${uuid}`);
      props.refreshLayerList(props.missionId); //reload layer listing in parent component.
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
                  delLayer(layer.uuid, layer.layerConfig.name);
                }}
              >
                Delete Layer
              </button>
              {layer.layerConfig?.sublayers.map((sublayer, index) => {
                return (
                  <ul key={sublayer.name + index}>
                    <li>
                      {sublayer.name}{" "}
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
