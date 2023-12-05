import {
  deleteEvaByUuid,
  setEvaEditMode,
  setEvaSequence,
  setEvasCalculatedFields,
  setEvasFromDb,
  setExpandedEvaUuids,
  setSelectedEvaUuid,
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
  deleteTraverseByUuid,
  upsertTraverse,
  setTraverseEditMode,
  setTraversesFromDb,
  upsertTraverses,
  upsertTraversesFromDb,
  deleteTraversesFromDbByUuid,
  deleteTraversesByUuid,
} from "store/traverse";
import * as httpClient_Eva from "http-client/eva";
import * as httpClient_Traverse from "http-client/traverse";
import * as httpClient_Rex from "http-client/rex";
import _ from "lodash";
import { thunkFullUpdateTraverse, thunkUpdateTraversesAroundStation } from "./thunkTraverse";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { mergeEquipmentItems } from "utils/store";
import { thunkDuplicateStation } from "./thunkStation";
import { upsertRex, upsertRexFromDb } from "store/rex";

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
        totalActionTime: {
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
        sequenceItemsCalculatedData: [],
      };

      let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
      for (const seqItem of evaSequence) {
        const thisStationCalculatedFields = stationsCalculatedFields.find(
          (stationCalculatedFields) => stationCalculatedFields.uuid === seqItem.uuid
        );
        const thisTraverseCalculatedFields = traversesCalculatedFields.find(
          (traverseCalculatedFields) => traverseCalculatedFields.uuid === seqItem.uuid
        );
        if (thisStationCalculatedFields) {
          evaCalculatedFields.totalActionTime.durationLower +=
            thisStationCalculatedFields.totalActionTime.durationLower;
          evaCalculatedFields.totalActionTime.durationUpper +=
            thisStationCalculatedFields.totalActionTime.durationUpper;
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
          evaCalculatedFields.sequenceItemsCalculatedData.push({
            uuid: seqItem.uuid,
            startSeconds: runningEvaSeconds,
            endSeconds:
              runningEvaSeconds + thisStationCalculatedFields.totalDwellTime.durationUpper * 60,
          });
          runningEvaSeconds += thisStationCalculatedFields.totalDwellTime.durationUpper * 60;
        } else if (thisTraverseCalculatedFields) {
          evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
          evaCalculatedFields.totalTraverseDistanceMeters +=
            thisTraverseCalculatedFields.distanceMeters;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
          evaCalculatedFields.sequenceItemsCalculatedData.push({
            uuid: seqItem.uuid,
            startSeconds: runningEvaSeconds,
            endSeconds: runningEvaSeconds + thisTraverseCalculatedFields.durationMinutes * 60,
          });
          runningEvaSeconds += thisTraverseCalculatedFields.durationMinutes * 60;
        }
      }
      evaCalculatedFields.totalEvaTime.durationLower =
        evaCalculatedFields.totalDwellTime.durationLower +
        evaCalculatedFields.totalTraverseTime +
        eva.egressDuration +
        eva.ingressDuration;
      evaCalculatedFields.totalEvaTime.durationUpper =
        evaCalculatedFields.totalDwellTime.durationUpper +
        evaCalculatedFields.totalTraverseTime +
        eva.egressDuration +
        eva.ingressDuration;

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
  return null;
});

