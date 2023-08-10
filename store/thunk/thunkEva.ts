import {
  deleteEvaByUuid,
  setEvaEditMode,
  setEvaSequence,
  setEvasCalculatedFields,
  setEvasFromDb,
  setExpandedEvaUuids,
  upsertEva,
  upsertEvaFromDb,
} from "store/eva";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { selectEVASequenceItem, saveNewEva } from "store/cross-slice";
import { setRightPanelOpen } from "store/interface";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import {
  deleteTraverse,
  upsertTraverse,
  setTraverseEditMode,
  deleteTraverseFromDb,
  setTraversesFromDb,
  upsertTraverseFromDb,
} from "store/traverse";
import * as httpClient_Eva from "http-client/eva";
import * as httpClient_Traverse from "http-client/traverse";
import _ from "lodash";
import { thunkFullUpdateTraverse, thunkUpdateTraversesAroundStation } from "./thunkTraverse";
import { roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { mergeEquipmentItems } from "utils/store";

export const thunkCreateEvasCalculatedFields = appCreateAsyncThunk<void>(
  "createEvasCalculatedFields",
  async (_, { dispatch, getState }) => {
    const stationsCalculatedFields = getState().station.calculatedFields;
    const traversesCalculatedFields = getState().traverse.calculatedFields;
    const evas = getState().eva.evas;

    const allCalculatedFields: EvaCalculatedFields[] = [];
    for (const eva of evas) {
      // go through eva sequence and calculate things
      const evaSequence = eva.sequence;

      //generate report messages
      const newReportItems: ReportItem[] = [];

      // check if no sequence items
      if (eva.sequence.length === 0) {
        newReportItems.push({
          message: "EVA has no stations or traverses",
          type: "warning",
        } as ReportItem);
      }

      const evaCalculatedFields: EvaCalculatedFields = {
        uuid: eva.uuid,
        reportItems: [], // report items for the eva itself
        totalTime: {
          durationLower: 0,
          durationUpper: 0,
        },
        totalEv1Time: {
          durationLower: 0,
          durationUpper: 0,
        },
        totalEv2Time: {
          durationLower: 0,
          durationUpper: 0,
        },
        totalUnassignedTime: {
          durationLower: 0,
          durationUpper: 0,
        },
        totalDwellTime: {
          durationLower: 0,
          durationUpper: 0,
        },
        actionCount: 0,
        totalTraverseTime: 0,
        totalTraverseDistanceMeters: 0,
        totalTraverseAscentDescent: {
          totalMetersClimbed: 0,
          totalMetersDescended: 0,
        },
        totalEvaTime: {
          durationLower: 0,
          durationUpper: 0,
        },
        equipmentItems: [],
      };

      for (const seqItem of evaSequence) {
        const thisStationCalculatedFields = stationsCalculatedFields.find(
          (stationCalculatedFields) => stationCalculatedFields.uuid === seqItem.uuid
        );
        const thisTraverseCalculatedFields = traversesCalculatedFields.find(
          (traverseCalculatedFields) => traverseCalculatedFields.uuid === seqItem.uuid
        );
        if (thisStationCalculatedFields) {
          evaCalculatedFields.totalTime.durationLower +=
            thisStationCalculatedFields.totalTime.durationLower;
          evaCalculatedFields.totalTime.durationUpper +=
            thisStationCalculatedFields.totalTime.durationUpper;
          evaCalculatedFields.totalEv1Time.durationLower +=
            thisStationCalculatedFields.totalEv1Time.durationLower;
          evaCalculatedFields.totalEv1Time.durationUpper +=
            thisStationCalculatedFields.totalEv1Time.durationUpper;
          evaCalculatedFields.totalEv2Time.durationLower +=
            thisStationCalculatedFields.totalEv2Time.durationLower;
          evaCalculatedFields.totalEv2Time.durationUpper +=
            thisStationCalculatedFields.totalEv2Time.durationUpper;
          evaCalculatedFields.totalUnassignedTime.durationLower +=
            thisStationCalculatedFields.totalUnassignedTime.durationLower;
          evaCalculatedFields.totalUnassignedTime.durationUpper +=
            thisStationCalculatedFields.totalUnassignedTime.durationUpper;
          evaCalculatedFields.totalDwellTime.durationLower +=
            thisStationCalculatedFields.totalDwellTime.durationLower;
          evaCalculatedFields.totalDwellTime.durationUpper +=
            thisStationCalculatedFields.totalDwellTime.durationUpper;
          evaCalculatedFields.actionCount += thisStationCalculatedFields.actionCount;
          evaCalculatedFields.equipmentItems = mergeEquipmentItems(
            thisStationCalculatedFields.equipmentItems,
            evaCalculatedFields.equipmentItems
          );
        } else if (thisTraverseCalculatedFields) {
          evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
          evaCalculatedFields.totalTraverseDistanceMeters +=
            thisTraverseCalculatedFields.distanceMeters;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
        }
      }
      evaCalculatedFields.totalEvaTime.durationLower =
        evaCalculatedFields.totalDwellTime.durationLower + evaCalculatedFields.totalTraverseTime;
      evaCalculatedFields.totalEvaTime.durationUpper =
        evaCalculatedFields.totalDwellTime.durationUpper + evaCalculatedFields.totalTraverseTime;

      // check if max time exceeds limit

      // check if max time exceeds limit but is still within nominal
      if (
        eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationLower <= eva.maxDuration
      ) {
        newReportItems.push({
          message:
            "Calculated max EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
            " minutes but calculated nominal EVA duration is within limit",
          type: "warning",
        } as ReportItem);
      } else if (
        // check if max time exceeds limit and is also above nominal
        eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration
      ) {
        newReportItems.push({
          message:
            "Calculated max EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
            " minutes",
          type: "error",
        } as ReportItem);
      }
      // check if nominal time exceeds limit
      if (eva.maxDuration && evaCalculatedFields.totalEvaTime.durationLower > eva.maxDuration) {
        newReportItems.push({
          message:
            "Calculated nominal EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationLower - eva.maxDuration).toFixed(0) +
            " minutes",
          type: "error",
        } as ReportItem);
      }

      evaCalculatedFields.reportItems = newReportItems;

      allCalculatedFields.push(evaCalculatedFields);
    }
    dispatch(setEvasCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);

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
});

export const thunkSaveEva = appCreateAsyncThunk<{
  eva: Eva;
}>("evaSave", async ({ eva }, { dispatch, getState }) => {
  if (!eva) return;
  // upsert the changed Station to the DB via internal API call
  const evaUpsertResponse = await httpClient_Eva.upsertEva({
    ...eva,
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  });

  if (evaUpsertResponse.status === "success") {
    // upsert the changed eva (with new updated date) to the store
    dispatch(upsertEva(evaUpsertResponse.data, true));
    dispatch(upsertEvaFromDb(evaUpsertResponse.data));
  } else {
    throw new Error("Error upserting Station: " + evaUpsertResponse.message);
  }

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
  for (const traverse of thisEvasTraverses) {
    if (isModified([traverse], [thisEvasTraversesFromDb.find((t) => t.uuid === traverse.uuid)])) {
      const traverseUpsertResponse = await httpClient_Traverse.upsertTraverse({
        ...traverse,
        updatedAt: roundDateToSecond(new Date()).toISOString(),
      });
      if (traverseUpsertResponse.status === "success") {
        // upsert the changed Traverse (with new updated date) to the store
        dispatch(upsertTraverse(traverseUpsertResponse.data, true));
        dispatch(upsertTraverseFromDb(traverseUpsertResponse.data));
      }
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
  for (const traverse of traversesToDelete) {
    await httpClient_Traverse.deleteTraverse(traverse.uuid, getState().mission.mission.id);
  }

  // reset the traversesFromDB in the store with a fresh copy from the DB
  const traverseData = await httpClient_Traverse.getTraverses(getState().mission.mission?.id);
  if (traverseData.data) {
    dispatch(setTraversesFromDb(traverseData.data));
  }

  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

export const thunkEvaCancel = appCreateAsyncThunk<{
  eva: Eva;
}>("evaCancel", async ({ eva }, { dispatch, getState }) => {
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === eva.uuid);
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
      dispatch(deleteTraverse({ uuid: traverseUuid }));
    });

    // copy back alltraverses for this eva defined in selectedEvaFromDb
    const traversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
      return traverseUuidsInDb.includes(traverse.uuid);
    });
    traversesFromDb.forEach((traverse) => {
      dispatch(upsertTraverse(traverse, true));
      dispatch(setTraverseEditMode({ uuid: traverse.uuid, editMode: false }));
    });

    // eva is already saved once to the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertEva(evaFromDb, true));
  } else {
    // eva hasn't been saved to the db. delete the eva and actions from the store
    dispatch(deleteEvaByUuid(eva.uuid));
    dispatch(setRightPanelOpen(false));
  }
  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
});

