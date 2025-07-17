import {
  selectEva,
  setEvaEditMode,
  setEvaSequence,
  upsertExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
  upsertEvaByField,
  deleteExpandedEvaUuids,
  setOnlyShowRunningRex,
  setEvaDropdownUIState,
  setSelectedEvaSequenceItemUuid,
  upsertEvas,
  upsertEvasFromDb,
  deleteEvasByUuid,
  deleteEvasFromDbByUuid,
} from "store/eva";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import {
  setTraversesEditMode,
  upsertTraverses,
  deleteTraversesFromDbByUuid,
  deleteTraversesByUuid,
  upsertTraversesFromDb,
} from "store/traverse";
import * as httpClient_Eva from "http-client/eva";
import * as httpClient_Traverse from "http-client/traverse";
import cloneDeep from "lodash/cloneDeep";
import {
  thunkDeleteTraverses,
  thunkDuplicateTraverse,
  thunkFullUpdateTraverse,
  thunkSaveTraverse,
  thunkUpdateTraversesAroundStation,
} from "./thunkTraverse";
import { getAccurateNow } from "utils/formatting";
import { thunkDeleteStations, thunkDuplicateStation, thunkSaveStation } from "./thunkStation";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { thunkDeleteRex } from "./thunkRex";
import { setSelectedPosEntryUuid, setSelectedRexUuid } from "store/rex";
import { setRightPanelIsOpen } from "store/interface";
import concat from "lodash/concat";

/** Get an Station or Traverse object from a UUID
 * This would typically be used when needing to get the full object from an EVA sequence
 */
export const thunkGetStationOrTraverse = appCreateAsyncThunk<
  { uuid: string },
  { type: "station" | "traverse"; item: Station | Traverse },
  false
>("getStationOrTraverse", async ({ uuid }, { getState }) => {
  const station = getState().station.stations.find((s) => s.uuid === uuid);
  if (station) return { type: "station", item: station };
  const traverse = getState().traverse.traverses.find((t) => t.uuid === uuid);
  if (traverse) return { type: "traverse", item: traverse };
  return null;
});

/**
 * Save an EVA to the DB. It will also save any station or traverses in edit mode
 */