export const thunkSaveEva = appCreateAsyncThunk<{
  eva: Eva;
}>("evaSave", async ({ eva }, { dispatch, getState }) => {
  if (!eva) return;
  //rex active?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

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
      rexRunning
    );
    if (traverseUpsertResponse.status === "success") {
      // upsert the changed Traverse (with new updated date) to the store
      dispatch(upsertTraverses(traverseUpsertResponse.data, true));
      dispatch(upsertTraversesFromDb(traverseUpsertResponse.data));
    }
  }

  // upsert the changed Eva to the DB via internal API call
  const evaUpsertResponse = await httpClient_Eva.upsertEvas(
    [
      {
        ...eva,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    rexRunning
  );

  if (evaUpsertResponse.status === "success") {
    // upsert the changed eva (with new updated date) to the store
    dispatch(upsertEva(evaUpsertResponse.data[0], true));
    dispatch(upsertEvaFromDb(evaUpsertResponse.data[0]));
  } else {
    throw new Error("Error upserting Eva: " + evaUpsertResponse.message);
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
    await httpClient_Traverse.deleteTraverses(
      traversesToDelete.map((t) => t.uuid),
      rexRunning
    );
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
      dispatch(deleteTraverseByUuid(traverseUuid));
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
  //rex active?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  const runningRexUsingThisEva = getState().rex.rexes.find(
    (rex) => rex.selectedRexEvaUuid === eva.uuid && rex.rexRunning
  );
  if (runningRexUsingThisEva) {
    throw new Error("Cannot delete EVA while it is being executed");
  }

  // unselect this EVA from all REXs
  const allRexes = getState().rex.rexes;
  allRexes.forEach((rex) => {
    if (rex.selectedRexEvaUuid === eva.uuid) {
      if (confirm(`This EVA is selected in Real-time execution item ${rex.name}. Unselect it?`)) {
        dispatch(upsertRex({ ...rex, selectedRexEvaUuid: null }, true));
        dispatch(upsertRexFromDb({ ...rex, selectedRexEvaUuid: null }));
        // persist the change to rex in the db
        httpClient_Rex.upsertRexes([{ ...rex, selectedRexEvaUuid: null }], rexRunning);
      }
    }
  });

  //first deselect the EVa. This prevents race errors when the timeline tries to render prematurely before we're done deleting all the parts
  dispatch(setSelectedEvaUuid(null));

  // delete all of the traverses used in this EVA sequence if they are in traversesFromDb
  const traverseUuidsInThisEva: string[] = [];
  eva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  if (traverseUuidsInThisEva.length > 0) {
    const thisEvasTraversesFromDb = getState().traverse.traversesFromDb.filter((traverse) => {
      return traverseUuidsInThisEva.includes(traverse.uuid);
    });
    const deleteResponse: WrappedResponse<null> = await httpClient_Traverse.deleteTraverses(
      thisEvasTraversesFromDb.map((t) => t.uuid),
      rexRunning
    );
    if (deleteResponse.status === "success") {
      // remove the corresponding traverse from the traversesFromDb store
      dispatch(deleteTraversesFromDbByUuid(thisEvasTraversesFromDb.map((t) => t.uuid)));
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
    dispatch(deleteTraversesByUuid(thisEvasTraverses.map((t) => t.uuid)));
  }

  // delete the eva from the DB or the store
  // if the selected eva is in evasFromDb then delete it from the db
  const evaFromDb = getState().eva.evasFromDb.find((evaFromDb) => evaFromDb.uuid === eva.uuid);
  if (evaFromDb) {
    // delete the Eva from the DB via internal API call
    const deleteResponse: WrappedResponse<number[]> = await httpClient_Eva.deleteEvas(
      [eva.uuid],
      rexRunning
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
  dispatch(
    setExpandedEvaUuids(getState().eva.expandedEvaUuids.filter((uuid) => uuid !== eva.uuid))
  );
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
      traverseRate: getState().mission.mission.traverseRate,
      maxDuration: getState().mission.mission.defaultEvaDuration,
      egressDuration: 10,
      ingressDuration: 10,
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
      updatedAt: null,
    };

    //create an empty traverse
    const newTraverse: Traverse = makeNewTraverse(blankEva.missionId);
    dispatch(upsertTraverse(newTraverse));

    //add the traverse to the sequence
    blankEva.sequence.push({
      type: "traverse",
      uuid: newTraverse.uuid,
    });

    //save the new eva
    dispatch(saveNewEva(blankEva));

    //full update the traverse to get the path
    await dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: newTraverse.uuid,
        rename: true,
        evaSequence: blankEva.sequence,
      })
    );

    dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
  }
);

