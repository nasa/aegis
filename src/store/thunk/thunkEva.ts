import {
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setEvaEditMode,
  setEvaSequence,
  setExpandedEvaUuids,
  setSelectedEvaUuid,
  upsertEva,
  upsertEvaFromDb,
} from "store/eva";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { thunkSaveNewEva, thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import {
  setTraverseEditMode,
  upsertTraverses,
  upsertTraversesFromDb,
  deleteTraversesFromDbByUuid,
  deleteTraversesByUuid,
} from "store/traverse";
import * as httpClient_Eva from "http-client/eva";
import * as httpClient_Traverse from "http-client/traverse";
import * as httpClient_Rex from "http-client/rex";
import cloneDeep from "lodash/cloneDeep";
import { thunkFullUpdateTraverse, thunkUpdateTraversesAroundStation } from "./thunkTraverse";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkDuplicateStation } from "./thunkStation";
import { upsertRex, upsertRexFromDb } from "store/rex";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankTraverse } from "store/storeUtils/traverse";

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

export const thunkSaveEva = appCreateAsyncThunk<{
  evaUuid: string;
}>("evaSave", async ({ evaUuid }, { dispatch, getState }) => {
  if (!evaUuid) return;
  const eva = getState().eva.evas.find((e) => e.uuid === evaUuid);
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

  // find out if the traverses in this eva have been modified and need to be persisted
  const traverseUuidsInThisEva: string[] = [];
  eva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  const thisEvasTraverses = getState().traverse.traverses.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  const thisEvasTraversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  // upsert the any modified traverses to the DB and update both copies in the store
  const modifiedTraverses = thisEvasTraverses.flatMap((traverse) => {
    const traverseFromDb = thisEvasTraversesFromDb.find((t) => t.uuid === traverse.uuid);
    if (isModified([traverse], [traverseFromDb])) {
      return { ...traverse, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() };
    } else {
      return [];
    }
  });
  if (modifiedTraverses?.length > 0) {
    const traverseUpsertResponse = await httpClient_Traverse.upsertTraverses(
      modifiedTraverses,
      isRexRunning
    );
    if (traverseUpsertResponse.status === "success") {
      // upsert the changed Traverse (with new updated date) to the store
      dispatch(upsertTraverses(traverseUpsertResponse.data, true));
      dispatch(upsertTraversesFromDb(traverseUpsertResponse.data));
    }
  }
  // prune traverses from the db that are no longer in any EVA
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
    await httpClient_Traverse.deleteTraverses(traverseToDeleteUuids, isRexRunning);
    dispatch(deleteTraversesFromDbByUuid(traverseToDeleteUuids));
    dispatch(deleteTraversesByUuid(traverseToDeleteUuids));
  }

  // upsert the changed Eva to the DB via internal API call
  const evaUpsertResponse = await httpClient_Eva.upsertEvas(
    [
      {
        ...eva,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    isRexRunning
  );
  if (evaUpsertResponse.status === "success") {
    // upsert the changed eva (with new updated date) to the store
    dispatch(upsertEva(evaUpsertResponse.data[0], true));
    dispatch(upsertEvaFromDb(evaUpsertResponse.data[0]));
  } else {
    throw new Error("Error upserting Eva: " + evaUpsertResponse.message);
  }

  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

export const thunkEvaCancel = appCreateAsyncThunk<{
  evaUuid: string;
}>("evaCancel", async ({ evaUuid }, { dispatch, getState }) => {
  const eva = getState().eva.evas.find((evaFromDb) => evaFromDb.uuid === evaUuid);
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === evaUuid);

  if (evaFromDb) {
    // delete the traverses that were added to the store are not in the copy from the db
    const traverseUuids: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuids.push(sequenceItem.uuid);
      }
    });
    const traverseUuidsInDb: string[] = [];
    evaFromDb.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInDb.push(sequenceItem.uuid);
      }
    });
    const traverseUuidsNotFromDb = traverseUuids.filter((traverseUuid) => {
      return !traverseUuidsInDb.includes(traverseUuid);
    });
    // delete the traverses that were added during this edit to this EVA
    traverseUuidsNotFromDb.forEach((traverseUuid) => {
      dispatch(deleteTraversesByUuid([traverseUuid]));
    });

    // copy back alltraverses for this eva defined in selectedEvaFromDb
    const traversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
      return traverseUuidsInDb.includes(traverse.uuid);
    });
    traversesFromDb.forEach((traverse) => {
      dispatch(upsertTraverses([traverse], true));
      dispatch(setTraverseEditMode({ uuid: traverse.uuid, editMode: false }));
    });

    // eva is already saved once to the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertEva(evaFromDb, true));
  } else {
    // delete any traverses
    const traverseUuids = eva.sequence.filter((s) => s.type === "traverse")?.map((t) => t.uuid);
    if (traverseUuids) {
      dispatch(deleteTraversesByUuid(traverseUuids));
    }

    // eva hasn't been saved to the db. delete the eva and actions from the store
    dispatch(deleteEvaByUuid(eva.uuid));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  }
  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