export const thunkSaveEva = appCreateAsyncThunk<{
  evaUuid: string;
}>("evaSave", async ({ evaUuid }, { dispatch, getState }) => {
  if (!evaUuid) return;
  const eva = cloneDeep(getState().eva.evas.find((e) => e.uuid === evaUuid));

  // prune traverses from the db that are no longer in any EVA
  // this can happen as users are adding/removing stations, and subsequently traverses, from the EVA sequence
  const traverseUuidsInAnyEva: string[] = [];
  getState().eva.evas.forEach((eva) => {
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInAnyEva.push(sequenceItem.uuid);
      }
    });
  });
  const traversesToDelete = getState().traverse.traversesFromDb.filter((traverse) => {
    return !traverseUuidsInAnyEva.includes(traverse.uuid);
  });
  if (traversesToDelete.length > 0) {
    const traverseToDeleteUuids = traversesToDelete.map((t) => t.uuid);
    const deleteTraverseRes = await httpClient_Traverse.deleteTraverses(traverseToDeleteUuids);
    if (deleteTraverseRes.status !== "success") {
      throw new Error("Error deleting traverses in evaSave: " + deleteTraverseRes.message);
    }
    dispatch(deleteTraversesFromDbByUuid(traverseToDeleteUuids));
    dispatch(deleteTraversesByUuid(traverseToDeleteUuids));
  }

  // if this is rex eva, duplicate any stations in sequences we newly changed to, or any new ingress/egress stations
  // and delete the old sequence stations and old ingress/egress stations
  const isRexEva = getState().rex.rexes.some((r) => r.evaUuid === eva.uuid);
  if (isRexEva) {
    // check any sequences changes
    const oldEva = getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid);
    const oldSequence = oldEva.sequence;
    const newSequence = eva.sequence;
    for (let i = 0; i < Math.max(newSequence?.length, oldSequence?.length); i++) {
      if (oldSequence[i]?.type === "station" || newSequence[i]?.type === "station") {
        // check if the station has changed. Either of these could be null/undefined if the sequence is shorter
        if (oldSequence[i]?.uuid !== newSequence[i]?.uuid) {
          if (newSequence[i]) {
            // duplicate the station and save to db
            const newStation = await dispatch(
              thunkDuplicateStation({
                stationUuid: newSequence[i].uuid,
                preserveRefUuid: true,
              })
            );
            if (newStation.payload) {
              // update the sequence with the new station uuid
              newSequence[i].uuid = newStation.payload.uuid;
            } else {
              throw new Error("Error duplicating station in thunkSaveEva");
            }
          }
          if (oldSequence[i]) {
            // delete the old station
            const deleteRes = await dispatch(
              thunkDeleteStations({ stationUuids: [oldSequence[i].uuid], skipValidation: true })
            );
            if (deleteRes.meta.requestStatus === "rejected") {
              throw new Error("Error deleting station in thunkSaveEva");
            }
          }
        }
      }
    }

    // check ingress
    if (eva.ingressLocationUuid !== oldEva.ingressLocationUuid) {
      if (eva.ingressLocationUuid !== "lander") {
        // duplicate ingress station and save to db
        const newIngressStation = await dispatch(
          thunkDuplicateStation({
            stationUuid: eva.ingressLocationUuid,
            preserveRefUuid: true,
          })
        );
        if (newIngressStation.payload) {
          eva.ingressLocationUuid = newIngressStation.payload.uuid;
        } else {
          throw new Error("Error duplicating ingress station in thunkSaveEva");
        }
      }
      if (oldEva.ingressLocationUuid !== "lander") {
        // delete the old ingress station
        const deleteRes = await dispatch(
          thunkDeleteStations({ stationUuids: [oldEva.ingressLocationUuid] })
        );
        if (deleteRes.meta.requestStatus === "rejected") {
          throw new Error("Error deleting ingress station in thunkSaveEva");
        }
      }
    }
    // check egress
    if (eva.egressLocationUuid !== oldEva.egressLocationUuid) {
      if (eva.egressLocationUuid !== "lander") {
        // duplicate egress station and save to db
        const newEgressStation = await dispatch(
          thunkDuplicateStation({
            stationUuid: eva.egressLocationUuid,
            preserveRefUuid: true,
          })
        );
        if (newEgressStation.payload) {
          eva.egressLocationUuid = newEgressStation.payload.uuid;
        } else {
          throw new Error("Error duplicating egress station in thunkSaveEva");
        }
      }
      if (oldEva.egressLocationUuid !== "lander") {
        // delete the old egress station
        const deleteRes = await dispatch(
          thunkDeleteStations({ stationUuids: [oldEva.egressLocationUuid] })
        );
        if (deleteRes.meta.requestStatus === "rejected") {
          throw new Error("Error deleting egress station in thunkSaveEva");
        }
      }
    }
  }

  // save any traverse or station in draft
  for (const sequenceItem of eva.sequence) {
    if (sequenceItem.type === "traverse") {
      if (getState().traverse.traversesEditing.includes(sequenceItem.uuid)) {
        await dispatch(thunkSaveTraverse({ traverseUuid: sequenceItem.uuid }));
      }
    } else if (sequenceItem.type === "station") {
      if (getState().station.stationsEditing.includes(sequenceItem.uuid)) {
        await dispatch(thunkSaveStation({ stationUuid: sequenceItem.uuid }));
      }
    }
  }

  // upsert the changed Eva to the DB via internal API call
  const evaUpsertResponse = await httpClient_Eva.upsertEvas([
    {
      ...eva,
      updatedAt: getAccurateNow().toISOString(),
    },
  ]);
  if (evaUpsertResponse.status !== "success") {
    throw new Error("Error upserting Eva: " + evaUpsertResponse.message);
  }
  // upsert the changed eva (with new updated date) to the store
  dispatch(upsertEvas([eva], true));
  dispatch(upsertEvasFromDb([eva]));
  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

/**
 * Cancel an EVA edit. It will also cancel any traverses in edit
 */
