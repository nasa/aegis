import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faFlask,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";

import Info_Panel from "./eva-right-eva-info";
import STM_Panel from "../stm-coverage";
import {
  deleteAllEvasFromDb,
  deleteEva,
  setEvaEditMode,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
  upsertEva,
  upsertEvasFromDb,
} from "store/eva";
import {
  deleteTraverse,
  deleteTraverseFromDb,
  upsertTraverse,
  replaceAllTraversesFromDb,
  setTraverseEditMode,
} from "store/traverse";
import * as httpClient_Eva from "http-client/eva";
import * as httpClient_Traverse from "http-client/traverse";

const EvaRightEva: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    shallowEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);
  const evasEditing = useAppSelector((state) => state.eva.evasEditing, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const selectedEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);

  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  // all actions from all stations in this eva
  const evaActions = useAppSelector((state) => {
    const stationUuidsInThisEva = [];
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        stationUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    return state.action.actions.filter((action) => {
      return stationUuidsInThisEva.includes(action.stationUuid);
    });
  }, shallowEqual);

  //track modified
  const [modified, setModified] = useState(false);
  useEffect(() => {
    const evaEqual = _.isEqual(selectedEva, selectedEvaFromDb);

    const traverseUuidsInThisEva = [];
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const thisEvasTraverses = traverses.filter((traverse) => {
      return traverseUuidsInThisEva.includes(traverse.uuid);
    });
    const thisEvasTraversesFromDb = traversesFromDb.filter((traverse) => {
      return traverseUuidsInThisEva.includes(traverse.uuid);
    });
    const traversesEqual = _.isEqual(
      _.sortBy(thisEvasTraverses, ["uuid"]),
      _.sortBy(thisEvasTraversesFromDb, ["uuid"])
    );
    setModified(!evaEqual || !traversesEqual);
  }, [selectedEva, selectedEvaFromDb, traverses, traversesFromDb]);

  const handleSave = async () => {
    if (selectedEva && modified) {
      // upsert the changed Station to the DB via internal API call
      const evaUpsertResponse = await httpClient_Eva.upsertEva(selectedEva);

      if (evaUpsertResponse.status === "success") {
        // upsert the changed Station (with new updated date) to the store
        dispatch(upsertEva(evaUpsertResponse.data));
        // update the Station in the store with a fresh copy from the DB
        const evaData = await httpClient_Eva.getEvas(selectedMissionId);
        if (evaData.data) {
          dispatch(deleteAllEvasFromDb());
          dispatch(upsertEvasFromDb(evaData.data));
        }
      } else {
        throw new Error("Error upserting Station: " + evaUpsertResponse.message);
      }

      // find out if the traverses in this eva have been modified and need to be persisted
      const traverseUuidsInThisEva: string[] = [];
      selectedEva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.type === "traverse") {
          traverseUuidsInThisEva.push(sequenceItem.uuid);
        }
      });
      const thisEvasTraverses = traverses.filter((traverse) => {
        return traverseUuidsInThisEva.includes(traverse.uuid);
      });
      const thisEvasTraversesFromDb = traversesFromDb.filter((traverse) => {
        return traverseUuidsInThisEva.includes(traverse.uuid);
      });
      const traversesEqual = _.isEqual(
        _.sortBy(thisEvasTraverses, ["uuid"]),
        _.sortBy(thisEvasTraversesFromDb, ["uuid"])
      );
      if (!traversesEqual) {
        // upsert the traverses to the DB via internal API call
        for (const traverse of thisEvasTraverses) {
          const traverseUpsertResponse = await httpClient_Traverse.upsertTraverse(traverse);
          if (traverseUpsertResponse.status === "success") {
            // upsert the changed Traverse (with new updated date) to the store
            dispatch(upsertTraverse(traverseUpsertResponse.data));
          }
        }
      }

      // prune traverses from the db that are no longer in any EVA
      const traverseUuidsInAnyEva = [];
      evas.forEach((eva) => {
        eva.sequence.forEach((sequenceItem) => {
          if (sequenceItem.type === "traverse") {
            traverseUuidsInAnyEva.push(sequenceItem.uuid);
          }
        });
      });
      const traversesToDelete = traversesFromDb.filter((traverse) => {
        return !traverseUuidsInAnyEva.includes(traverse.uuid);
      });
      for (const traverse of traversesToDelete) {
        const deleteResponse: WrappedResponse<number> = await httpClient_Traverse.deleteTraverse(
          traverse.uuid
        );
        if (deleteResponse.status === "success") {
          // remove the corresponding traverse from the store
          // TODO: investigate why this is needed.
          // The httpClient_Traverse.getTraverses(selectedMissionId) call below includes this deleted item
          // it's as though Mikro is not committing the delete in time to return the correct response for getTraverses.
          dispatch(deleteTraverseFromDb({ uuid: traverse.uuid }));
        }
      }

      // reset the traversesFromDB in the store with a fresh copy from the DB
      const traverseData = await httpClient_Traverse.getTraverses(selectedMissionId);
      if (traverseData.data) {
        dispatch(replaceAllTraversesFromDb(traverseData.data));
      }

      dispatch(setEvaEditMode({ evaUuid: selectedEva.uuid, editMode: false }));
    }
  };

  const handleDelete = async () => {
    if (selectedEva) {
      // delete all of the traverses used in this EVA sequence if they are in traversesFromDb
      const traverseUuidsInThisEva = [];
      selectedEva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.type === "traverse") {
          traverseUuidsInThisEva.push(sequenceItem.uuid);
        }
      });
      const thisEvasTraversesFromDb = traversesFromDb.filter((traverse) => {
        return traverseUuidsInThisEva.includes(traverse.uuid);
      });
      for (const traverse of thisEvasTraversesFromDb) {
        const deleteResponse: WrappedResponse<number> = await httpClient_Traverse.deleteTraverse(
          traverse.uuid
        );
        if (deleteResponse.status === "success") {
          // remove the corresponding traverse from the traversesFromDb store
          dispatch(deleteTraverseFromDb({ uuid: traverse.uuid }));
        }
      }
      // get fresh copy of Traverses from DB
      const traverseData = await httpClient_Traverse.getTraverses(selectedMissionId);
      if (traverseData.data) {
        dispatch(replaceAllTraversesFromDb(traverseData.data));
      }

      // delete all of the traverses used in this EVA sequence from the traverses store
      const thisEvasTraverses = traverses.filter((traverse) => {
        return traverseUuidsInThisEva.includes(traverse.uuid);
      });
      thisEvasTraverses.forEach((traverse) => {
        dispatch(deleteTraverse({ uuid: traverse.uuid }));
      });

      // delete the eva from the DB or the store
      // if the selected eva is in evasFromDb then delete it from the db
      if (selectedEvaFromDb) {
        // delete the Eva from the DB via internal API call
        const deleteResponse: WrappedResponse<number> = await httpClient_Eva.deleteEva(
          selectedEva.uuid
        );
        if (deleteResponse.status === "success") {
          // remove the corresponding eva from the store
          dispatch(deleteEva(selectedEva));
          dispatch(setSelectedEvaUuid(null));

          // get fresh copy of Evas from DB
          const evaData = await httpClient_Eva.getEvas(selectedMissionId);
          if (evaData.data) {
            dispatch(deleteAllEvasFromDb());
            dispatch(upsertEvasFromDb(evaData.data));
          }
        } else {
          console.error("Error deleting Eva: " + deleteResponse.message);
        }
      } else {
        // if the selected eva is not in evasFromDb then delete it from the store
        dispatch(deleteEva(selectedEva));
        dispatch(setSelectedEvaUuid(null));
      }

      dispatch(setEvaEditMode({ evaUuid: selectedEva.uuid, editMode: false }));
    }
  };

  const handleCancel = () => {
    if (selectedEvaFromDb) {
      // delete the traverses that were added to the store are not in the copy from the db
      const traverseUuidsInThisEva = [];
      selectedEva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.type === "traverse") {
          traverseUuidsInThisEva.push(sequenceItem.uuid);
        }
      });
      const traverseUuidsInThisEvaInDb = [];
      selectedEvaFromDb.sequence.forEach((sequenceItem) => {
        if (sequenceItem.type === "traverse") {
          traverseUuidsInThisEvaInDb.push(sequenceItem.uuid);
        }
      });
      const traverseUuidsInThisEvaNotInThisEvaFromDb = traverseUuidsInThisEva.filter(
        (traverseUuid) => {
          return !traverseUuidsInThisEvaInDb.includes(traverseUuid);
        }
      );
      // delete the traverses that were added during this edit to this EVA
      traverseUuidsInThisEvaNotInThisEvaFromDb.forEach((traverseUuid) => {
        dispatch(deleteTraverse({ uuid: traverseUuid }));
      });

      // revert the traverses used in this eva using copies from traversesFromDb and also disable edit mode of each
      const traversesInThisEva = traverses.filter((traverse) => {
        return traverseUuidsInThisEva.includes(traverse.uuid);
      });
      traversesInThisEva.forEach((traverse) => {
        const traverseFromDb = traversesFromDb.find(
          (traverseFromDb) => traverseFromDb.uuid === traverse.uuid
        );
        if (traverseFromDb) {
          dispatch(upsertTraverse(traverseFromDb));
          dispatch(setTraverseEditMode({ uuid: traverse.uuid, editMode: false }));
        }
      });

      // copy back alltraverses for this eva defined in selecteedEvaFromDb
      const traversesInThisEvaFromDb = traversesFromDb.filter((traverse) => {
        return traverseUuidsInThisEvaInDb.includes(traverse.uuid);
      });
      traversesInThisEvaFromDb.forEach((traverse) => {
        dispatch(upsertTraverse(traverse));
      });

      // eva is already saved once to the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertEva(selectedEvaFromDb));
    } else {
      // eva hasn't been saved to the db. delete the eva and actions from the store
      dispatch(deleteEva(selectedEva));
      dispatch(setSelectedEvaUuid(null));
    }
    dispatch(setEvaEditMode({ evaUuid: selectedEva.uuid, editMode: false }));
  };

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "EVA Information",
      panel: <Info_Panel editMode={evasEditing.includes(selectedEvaUuid)} />,
      color: "var(--eva)",
      icon: faCircleInfo,
    },

    stm_panel: {
      title: "EVA STM Coverage",
      panel: (
        <STM_Panel
          actions={evaActions}
          mini={false}
          horizontal={false}
          uniqueKey={selectedEvaUuid}
        />
      ),
      color: "var(--eva)",
      icon: faFlask,
    },
  };

  let activeComponent: FunctionComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedEva && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--eva)" }}>
            <InLineEditInput
              fieldName="Station"
              value={selectedEva.name}
              editing={evasEditing.includes(selectedEvaUuid)}
              maxLength={255}
              styleInput={{
                width: "100%",
                marginRight: "10px",
                color: "var(--eva)",
                fontSize: "1em",
              }}
              styleValue={{ padding: 0, height: "auto" }}
              containerStyle={{ paddingLeft: 0 }}
              onChange={(val) => {
                dispatch(upsertEva({ ...selectedEva, name: val }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {panelTypes &&
              Object.keys(panelTypes).map((panelType) => {
                return (
                  <div
                    key={panelType}
                    className={
                      selectedRightNavItem === panelType
                        ? paneStyles.rightIconContainerSelected
                        : paneStyles.rightIconContainer
                    }
                  >
                    <div
                      className={paneStyles.rightIcon}
                      style={{
                        color:
                          selectedRightNavItem === panelType
                            ? panelTypes[panelType].color
                            : "white",
                      }}
                      title={panelTypes[panelType].title}
                      onClick={() => dispatch(setSelectedEvaRightNavItem(panelType))}
                    >
                      <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {evasEditing.includes(selectedEvaUuid) && (
              <IconButton
                icon={faTrashAlt}
                onClick={() => {
                  handleDelete();
                }}
                toolTip="Delete EVA"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            )}
            {!evasEditing.includes(selectedEvaUuid) && isAdmin && (
              <IconButton
                icon={faEdit}
                onClick={() => {
                  dispatch(setEvaEditMode({ evaUuid: selectedEva.uuid, editMode: true }));
                }}
                label="Edit"
                toolTip="Edit EVA"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {evasEditing.includes(selectedEvaUuid) && (
              <>
                <IconButton
                  onClick={() => {
                    handleSave();
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save EVA${modified ? "" : " (nothing to save)"}`}
                  enabled={modified}
                  style={{
                    width: "30px",
                    backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                    color: modified ? "white" : "var(--grey4)",
                    fontSize: "0.9em",
                    paddingLeft: "10px",
                  }}
                />
                <IconButton
                  onClick={() => {
                    handleCancel();
                  }}
                  icon={faBan}
                  toolTip="Cancel Edit"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                />
              </>
            )}
          </div>
        </div>
        {activeComponent}
      </>
    )
  );
};

export default EvaRightEva;