export const thunkDeleteEva = appCreateAsyncThunk<{
  eva: Eva;
}>("evaDelete", async ({ eva }, { dispatch, getState }) => {
  if (!eva) return;
  // delete all of the traverses used in this EVA sequence if they are in traversesFromDb
  const traverseUuidsInThisEva: string[] = [];
  eva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  const thisEvasTraversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  for (const traverse of thisEvasTraversesFromDb) {
    const deleteResponse: WrappedResponse<number> = await httpClient_Traverse.deleteTraverse(
      traverse.uuid,
      getState().mission.mission.id
    );
    if (deleteResponse.status === "success") {
      // remove the corresponding traverse from the traversesFromDb store
      dispatch(deleteTraverseFromDb({ uuid: traverse.uuid }));
    }
  }
  // get fresh copy of Traverses from DB
  const traverseData = await httpClient_Traverse.getTraverses(getState().mission.mission?.id);
  if (traverseData.data) {
    dispatch(setTraversesFromDb(traverseData.data));
  }

  // delete all of the traverses used in this EVA sequence from the traverses store
  const thisEvasTraverses = getState().traverse.traverses.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  thisEvasTraverses.forEach((traverse) => {
    dispatch(deleteTraverse({ uuid: traverse.uuid }));
  });

  // delete the eva from the DB or the store
  // if the selected eva is in evasFromDb then delete it from the db
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === eva.uuid);
  if (evaFromDb) {
    // delete the Eva from the DB via internal API call
    const deleteResponse: WrappedResponse<number> = await httpClient_Eva.deleteEva(
      eva.uuid,
      getState().mission.mission.id
    );
    if (deleteResponse.status === "success") {
      // remove the corresponding eva from the store
      dispatch(deleteEvaByUuid(eva.uuid));

      // get fresh copy of Evas from DB
      const evaData = await httpClient_Eva.getEvas(getState().mission.mission?.id);
      if (evaData.data) {
        dispatch(setEvasFromDb(evaData.data));
      }
    } else {
      console.error("Error deleting Eva: " + deleteResponse.message);
    }
  } else {
    // if the selected eva is not in evasFromDb then delete it from the store
    dispatch(deleteEvaByUuid(eva.uuid));
  }

  dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: false }));
  // close right panel
  dispatch(setRightPanelOpen(false));
});