export const thunkCancelEva = appCreateAsyncThunk<{
  evaUuid: string;
}>("evaCancel", async ({ evaUuid }, { dispatch, getState }) => {
  const eva = getState().eva.evas.find((evaFromDb) => evaFromDb.uuid === evaUuid);
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === evaUuid);

  if (evaFromDb) {
    // delete the traverses that were added to the store but are not in the fromDb copy
    // meaning they were adding during this edit to the EVA
    const traverseUuids: string[] = eva.sequence
      .filter((s) => s.type === "traverse")
      ?.map((t) => t.uuid);
    const traverseUuidsInDb: string[] = evaFromDb.sequence
      .filter((s) => s.type === "traverse")
      ?.map((t) => t.uuid);
    const traverseUuidsNotFromDb = traverseUuids.filter((traverseUuid) => {
      return !traverseUuidsInDb.includes(traverseUuid);
    });
    dispatch(deleteTraversesByUuid(traverseUuidsNotFromDb));

    // copy back all traverses for this eva defined in fromDb
    const traversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
      return traverseUuidsInDb.includes(traverse.uuid);
    });
    dispatch(upsertTraverses(traversesFromDb, true));

    // cancel out all edit modes
    dispatch(
      setTraversesEditMode({
        uuids: concat(
          traverseUuidsNotFromDb,
          traversesFromDb.map((t) => t.uuid)
        ),
        editMode: false,
      })
    );
    // eva is already saved once to the db, replace all values with the one from the db (undoing any changes)
    dispatch(upsertEvas([evaFromDb], true));
  } else {
    // delete any traverses
    const traverseUuids = eva.sequence.filter((s) => s.type === "traverse")?.map((t) => t.uuid);
    if (traverseUuids) {
      dispatch(deleteTraversesByUuid(traverseUuids));

      // also delete them from the DB. traverses are auto saved to the DB when they are created
      const deleteResponse: WrappedResponse<null> =
        await httpClient_Traverse.deleteTraverses(traverseUuids);
      if (deleteResponse.status !== "success") {
        throw new Error("Error deleting traverses in evaCancel: " + deleteResponse.message);
      }
      // remove the corresponding traverse from the traversesFromDb store
      dispatch(deleteTraversesFromDbByUuid(traverseUuids));
      dispatch(setTraversesEditMode({ uuids: traverseUuids, editMode: false }));
    }

    // eva has never been saved to the db, so just delete the eva from the store
    dispatch(deleteEvasByUuid([eva.uuid]));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    dispatch(
      thunkAddRemoveFolderItem({
        itemUuid: eva.uuid,
        folderUuid: null,
      })
    );
  }
  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

export const thunkDeleteEva = appCreateAsyncThunk<{
  evaUuid: string;
  forRex: boolean; // should only used when deleting an eva that belongs to a rex
}>("evaDelete", async ({ evaUuid, forRex }, { dispatch, getState }) => {
  if (!evaUuid) return;
  const eva = getState().eva.evas.find((e) => e.uuid === evaUuid);

  // first deselect the EVa. This prevents race errors when the timeline
  // tries to render prematurely before we're done deleting all the parts
  if (getState().eva.selectedEvaUuid === evaUuid) dispatch(setSelectedEvaUuid(null));

  // Handle if deleting an "as planned" EVA (aka no REX attached)
  const allRexEvaUuids = getState().rex.rexes.map((r) => r.evaUuid);
  if (!allRexEvaUuids.includes(eva.uuid)) {
    // This eva does not belong to any REX, so this is a planned EVA.
    // Delete the rexes and their evas first
    const evaUuidsWithMatchingRefUuid = getState()
      .eva.evas.filter((e) => e.refUuid === eva.refUuid)
      .map((e) => e.uuid);

    const rexesToDelete = getState().rex.rexes.filter((r) =>
      evaUuidsWithMatchingRefUuid.includes(r.evaUuid)
    );
    for (const rex of rexesToDelete) {
      await dispatch(thunkDeleteRex({ rexUuid: rex.uuid }));
    }
  }

  // delete all of the traverses and traverse actions in this EVA sequence
  const traverseUuidsInThisEva: string[] = [];
  eva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  await dispatch(thunkDeleteTraverses({ traverseUuids: traverseUuidsInThisEva }));

  if (forRex) {
    // delete all stations and station actions in this EVA (used when deleting rex EVAs)
    const stationUuidsInThisEva: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        stationUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    await dispatch(
      thunkDeleteStations({ stationUuids: stationUuidsInThisEva, skipValidation: true })
    );

    // delete ingress/egress stations if they are not lander
    if (eva.ingressLocationUuid !== "lander") {
      const ingressStation = getState().station.stations.find(
        (s) => s.uuid === eva.ingressLocationUuid
      );
      if (ingressStation) {
        await dispatch(
          thunkDeleteStations({ stationUuids: [ingressStation.uuid], skipValidation: true })
        );
      }
    }
    if (eva.egressLocationUuid !== "lander") {
      const egressStation = getState().station.stations.find(
        (s) => s.uuid === eva.egressLocationUuid
      );
      if (egressStation) {
        await dispatch(
          thunkDeleteStations({ stationUuids: [egressStation.uuid], skipValidation: true })
        );
      }
    }
  }

  // delete the eva from the DB or the store
  // if the selected eva is in evasFromDb then delete it from the db
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === eva.uuid);
  if (evaFromDb) {
    // delete the Eva from the DB via internal API call
    const deleteResponse: WrappedResponse<null> = await httpClient_Eva.deleteEvas([eva.uuid]);
    if (deleteResponse.status !== "success") {
      throw new Error("Error deleting Eva: " + deleteResponse.message);
    }
    // remove the corresponding eva from the store
    dispatch(deleteEvasFromDbByUuid([eva.uuid]));
  }
  dispatch(deleteEvasByUuid([eva.uuid]));

  dispatch(
    thunkAddRemoveFolderItem({
      itemUuid: eva.uuid,
      folderUuid: null,
    })
  );
  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
  dispatch(deleteExpandedEvaUuids([eva.uuid]));
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
});