export const thunkDuplicateEva = appCreateAsyncThunk<{
  eva: Eva;
  includeStations: boolean;
}>("evaDuplicate", async ({ eva, includeStations }, { dispatch, getState }) => {
  if (!eva) return;
  //make a copy of the eva
  const newEva: Eva = _.cloneDeep(eva);
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
      const newStationRes = (await dispatch(thunkDuplicateStation({ station }))).payload;
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
    const newTraverse: Traverse = _.cloneDeep(traverse);
    newTraverse.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newTraverse.updatedAt = null;
    newTraverse.uuid = newTraverseUuid;

    let nameBefore: string;
    let nameAfter: string;

    // if no station before, station before name is "Lander"
    if (sequenceIndex === 0) {
      nameBefore = "Lander";
    } else {
      nameBefore = getState().station.stations.find(
        (s) => s.uuid === newEva.sequence[sequenceIndex - 1].uuid
      )?.name;
    }
    // if no station after, station after name is "Lander"
    if (sequenceIndex === newEva.sequence.length - 1) {
      nameAfter = "Lander";
    } else {
      nameAfter = getState().station.stations.find(
        (s) => s.uuid === newEva.sequence[sequenceIndex + 1].uuid
      )?.name;
    }

    newTraverse.name = `${nameBefore} to ${nameAfter}`;
    dispatch(upsertTraverse(newTraverse));
    dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: true }));
  }

  //new eva is ready to be duplicated in the store.
  dispatch(saveNewEva(newEva));
});