export const thunkCreateEva = appCreateAsyncThunk<void>(
  "evaCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().eva.evas.map((item) => item.name),
    });

    const blankEva: Eva = {
      ownerId: null,
      missionId: getState().mission.mission?.id,
      uuid: uuidv4(),
      name: randomName,
      status: "Candidate",
      sequence: [],
      description: "",
      traverseRate: 3.2, // default to 3.2 km/hr
      maxDuration: getState().mission.mission.defaultEvaDuration,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: null,
    };
    dispatch(saveNewEva(blankEva));
    dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
  }
);

export const thunkDuplicateEva = appCreateAsyncThunk<{ eva: Eva }>(
  "evaDuplicate",
  async ({ eva }, { dispatch, getState }) => {
    if (!eva) return;
    //make a copy of the eva
    const newEva: Eva = _.cloneDeep(eva);
    newEva.uuid = uuidv4();
    newEva.updatedAt = null;
    newEva.createdAt = roundDateToSecond(new Date()).toISOString();
    newEva.name = makeUniqueStringCopy(
      eva.name,
      getState().eva.evas.map((item) => item.name)
    );

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
      const newUuid = uuidv4();

      //update this traverse uuid in new eva sequence
      const sequenceIndex = newEva.sequence.findIndex((seqItem) => seqItem.uuid === traverse.uuid);
      newEva.sequence[sequenceIndex].uuid = newUuid;

      //make a copy
      const newTraverse: Traverse = _.cloneDeep(traverse);
      newTraverse.createdAt = roundDateToSecond(new Date()).toISOString();
      newTraverse.updatedAt = null;
      newTraverse.uuid = newUuid;
      dispatch(upsertTraverse(newTraverse));
      dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: true }));
    }

    //new eva is ready to be duplicated in the store.
    dispatch(saveNewEva(newEva));
  }
);