export const thunkCreateEva = appCreateAsyncThunk<void>(
  "evaCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().eva.evas.map((item) => item.name),
    });

    const blankEva: Eva = generateBlankEVA({
      missionId: getState().mission.mission?.id,
      name: randomName,
      traverseRate: getState().mission.mission.traverseRate,
      duration: getState().mission.mission.defaultEvaDuration,
    });

    // create an empty traverse
    const newTraverse: Traverse = generateBlankTraverse({ missionId: blankEva.missionId });
    dispatch(upsertTraverses([newTraverse]));

    // add the traverse to the sequence
    blankEva.sequence.push({
      type: "traverse",
      uuid: newTraverse.uuid,
    });

    // upsert the new eva
    dispatch(upsertEvas([blankEva]));
    dispatch(selectEva({ uuid: blankEva.uuid }));
    dispatch(setEvaEditMode({ evaUuid: blankEva.uuid, editMode: true }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));

    /**
     * Full update the traverse to generate a path. Also save to the db but keep it in edit mode
     * We save it to the db because when you create then save an EVA it does not save the station/traverses
     *   which means if the user cancels on the traverse, it would cancel into nothingness if it's not in the db
     */
    await dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: newTraverse.uuid,
        rename: true,
        evaSequence: blankEva.sequence,
        saveToDb: true,
      })
    );
    dispatch(setTraversesEditMode({ uuids: [newTraverse.uuid], editMode: true }));

    dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
  }
);

/**
 * Duplicate an EVA. This will automatically save it to the DB
 */
export const thunkDuplicateEva = appCreateAsyncThunk<
  {
    evaUuid: string;
    includeStations: boolean;
    forRex: boolean;
  },
  Eva,
  false
