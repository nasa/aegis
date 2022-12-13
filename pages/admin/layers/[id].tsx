import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";
import styles from "components/admin/admin.module.css";
import { deleteLayer, getLayers } from "http-client/layer";

const STM: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [message, setMessage] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<Layer>(createNewLayer());
  const [selectedSublayer, setSelectedSublayer] = useState<MMGIS_Sublayer>(createNewSublayer());

  //responses from the DB
  const [allLayers, setAllLayers] = useState<Layer[]>([createNewLayer()]);

  async function loadLayersfromDB(missionId: number) {
    if (missionId) {
      //load layers
      const layers = await getLayers(missionId);
      if (layers.data) {
        setAllLayers(layers.data);
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
      } else {
        setMessage("No mission ID");
      }
    })();
  }, [router]);

  //realod db when mission id changes
  useEffect(() => {
    loadLayersfromDB(missionIdSlug);
  }, [missionIdSlug]);

  //set the current layer and sublayer being edited
  function setEditLayer(layer: Layer, sublayer: MMGIS_Sublayer) {
    setSelectedSublayer(sublayer);
    setSelectedLayer(layer);
  }

  useEffect(() => {
    //WIP just to use state
    if (selectedLayer) {
      setMessage(`selected ${selectedLayer.layerConfig.name}`);
    }
  }, [selectedLayer]);
  useEffect(() => {
    //WIP just to use state
    if (selectedSublayer) {
      setMessage(`selected sublayer ${selectedSublayer.name}`);
    }
  }, [selectedSublayer]);

  return (
    <div>
      Status: {message}
      <h3>Layers and Sublayers</h3>
      <LayerList
        layers={allLayers}
        missionId={missionIdSlug}
        refreshLayerList={loadLayersfromDB}
        setEditLayer={setEditLayer}
      />
      <h3>Add/Edit Layer</h3>
      {/* <LayerEdit sublayer={selectedSublayer} /> */}
    </div>
  );
};

/** Component to list out all the layers and sublayers in bulleted form */
const LayerList = (props: {
  layers: Layer[];
  missionId: number;
  refreshLayerList: (missionId: number) => {};
  setEditLayer: (layer: Layer, sublayer: MMGIS_Sublayer) => void;
}) => {
  async function delLayer(uuid: string, name: string) {
    if (confirm("Are you usre you want to delete layer " + name)) {
      const res: WrappedResponse<any> = await deleteLayer(uuid);
      alert(`Delete ${res.status} - ${res.message}`);
      props.refreshLayerList(props.missionId); //reload layer listing in parent component.
    }
  }

  if (props.layers.length > 0) {
    return (
      <ul>
        {props.layers.map((layer) => {
          return (
            <li key={layer.uuid}>
              {layer.layerConfig?.name}&nbsp;
              <button
                type="button"
                onClick={() => {
                  props.setEditLayer(layer, null);
                }}
              >
                Edit Header Layer
              </button>
              &nbsp;
              <button
                className={styles.deleteButton}
                type="button"
                onClick={() => {
                  delLayer(layer.uuid, layer.layerConfig.name);
                }}
              >
                Delete Layer
              </button>
              {layer.layerConfig?.sublayers.map((sublayer) => {
                return (
                  <ul key={sublayer.name}>
                    <li>
                      {sublayer.name}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          props.setEditLayer(layer, sublayer);
                        }}
                      >
                        Edit Sublayer
                      </button>
                      &nbsp;
                      <button
                        className={styles.deleteButton}
                        type="button"
                        onClick={() => {
                          delLayer(layer.uuid, layer.layerConfig.name);
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

function createNewSublayer(): MMGIS_Sublayer {
  const sublayer = {
    name: "",
    type: "",
  };
  return sublayer;
}

function createNewLayer(): Layer {
  const layerConfig: MMGIS_LayerConfig = {
    name: "",
    type: "header",
    sublayers: [createNewSublayer()],
  };
  const layer = {
    mission: null,
    layerConfig: layerConfig,
  };
  return layer;
}

export default STM;