export const thunkAddStationToEva = appCreateAsyncThunk<{ eva: Eva }>(
  "evaAddStation",
  async ({ eva }, { dispatch, getState }) => {
    const newEvaSequence = _.cloneDeep(eva.sequence);

    const newStationSequenceItem: EvaSequenceItem = {
      type: "station",
      uuid: "",
    };
    if (newEvaSequence.length === 0) {
      newEvaSequence.push(newStationSequenceItem);
    } else {
      // add a traverse before the station
      const newTraverse: Traverse = {
        missionId: getState().mission.mission?.id,
        uuid: uuidv4(),
        name: "",
        description: "",
        predictedDurationLower: null,
        predictedDurationUpper: null,
        path: [],
        pathSegmentDistances: null,
        pathSegmentElevations: null,
        status: null,
        updatedAt: null,
        createdAt: roundDateToSecond(new Date()).toISOString(),
      };
      dispatch(upsertTraverse(newTraverse));

      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse.uuid,
      });
      newEvaSequence.push(newStationSequenceItem);
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
}>("evaDeleteStation", async ({ evaSequence, sequenceIndex, evaUuid }, { dispatch, getState }) => {
  const newEvaSequence = _.cloneDeep(evaSequence);
  let traverseUuidToUpdate: string = null;
  // if there is a traverse after the station, delete it
  if (newEvaSequence[sequenceIndex + 1] && newEvaSequence[sequenceIndex + 1].type === "traverse") {
    if (sequenceIndex >= 2) traverseUuidToUpdate = newEvaSequence[sequenceIndex - 1].uuid;
    // remove the station and this sequence from the newEvaSequence
    dispatch(deleteTraverse({ uuid: newEvaSequence[sequenceIndex + 1].uuid }));
    newEvaSequence.splice(sequenceIndex, 2);
  } else if (
    newEvaSequence[sequenceIndex - 1] &&
    newEvaSequence[sequenceIndex - 1].type === "traverse"
  ) {
    //there's no traverse after the station, this must be the last station in the sequence.
    //if there is a traverse before the station, delete station and this sequence from the newEvaSequence
    dispatch(deleteTraverse({ uuid: newEvaSequence[sequenceIndex - 1].uuid }));
    newEvaSequence.splice(sequenceIndex - 1, 2);
  } else {
    // remove the station alone
    newEvaSequence.splice(sequenceIndex, 1);
  }

  dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));

  //update traverse if we need to
  if (traverseUuidToUpdate) {
    const traverse = getState().traverse.traverses.find((t) => t.uuid === traverseUuidToUpdate);
    await dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: traverse.uuid,
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
    const newEvaSequence = _.cloneDeep(evaSequence);
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
  const newEvaSequence = _.cloneDeep(evaSequence);
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