export const thunkDeleteEva = appCreateAsyncThunk<{
  evaUuid: string;
}>("evaDelete", async ({ evaUuid }, { dispatch, getState }) => {
  if (!evaUuid) return;
  const eva = getState().eva.evas.find((e) => e.uuid === evaUuid);
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

  const runningRexUsingThisEva = getState().rex.rexes.find(
    (rex) => rex.evaUuid === eva.uuid && rex.isRunning
  );
  if (runningRexUsingThisEva) {
    window.alert("Cannot delete EVA while it is being executed");
    return;
  }

  // unselect this EVA from all REXs
  const allRexes = getState().rex.rexes;
  allRexes.forEach((rex) => {
    if (rex.evaUuid === eva.uuid) {
      if (confirm(`This EVA is selected in Real-time execution item ${rex.name}. Unselect it?`)) {
        dispatch(upsertRex({ ...rex, evaUuid: null }, true));
        dispatch(upsertRexFromDb({ ...rex, evaUuid: null }));
        // persist the change to rex in the db
        httpClient_Rex.upsertRexes([{ ...rex, evaUuid: null }], isRexRunning);
      }
    }
  });

  //first deselect the EVa. This prevents race errors when the timeline tries to render prematurely before we're done deleting all the parts
  dispatch(setSelectedEvaUuid(null));

  // delete all of the traverses used in this EVA sequence
  const traverseUuidsInThisEva: string[] = [];
  eva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  if (traverseUuidsInThisEva.length > 0) {
    // delete all of the traverses the traverses store
    const traversesToDelete = getState().traverse.traverses.filter((traverse) => {
      return traverseUuidsInThisEva.includes(traverse.uuid);
    });
    dispatch(deleteTraversesByUuid(traversesToDelete.map((t) => t.uuid)));

    // delete traverse from db if this eva has been saved before
    const traversesToDeleteFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
      return traverseUuidsInThisEva.includes(traverse.uuid);
    });
    if (traversesToDeleteFromDb.length > 0) {
      const deleteResponse: WrappedResponse<null> = await httpClient_Traverse.deleteTraverses(
        traversesToDeleteFromDb.map((t) => t.uuid),
        isRexRunning
      );
      if (deleteResponse.status === "success") {
        // remove the corresponding traverse from the traversesFromDb store
        dispatch(deleteTraversesFromDbByUuid(traversesToDeleteFromDb.map((t) => t.uuid)));
      }
    }
  }

  // delete the eva from the DB or the store
  // if the selected eva is in evasFromDb then delete it from the db
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === eva.uuid);
  if (evaFromDb) {
    // delete the Eva from the DB via internal API call
    const deleteResponse: WrappedResponse<null> = await httpClient_Eva.deleteEvas(
      [eva.uuid],
      isRexRunning
    );
    if (deleteResponse.status === "success") {
      // remove the corresponding eva from the store
      dispatch(deleteEvaByUuid(eva.uuid));
      dispatch(deleteEvaFromDbByUuid(eva.uuid));
    } else {
      console.error("Error deleting Eva: " + deleteResponse.message);
    }
  } else {
    // if the selected eva is not in evasFromDb then just delete it from the store
    dispatch(deleteEvaByUuid(eva.uuid));
  }

  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
  dispatch(
    setExpandedEvaUuids(getState().eva.expandedEvaUuids.filter((uuid) => uuid !== eva.uuid))
  );
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
      maxDuration: getState().mission.mission.defaultEvaDuration,
    });

    //create an empty traverse
    const newTraverse: Traverse = generateBlankTraverse({ missionId: blankEva.missionId });
    dispatch(upsertTraverses([newTraverse]));

    //add the traverse to the sequence
    blankEva.sequence.push({
      type: "traverse",
      uuid: newTraverse.uuid,
    });

    //save the new eva
    dispatch(thunkSaveNewEva({ eva: blankEva }));

    //full update the traverse to get the path
    await dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: newTraverse.uuid,
        rename: true,
        evaSequence: blankEva.sequence,
      })
    );

    dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
  }
);

