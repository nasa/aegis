import { NextPage } from "next";
import { Dispatch, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import LayerEdit from "components/admin/layerEdit";
import SublayerEdit from "components/admin/sublayerEdit";
import { deleteLayer, getLayers } from "http-client/layer";
import { createNewLayer, createNewSublayer } from "components/admin/helper";
import { getMissions } from "http-client/mission";
import _ from "lodash";
import FileManager from "components/admin/fileManager";
import { deleteSublayer, getSublayers } from "http-client/sublayer";

const Layers: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [missionName, setMissionName] = useState<string>("");

  const [allLayers, setAllLayers] = useState<Layer[]>(null);
  const [allSublayers, setAllSublayers] = useState<Sublayer[]>(null);
  const [editSublayerParentUUID, setEditSublayerParentUUID] = useState("0");
  const [editComponent, setEditComponent] = useState<JSX.Element>(null);
  const [fileList, setFileList] = useState<GISfile[]>(null);

  const reloadLayers = useCallback(() => {
    (async () => {
      //load layers
      const resLayers = await getLayers(missionIdSlug);
      if (resLayers.data) {
        setAllLayers(resLayers.data);
        if (resLayers.data.length > 0) setEditSublayerParentUUID(resLayers.data[0].uuid);
      }

      //load sublayers
      const resSublayer = await getSublayers(missionIdSlug);
      if (resSublayer.data) {
        setAllSublayers(resSublayer.data);
      }
    })();
  }, [missionIdSlug]);

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
    if (!missionIdSlug) return;
    reloadLayers();
  }, [missionIdSlug, reloadLayers]);

  //adds a new blank sublayer object to the parent layer and sets it for edit
  function addNewSublayer() {
    const newSublayer = createNewSublayer(editSublayerParentUUID, missionIdSlug);
    setEditComponent(
      <SublayerEdit sublayer={newSublayer} refreshLayerList={reloadLayers} fileList={fileList} />
    );
  }

  function addNewLayer() {
    const newLayer = createNewLayer(missionIdSlug);
    setEditComponent(<LayerEdit layer={newLayer} refreshLayerList={reloadLayers} />);
  }

  const checkLayerUsesFolder = useCallback(
    (folderName: string) => {
      for (const sublayer of allSublayers) {
        if (sublayer.url?.startsWith(folderName + "/")) {
          return true;
        }
      }
    },
    [allSublayers]
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
        <LayerList
          layers={allLayers}
          sublayers={allSublayers}
          missionId={missionIdSlug}
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
        <>{editComponent}</>
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
  async function delSubLayer(sublayer: Sublayer) {
    if (confirm("Are you sure you want to delete sublayer " + sublayer.name)) {
      const res: WrappedResponse<null> = await deleteSublayer(sublayer.uuid, props.missionId);
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
        const res: WrappedResponse<null> = await deleteLayer(layer.uuid, props.missionId);
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
          refreshLayerList={props.refreshLayerList}
          fileList={props.fileList}
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
              {props.sublayers?.map((sublayer) => {
                if (sublayer.layerUuid !== layer.uuid) return;
                return (
                  <ul key={sublayer.uuid}>
                    <li>
                      {sublayer.name}
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
                        Delete SubLayer
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