>("evaDuplicate", async ({ evaUuid, includeStations, forRex }, { dispatch, getState }) => {
  if (!evaUuid) return;
  //make a copy of the eva
  const eva = getState().eva.evas.find((e) => e.uuid === evaUuid);
  const newEva: Eva = cloneDeep(eva);
  newEva.uuid = uuidv4();
  const newDateString = getAccurateNow().toISOString();
  newEva.updatedAt = newDateString;
  newEva.createdAt = newDateString;
  if (!forRex) {
    newEva.refUuid = uuidv4();
    newEva.name = makeUniqueStringCopy(
      eva.name,
      getState().eva.evas.map((item) => item.name)
    );
  }

  //duplicate the stations
  if (includeStations) {
    //find all the stations from the original EVA
    const evaStationUuids: string[] = eva.sequence
      .filter((seqItem) => seqItem.type === "station")
      .map((stationSeqItem) => {
        return stationSeqItem.uuid;
      });
    const evaStations = getState().station.stations.filter((s) => evaStationUuids.includes(s.uuid));
    for (const station of evaStations) {
      //make a copy
      const newStationRes = (
        await dispatch(
          thunkDuplicateStation({
            stationUuid: station.uuid,
            preserveRefUuid: forRex,
          })
        )
      ).payload;
      if (newStationRes) {
        //update this station uuid in new eva sequence
        const sequenceIndex = newEva.sequence.findIndex((seqItem) => seqItem.uuid === station.uuid);
        newEva.sequence[sequenceIndex].uuid = newStationRes.uuid;
      }
    }
  }

  //duplicate the traverses
  //find all the traverses from the original EVA
  const evaTraverseUuids: string[] = eva.sequence
    .filter((seqItem) => seqItem.type === "traverse")
    .map((traverseSeqItem) => {
      return traverseSeqItem.uuid;
    });
  const evaTraverses = getState().traverse.traverses.filter((t) =>
    evaTraverseUuids.includes(t.uuid)
  );
  for (const traverse of evaTraverses) {
    //update this traverse uuid in new eva sequence
    const sequenceIndex = newEva.sequence.findIndex((seqItem) => seqItem.uuid === traverse.uuid);

    const newTraverseRes = (
      await dispatch(
        thunkDuplicateTraverse({
          traverseUuid: traverse.uuid,
          preserveRefUuid: forRex,
        })
      )
    ).payload;
    if (newTraverseRes) {
      // update this traverse uuid in new eva sequence
      newEva.sequence[sequenceIndex].uuid = newTraverseRes.uuid;
    }
  }

  // if this is for a REX, then we also need to duplicate the ingress/egress locations if they are not lander
  if (forRex) {
    if (eva.ingressLocationUuid !== "lander") {
      const newIngressStation = await dispatch(
        thunkDuplicateStation({
          stationUuid: eva.ingressLocationUuid,
          preserveRefUuid: true,
        })
      );
      if (newIngressStation.payload) {
        newEva.ingressLocationUuid = newIngressStation.payload.uuid;
      } else {
        throw new Error("Error duplicating ingress station in thunkDuplicateEva");
      }
    }
    if (eva.egressLocationUuid !== "lander") {
      const newEgressStation = await dispatch(
        thunkDuplicateStation({
          stationUuid: eva.egressLocationUuid,
          preserveRefUuid: true,
        })
      );
      if (newEgressStation.payload) {
        newEva.egressLocationUuid = newEgressStation.payload.uuid;
      } else {
        throw new Error("Error duplicating egress station in thunkDuplicateEva");
      }
    }
  }

  // upsert eva and persist to the db
  dispatch(upsertEvas([newEva], true));
  dispatch(upsertEvasFromDb([newEva]));
  const upsertEvasResponse = await httpClient_Eva.upsertEvas([newEva]);
  if (upsertEvasResponse.status !== "success") {
    throw new Error("Error upserting EVA: " + upsertEvasResponse.message);
  }

  if (!forRex) {
    dispatch(selectEva({ uuid: newEva.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
  return newEva;
});

export const thunkAddStationToEva = appCreateAsyncThunk<{ evaUuid: string }>(
  "evaAddStation",
  async ({ evaUuid }, { dispatch, getState }) => {
    const eva = getState().eva.evas.find((eva) => eva.uuid === evaUuid);
    const newEvaSequence = cloneDeep(eva.sequence);

    // add new station to the end of the sequence
    const newStationSequenceItem: EvaSequenceItem = {
      type: "station",
      uuid: "",
    };
    newEvaSequence.push(newStationSequenceItem);

    // create a traverse to add after the station
    const newTraverse = generateBlankTraverse({ missionId: eva.missionId });
    newEvaSequence.push({
      type: "traverse",
      uuid: newTraverse.uuid,
    });
    dispatch(upsertTraverses([newTraverse]));
    // save the traverse to the DB but keep it in edit mode
    dispatch(upsertTraversesFromDb([newTraverse]));
    const upsertTraverseRes = await httpClient_Traverse.upsertTraverses([newTraverse]);
    if (upsertTraverseRes.status !== "success") {
      throw new Error("Error upserting traverse in evaAddStation: " + upsertTraverseRes.message);
    }
    dispatch(setTraversesEditMode({ uuids: [newTraverse.uuid], editMode: true }));

    // update the sequence
    dispatch(setEvaSequence({ evaUuid: eva.uuid, sequence: newEvaSequence }));

    // expand the eva item
    dispatch(upsertExpandedEvaUuids([eva.uuid]));
  }
);

export const thunkDeleteStationFromEva = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
  sequenceIndex: number;
  evaUuid: string;
}>("evaDeleteStation", async ({ evaSequence, sequenceIndex, evaUuid }, { dispatch }) => {
  const newEvaSequence = cloneDeep(evaSequence);
  let traverseUuidToUpdate: string = null;
  // if this is the first station in the EVA, delete the traverse before it otherwise delete the traverse after it
  if (sequenceIndex === 1) {
    // set the traverse after the station to be updated
    traverseUuidToUpdate = newEvaSequence[sequenceIndex + 1].uuid;
    // delete the traverse record before the station
    dispatch(deleteTraversesByUuid([newEvaSequence[sequenceIndex - 1].uuid]));
    // remove the traverse before the station and the station from the newEvaSequence
    newEvaSequence.splice(sequenceIndex - 1, 2);
  } else {
    // set the traverse before the station to be updated
    traverseUuidToUpdate = newEvaSequence[sequenceIndex - 1].uuid;
    // delete the traverse record after the station
    dispatch(deleteTraversesByUuid([newEvaSequence[sequenceIndex + 1].uuid]));
    // remove the traverse after the station and the station from the newEvaSequence
    newEvaSequence.splice(sequenceIndex, 2);
  }

  dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));

  //update traverse marked above to update
  if (traverseUuidToUpdate) {
    await dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: traverseUuidToUpdate,
        rename: true,
        evaSequence: newEvaSequence,
      })
    );
  }
});