export const thunkDuplicateEva = appCreateAsyncThunk<{
  eva: Eva;
  includeStations: boolean;
}>("evaDuplicate", async ({ eva, includeStations }, { dispatch, getState }) => {
  if (!eva) return;
  //make a copy of the eva
  const newEva: Eva = cloneDeep(eva);
  newEva.uuid = uuidv4();
  newEva.updatedAt = null;
  newEva.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
  newEva.name = makeUniqueStringCopy(
    eva.name,
    getState().eva.evas.map((item) => item.name)
  );

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
      const newStationRes = (await dispatch(thunkDuplicateStation({ stationUuid: station.uuid })))
        .payload;
      if (newStationRes) {
        //update this station uuid in new eva sequence
        const sequenceIndex = newEva.sequence.findIndex((seqItem) => seqItem.uuid === station.uuid);
        newEva.sequence[sequenceIndex].uuid = newStationRes.uuid;
      }
    }
  }

  //find all the traverses from the original EVA
  const evaTraverseUuids: string[] = eva.sequence
    .filter((seqItem) => seqItem.type === "traverse")
    .map((traverseSeqItem) => {
      return traverseSeqItem.uuid;
    });
  const evaTraverses = getState().traverse.traverses.filter((t) =>
    evaTraverseUuids.includes(t.uuid)
  );
  //duplicate the traverses
  for (const traverse of evaTraverses) {
    const newTraverseUuid = uuidv4();

    //update this traverse uuid in new eva sequence
    const sequenceIndex = newEva.sequence.findIndex((seqItem) => seqItem.uuid === traverse.uuid);
    newEva.sequence[sequenceIndex].uuid = newTraverseUuid;

    //make a copy
    const newTraverse: Traverse = cloneDeep(traverse);
    newTraverse.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newTraverse.updatedAt = null;
    newTraverse.uuid = newTraverseUuid;

    // build the traverse name
    let nameBefore: string;
    let nameAfter: string;

    // if no station before, check egress location
    if (sequenceIndex === 0) {
      if (newEva.egressLocationUuid === "lander") {
        nameBefore = "Lander";
      } else {
        nameBefore = getState().station.stations.find(
          (s) => s.uuid === newEva.egressLocationUuid
        ).name;
      }
    } else {
      nameBefore = getState().station.stations.find(
        (s) => s.uuid === newEva.sequence[sequenceIndex - 1].uuid
      )?.name;
    }
    // if no station after, check ingress location
    if (sequenceIndex === newEva.sequence.length - 1) {
      if (newEva.ingressLocationUuid === "lander") {
        nameAfter = "Lander";
      } else {
        nameAfter = getState().station.stations.find(
          (s) => s.uuid === newEva.ingressLocationUuid
        ).name;
      }
    } else {
      nameAfter = getState().station.stations.find(
        (s) => s.uuid === newEva.sequence[sequenceIndex + 1].uuid
      )?.name;
    }

    newTraverse.name = `${nameBefore} to ${nameAfter}`;
    dispatch(upsertTraverses([newTraverse]));
    dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: true }));
  }

  //new eva is ready to be duplicated in the store.
  dispatch(thunkSaveNewEva({ eva: newEva }));
});

export const thunkAddStationToEva = appCreateAsyncThunk<{ evaUuid: string }>(
  "evaAddStation",
  async ({ evaUuid }, { dispatch, getState }) => {
    const eva = getState().eva.evas.find((eva) => eva.uuid === evaUuid);
    const newEvaSequence = cloneDeep(eva.sequence);

    const newStationSequenceItem: EvaSequenceItem = {
      type: "station",
      uuid: "",
    };
    if (newEvaSequence.length === 0) {
      // add traverse for "from lander"
      const newTraverse = generateBlankTraverse({ missionId: eva.missionId });
      dispatch(upsertTraverses([newTraverse]));
      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse.uuid,
      });

      // add new station sequence item
      newEvaSequence.push(newStationSequenceItem);

      // add traverse for "to lander"
      const newTraverse2 = generateBlankTraverse({ missionId: eva.missionId });
      dispatch(upsertTraverses([newTraverse2]));
      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse2.uuid,
      });
    } else {
      // add a traverse before the station
      const newTraverse = generateBlankTraverse({ missionId: eva.missionId });
      dispatch(upsertTraverses([newTraverse]));

      // add new station to the end of the sequence
      newEvaSequence.push(newStationSequenceItem);

      // add a traverse after the station that becomes the new "to lander"
      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse.uuid,
      });
    }
    dispatch(setEvaSequence({ evaUuid: eva.uuid, sequence: newEvaSequence }));

    // expand the eva item
    if (getState().eva.expandedEvaUuids.indexOf(eva.uuid) === -1) {
      dispatch(setExpandedEvaUuids([...getState().eva.expandedEvaUuids, eva.uuid]));
    }
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
    const newEvaSequence = cloneDeep(evaSequence);
    newEvaSequence[sequenceIndex] = {
      type: "station",
      uuid: newStationUuid,
    };

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    dispatch(thunkUpdateTraversesAroundStation({ stationUuid: newStationUuid, evaUuid: evaUuid }));
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
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 1]?.uuid); //traverse inbetween
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 3]?.uuid); //traverse before
  } else if (direction === "down") {
    stationIndexToSwap = stationIndex + 2;
    traverseUuidsToUpdate.push(evaSequence[stationIndex - 1]?.uuid); //traverse before
    traverseUuidsToUpdate.push(evaSequence[stationIndex + 1]?.uuid); //traverse inbetween
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