const makeNewTraverse = (missionId: number): Traverse => {
  const newTraverse: Traverse = {
    missionId: missionId,
    uuid: uuidv4(),
    name: "",
    description: "",
    predictedDurationLower: null,
    predictedDurationUpper: null,
    path: [],
    pathSegmentDistances: null,
    pathSegmentElevations: null,
    status: null,
    rexStatus: null,
    updatedAt: null,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  return newTraverse;
};

export const thunkAddStationToEva = appCreateAsyncThunk<{ evaUuid: string }>(
  "evaAddStation",
  async ({ evaUuid }, { dispatch, getState }) => {
    const eva = getState().eva.evas.find((eva) => eva.uuid === evaUuid);
    const newEvaSequence = _.cloneDeep(eva.sequence);

    const newStationSequenceItem: EvaSequenceItem = {
      type: "station",
      uuid: "",
    };
    if (newEvaSequence.length === 0) {
      // add traverse for "from lander"
      const newTraverse = makeNewTraverse(eva.missionId);
      dispatch(upsertTraverse(newTraverse));
      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse.uuid,
      });

      // add new station sequence item
      newEvaSequence.push(newStationSequenceItem);

      // add traverse for "to lander"
      const newTraverse2 = makeNewTraverse(eva.missionId);
      dispatch(upsertTraverse(newTraverse2));
      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse2.uuid,
      });
    } else {
      // add a traverse before the station
      const newTraverse = makeNewTraverse(eva.missionId);
      dispatch(upsertTraverse(newTraverse));

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
  const newEvaSequence = _.cloneDeep(evaSequence);
  let traverseUuidToUpdate: string = null;
  // if this is the first station in the EVA, delete the traverse before it otherwise delete the traverse after it
  if (sequenceIndex === 1) {
    // set the traverse after the station to be updated
    traverseUuidToUpdate = newEvaSequence[sequenceIndex + 1].uuid;
    // delete the traverse record before the station
    dispatch(deleteTraverseByUuid(newEvaSequence[sequenceIndex - 1].uuid));
    // remove the traverse before the station and the station from the newEvaSequence
    newEvaSequence.splice(sequenceIndex - 1, 2);
  } else {
    // set the traverse before the station to be updated
    traverseUuidToUpdate = newEvaSequence[sequenceIndex - 1].uuid;
    // delete the traverse record after the station
    dispatch(deleteTraverseByUuid(newEvaSequence[sequenceIndex + 1].uuid));
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

/**
 * Check all EVA sequences to make sure a traverse "from lander" is at the beginning and "to lander" is at the end
 * Create any missing traverses as needed and add them to the sequence
 * Check all evas to make sure they have a default egress and ingress duration of 10 minutes
 */
export const thunkAuditEvas = appCreateAsyncThunk<void>(
  "auditEvas",
  async (__, { dispatch, getState }) => {
    const evas = getState().eva.evas;
    for (const eva of evas) {
      const newEvaSequence = _.cloneDeep(eva.sequence);

      let egressLocationUuid = eva.egressLocationUuid;
      let egressDuration = eva.egressDuration;
      let ingressLocationUuid = eva.ingressLocationUuid;
      let ingressDuration = eva.ingressDuration;

      // if this eva has no sequence, add a traverse "from lander" and "to lander"
      if (newEvaSequence.length === 0) {
        const newTraverse = makeNewTraverse(eva.missionId);
        dispatch(upsertTraverse(newTraverse));

        newEvaSequence.push({
          type: "traverse",
          uuid: newTraverse.uuid,
        });

        // set the egressLocationUuid to "lander" and the ingressLocationUuid to "lander"
        egressLocationUuid = "lander";
        ingressLocationUuid = "lander";
      } else {
        // check if there isn't a traverse at the beginning of the sequence
        if (newEvaSequence[0].type !== "traverse") {
          // This EVA hasn't been converted yet

          // Get the first station in the sequence
          const firstStation = getState().station.stations.find(
            (station) => station.uuid === newEvaSequence[0].uuid
          );
          // If the first station's name is "Egress" then set the egressLocationUuid to "lander"
          if (firstStation.name === "Egress") {
            egressLocationUuid = "lander";
          } else {
            // otherwise set the egressLocationUuid to the first station
            egressLocationUuid = firstStation.uuid;
          }
          //set duration
          egressDuration = getTotalDwellTimeUpper(
            getState().action.actions.filter((a) => a.stationUuid === firstStation.uuid)
          );

          // delete the first station from the sequence
          newEvaSequence.splice(0, 1);
        }

        // check if there isn't a traverse at the end of the sequence
        if (newEvaSequence[newEvaSequence.length - 1]?.type !== "traverse") {
          // This EVA hasn't been converted yet

          // Get the last station in the sequence
          const lastStation = getState().station.stations.find(
            (station) => station.uuid === newEvaSequence[newEvaSequence.length - 1].uuid
          );
          // If the last station's name is "Ingress" then set the ingressLocationUuid to "lander"

          if (lastStation.name === "Ingress") {
            ingressLocationUuid = "lander";
          } else {
            // otherwise set the ingressLocationUuid to the last station
            ingressLocationUuid = lastStation.uuid;
          }
          //set duration
          ingressDuration = getTotalDwellTimeUpper(
            getState().action.actions.filter((a) => a.stationUuid === lastStation.uuid)
          );

          // delete the last station from the sequence
          newEvaSequence.splice(newEvaSequence.length - 1, 1);
        }
      }

      const newEva: Eva = {
        ...eva,
        sequence: newEvaSequence,
        egressDuration,
        ingressDuration,
        egressLocationUuid,
        ingressLocationUuid,
      };

      if (!_.isEqual(eva, newEva)) {
        dispatch(upsertEva(newEva));
        await dispatch(thunkSaveEva({ eva: newEva }));

        // get first and last traverses in this EVA
        const firstLastTraverseUuidsInThisEva: string[] = [];
        firstLastTraverseUuidsInThisEva.push(newEva.sequence[0].uuid);
        firstLastTraverseUuidsInThisEva.push(newEva.sequence[newEva.sequence.length - 1].uuid);

        // full update the first and last traverses in this EVA
        for (const traverseUuid of firstLastTraverseUuidsInThisEva) {
          await dispatch(
            thunkFullUpdateTraverse({
              traverseUuid,
              evaSequence: newEvaSequence,
              rename: true,
              saveToDb: true,
            })
          );
        }
      }
    }
  }
);

// calculates total dwell time for an array of actions. used to determine station dwell time in thunkAduitEvas
const getTotalDwellTimeUpper = (actions: Action[]): number => {
  let ev1Time = 0;
  let ev2Time = 0;
  actions.forEach((action) => {
    if (action.crewAssigned?.includes("EV1")) {
      ev1Time += action.durationUpper;
    }
    if (action.crewAssigned?.includes("EV2")) {
      ev2Time += action.durationUpper;
    }
  });
  return ev1Time > ev2Time ? ev1Time : ev2Time;
};