export const thunkChangeStationInEva = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
  sequenceIndex: number;
  newStationUuid: string;
  evaUuid: string;
}>(
  "evaChangeStation",
  async ({ evaSequence, sequenceIndex, newStationUuid, evaUuid }, { dispatch }) => {
    // and add the new uuid to the sequence
    const newEvaSequence = cloneDeep(evaSequence);
    newEvaSequence[sequenceIndex] = {
      type: "station",
      uuid: newStationUuid,
    };

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    dispatch(
      thunkUpdateTraversesAroundStation({
        stationUuid: newStationUuid,
        evaUuid,
      })
    );
  }
);

export const thunkReorderStationInEva = appCreateAsyncThunk<{
  direction: "up" | "down";
  evaSequence: EvaSequenceItem[];
  stationIndex: number;
  evaUuid: string;
}>("evaMoveStationUp", async ({ direction, evaSequence, stationIndex, evaUuid }, { dispatch }) => {
  const newEvaSequence = cloneDeep(evaSequence);
  const traverseUuidsToUpdate: string[] = [];
  let stationIndexToSwap: number;

  if (direction === "up") {
    // swap the item at index -2 with the item at index
    stationIndexToSwap = stationIndex - 2;
    traverseUuidsToUpdate.push(evaSequence[stationIndex + 1]?.uuid); //traverse after
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 1]?.uuid); //traverse in-between
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 3]?.uuid); //traverse before
  } else if (direction === "down") {
    stationIndexToSwap = stationIndex + 2;
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 1]?.uuid); //traverse before
    traverseUuidsToUpdate.push(evaSequence[stationIndex + 1]?.uuid); //traverse in-between
    traverseUuidsToUpdate.push(evaSequence[stationIndex + 3]?.uuid); //traverse after
  }
  //update sequence
  const tempStation = newEvaSequence[stationIndexToSwap];
  newEvaSequence[stationIndexToSwap] = newEvaSequence[stationIndex];
  newEvaSequence[stationIndex] = tempStation;
  dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));

  //update traverses
  for (const traverseUuid of traverseUuidsToUpdate) {
    //could be undefined if we're swapping at the ends
    if (traverseUuid) {
      await dispatch(
        thunkFullUpdateTraverse({
          traverseUuid: traverseUuid,
          rename: true,
          evaSequence: newEvaSequence,
        })
      );
    }
  }
});

export const thunkChangeIngressEgress = appCreateAsyncThunk<{
  type: "ingress" | "egress";
  evaUuid: string;
  newStationUuidOrLander: string; // either a uuid of a station or "lander"
}>(
  "evaChangeIngressEgress",
  async ({ type, evaUuid, newStationUuidOrLander }, { dispatch, getState }) => {
    const selectedEva = getState().eva.evas.find((e) => e.uuid === evaUuid);

    if (type === "ingress") {
      dispatch(upsertEvaByField(selectedEva.uuid, "ingressLocationUuid", newStationUuidOrLander));

      // update the traverse before the ingress station
      await dispatch(
        thunkFullUpdateTraverse({
          traverseUuid: selectedEva.sequence[selectedEva.sequence.length - 1].uuid,
          saveToDb: false,
          rename: true,
        })
      );
    } else if (type === "egress") {
      dispatch(upsertEvaByField(selectedEva.uuid, "egressLocationUuid", newStationUuidOrLander));

      // update the traverse after the egress station
      await dispatch(
        thunkFullUpdateTraverse({
          traverseUuid: selectedEva.sequence[0].uuid,
          saveToDb: false,
          rename: true,
        })
      );
    }
  }
);

// called when the dropdown next to an eva is changed between as-planned and executions
export const thunkChangeEvaDropdown = appCreateAsyncThunk<{
  dropdownEvaUuid: string;
  asPlanedEvaUuid: string;
}>("evaChangeDropdown", async ({ dropdownEvaUuid, asPlanedEvaUuid }, { dispatch, getState }) => {
  dispatch(setSelectedEvaSequenceItemUuid(null));
  dispatch(setSelectedEvaUuid(dropdownEvaUuid));
  dispatch(setSelectedPosEntryUuid(null));
  dispatch(setRightPanelIsOpen(true));
  dispatch(
    setEvaDropdownUIState({
      asPlannedEvaUuid: asPlanedEvaUuid,
      dropdownEvaUuid: dropdownEvaUuid,
    })
  );
  const rexEva = getState().rex.rexes.find((r) => r.evaUuid === dropdownEvaUuid);
  if (rexEva) {
    dispatch(setSelectedRexUuid(rexEva.uuid));
  } else {
    dispatch(setSelectedRexUuid(null));
    dispatch(setSelectedPosEntryUuid(null));
    // if we were selected on a rex tab, then switch to the eva info panel
    if (getState().eva.selectedEvaRightNavItem.toLowerCase().startsWith("rex")) {
      dispatch(setSelectedEvaRightNavItem("info_panel"));
    }
  }
});

export const thunkUpdateEvaName = appCreateAsyncThunk<{
  evaUuid: string;
  newName: string;
}>("evaUpdateName", async ({ evaUuid, newName }, { dispatch, getState }) => {
  dispatch(upsertEvaByField(evaUuid, "name", newName));

  // update all other EVAs that share this same refUuid
  const refUuid = getState().eva.evas.find((e) => e.uuid === evaUuid)?.refUuid;
  const evasWithSameRefUuid = getState().eva.evas.filter((e) => e.refUuid === refUuid);
  for (const eva of evasWithSameRefUuid) {
    if (eva.uuid !== evaUuid) {
      dispatch(upsertEvaByField(eva.uuid, "name", newName));
    }
  }
});

// set the onlyShowRunningRex, but also update all the selections and ui states
export const thunkSetOnlyShowRunningRexEva = appCreateAsyncThunk<{ show: boolean }>(
  "evaSetOnlyShowRunningRexEva",
  async ({ show }, { dispatch, getState }) => {
    dispatch(setOnlyShowRunningRex(show));
    // if the toggle is on, we need to update selection to only the running rex
    if (show) {
      // select the running REX and EVA
      const runningRex = getState().rex.rexes.find((r) => r.isRunning);
      if (!runningRex) return;
      dispatch(setSelectedEvaUuid(runningRex.evaUuid));
      dispatch(setSelectedRexUuid(runningRex.uuid));
      // get as-planned eva uuid and set the dropdown
      const allRexEvas = getState().rex.rexes.map((r) => r.evaUuid);
      const runningRexEva = getState().eva.evas.find((e) => e.uuid === runningRex.evaUuid);
      const asPlannedEva = getState().eva.evas.find(
        (e) => e.refUuid === runningRexEva.refUuid && !allRexEvas.includes(e.uuid)
      );
      dispatch(
        setEvaDropdownUIState({
          asPlannedEvaUuid: asPlannedEva?.uuid,
          dropdownEvaUuid: runningRex.evaUuid,
        })
      );
      // expand the eva
      dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
    }
  }
);
