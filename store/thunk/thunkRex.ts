import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import {
  getAccurateNow,
  roundDateToSecond,
  secondsFromhhmmss,
  calculatePetValue,
} from "utils/formatting";
import {
  deleteRexByUuid,
  deleteRexFromDbByUuid,
  setRexEditMode,
  upsertRex,
  upsertRexFromDb,
  deleteCrewPosByUuid,
  setCrewPosEditingUuid,
  upsertCrewPos,
  setRexesCrewPosEditMode,
  setSelectedRexUuid,
} from "store/rex";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import _ from "lodash";
import * as httpClient_Rex from "http-client/rex";
import { saveNewRex } from "store/cross-slice";
import { upsertToArrayByUuid } from "utils/store";
import { updateMapDirective } from "store/map";
import { thunkLogRexFull } from "./thunkLog";

export const thunkCreateRex = appCreateAsyncThunk<void>(
  "rexCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().rex.rexes.map((rex) => rex.name),
    });

    const blankRex: Rex = {
      missionId: getState().mission.mission.id,
      uuid: uuidv4(),
      name: "REX Event " + randomName,
      description: "",
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      selectedRexEvaUuid: null,
      rexRunning: false,
      crewPos: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
      updatedAt: null,
    };
    dispatch(saveNewRex(blankRex));
  }
);

export const thunkDuplicateRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDuplicate",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;

    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

    //make a copy of the rex
    const newRex: Rex = _.cloneDeep(rex);
    newRex.uuid = uuidv4();
    newRex.updatedAt = null;
    newRex.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newRex.name = makeUniqueStringCopy(
      rex.name,
      getState().rex.rexes.map((rex) => rex.name)
    );

    //new eva is ready to be duplicated in the store.
    dispatch(upsertRex(newRex));
  }
);

export const thunkSaveRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexSave",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;

    const rexToSave = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
    const upsertReponse = await httpClient_Rex.upsertRex(rexToSave, rexToSave.rexRunning);
    if (upsertReponse.status === "success") {
      // upsert the changed rex to the store
      dispatch(upsertRex(upsertReponse.data));
      // update the rex in the store from the DB
      dispatch(upsertRexFromDb(upsertReponse.data));
      // take the rex out of edit mode
      dispatch(setRexEditMode({ rexUuid, editMode: false }));
    } else {
      throw new Error("Error upserting Rexes: " + upsertReponse.message);
    }

    // log an export of a full copy of this rex and associated eva to the log db table for posterity
    dispatch(thunkLogRexFull({ rexUuid, directive: rexToSave.rexRunning ? "start" : "stop" }));

    // clear running state and stop the clocks of all other rexes in the db
    getState().rex.rexesFromDb.forEach(async (rex) => {
      //skip if this rex is the one being saved or if it isn't running
      if (rex.uuid === rexUuid || !rex.rexRunning) return;

      //set the rex to not running and stop the PET timer
      const rexCopy = _.cloneDeep(rex);
      rexCopy.petRunning = false;
      rexCopy.petValueAtStartStop = calculatePetValue(rexCopy);
      rexCopy.petStartStopTimestamp = roundDateToSecond(getAccurateNow()).toISOString();
      rexCopy.updatedAt = roundDateToSecond(getAccurateNow()).toISOString();

      const upsertReponse = await httpClient_Rex.upsertRex(rexCopy, rex.rexRunning);
      if (upsertReponse.status === "success") {
        // update the rex in the store from the DB
        dispatch(upsertRexFromDb(upsertReponse.data));
      } else {
        throw new Error("Error upserting Rexes: " + upsertReponse.message);
      }
    });
  }
);

export const thunkCancelRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexCancel",
  async ({ rexUuid }, { dispatch, getState }) => {
    const rexFromDb = getState().rex.rexesFromDb.find((rexDb) => rexDb.uuid === rexUuid);

    // if selected rex isn't in the db, delete it from the store
    if (!rexFromDb) {
      dispatch(deleteRexByUuid(rexUuid));
    } else {
      // if selected rex is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertRex(rexFromDb, true));
    }
    // take the rex out of edit mode
    dispatch(setRexEditMode({ rexUuid, editMode: false }));
  }
);

export const thunkDeleteRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDelete",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;
    //rex active?
    const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

    // delete the rex from the store
    dispatch(deleteRexByUuid(rexUuid));
    dispatch(deleteRexFromDbByUuid(rexUuid));

    // delete the rex from the db
    httpClient_Rex.deleteRex(rexUuid, rexRunning);

    // take the rex out of edit mode
    dispatch(setRexEditMode({ rexUuid, editMode: false }));
    dispatch(setSelectedRexUuid(null));
  }
);

export const thunkSelectRexEva = appCreateAsyncThunk<{
  rexUuid: string;
  evaUuid: string;
}>("rexSelectEva", async ({ rexUuid, evaUuid }, { dispatch, getState }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
  // any rex running?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;
  dispatch(upsertRex({ ...rex, selectedRexEvaUuid: evaUuid }, true));
  // persist the change to rex in the db
  httpClient_Rex.upsertRex({ ...rex, selectedRexEvaUuid: evaUuid }, rexRunning);
});

export const thunkRexPetStartStop = appCreateAsyncThunk<{
  rexUuid: string;
  directive: "start" | "stop";
  petValue: string;
}>("rexPetTimerStartStop", async ({ rexUuid, directive, petValue }, { getState, dispatch }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

  dispatch(
    upsertRex({
      ...rex,
      petRunning: directive === "start",
      petValueAtStartStop: petValue,
      petStartStopTimestamp: roundDateToSecond(getAccurateNow()).toISOString(),
    })
  );
});

/**
 * Update the crew position location and then save to db
 */
export const thunkUpdateCrewPosLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  crewPosUuid: string;
}>("updateCrewPosLoc", async ({ location, crewPosUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexCrewPos: CrewPos[] = _.cloneDeep(selectedRex.crewPos);
  const oldCrewPos = selectedRex.crewPos.find((c) => c.uuid === crewPosUuid);
  // any rex running?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  upsertToArrayByUuid(newRexCrewPos, { ...oldCrewPos, location });

  //automatically save to the db.
  const rexUpsertResponse = await httpClient_Rex.upsertRex(
    {
      ...selectedRex,
      crewPos: newRexCrewPos,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
    rexRunning
  );

  if (rexUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(rexUpsertResponse.data, true));
    dispatch(upsertRexFromDb(rexUpsertResponse.data));
    dispatch(setCrewPosEditingUuid(null));
  } else {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
  dispatch(setRexesCrewPosEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

/**
 * Cancel the crew position location
 */
export const thunkCancelCrewPosLocation = appCreateAsyncThunk<{
  crewPosEditingUuid: string;
}>("cancelCrewPosLoc", async ({ crewPosEditingUuid }, { dispatch, getState }) => {
  const allCrewPos = getState().rex.rexes.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  )?.crewPos;
  const crewPos = allCrewPos.find((c) => c.uuid === crewPosEditingUuid);
  if (!crewPos.location) {
    //no location means this is a newly created crew pos. delete the uuid currently being edited
    dispatch(
      deleteCrewPosByUuid({
        rexUuid: getState().rex.selectedRexUuid,
        crewPosUuid: crewPosEditingUuid,
      })
    );
    dispatch(
      updateMapDirective({
        mapItemType: "crewPos",
        uuid: crewPosEditingUuid,
        mapAction: "cancelCreateMarker",
      })
    );
    dispatch(setRexesCrewPosEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
    dispatch(setCrewPosEditingUuid(null));
  } else {
    dispatch(
      updateMapDirective({
        mapItemType: "crewPos",
        uuid: crewPosEditingUuid,
        mapAction: "cancelEditMarker",
      })
    );
  }
});

export const thunkSaveCrewPosition = appCreateAsyncThunk<{
  crewPos: CrewPos;
}>("saveCrewPos", async ({ crewPos }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexCrewPos: CrewPos[] = _.cloneDeep(selectedRex.crewPos);
  upsertToArrayByUuid(newRexCrewPos, { ...crewPos });

  //automatically save to the db.
  //check rex is running for logging
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;
  const rexUpsertResponse = await httpClient_Rex.upsertRex(
    {
      ...selectedRex,
      crewPos: newRexCrewPos,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
    isRexRunning
  );

  if (rexUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(rexUpsertResponse.data, true));
    dispatch(upsertRexFromDb(rexUpsertResponse.data));
    dispatch(setCrewPosEditingUuid(null));
  } else {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
  dispatch(setRexesCrewPosEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

/**
 * Create an new crew position for an rex but do not save to the db. keep in store only
 * Returns uuid of new crew pos
 */
export const thunkCreateCrewPos = appCreateAsyncThunk<
  {
    crew: RexCrewType[];
  },
  string,
  false
>("createCrewPos", async ({ crew }, { dispatch, getState }) => {
  const uuid = uuidv4();
  const runningRex = getState().rex.rexes.find((r) => r.rexRunning);
  const seconds = secondsFromhhmmss(
    runningRex.petRunning ? calculatePetValue(runningRex) : runningRex.petValueAtStartStop
  );
  const newCrewPos: CrewPos = {
    uuid: uuid,
    location: null,
    elevation: null,
    seconds: seconds,
    crew: crew,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  dispatch(upsertCrewPos({ rexUuid: getState().rex.selectedRexUuid, crewPos: newCrewPos }));
  dispatch(setCrewPosEditingUuid(uuid));
  dispatch(setRexesCrewPosEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: true }));
  return uuid;
});

/**
 * Cancel editing an exsiting crew position
 */
export const thunkCancelCrewPos = appCreateAsyncThunk<{
  crewPosUuid: string;
}>("cancelCrewPos", async ({ crewPosUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const allCrewPosFromDb = getState().rex.rexesFromDb.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  ).crewPos;
  const allCrewPos = getState().rex.rexes.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  ).crewPos;
  const crewPosFromDb = allCrewPosFromDb?.find((c) => c.uuid === crewPosUuid);
  let newAllCrewPos = _.cloneDeep(allCrewPos);

  //cancel out map action if they were in the middle of one for this
  if (getState().map.mapDirective?.uuid === crewPosUuid) {
    dispatch(
      updateMapDirective({
        mapItemType: "crewPos",
        uuid: crewPosUuid,
        mapAction: "cancelEditMarker",
      })
    );
  }

  //Replace only this crew pos with the version from the db
  if (crewPosFromDb) {
    upsertToArrayByUuid(newAllCrewPos, crewPosFromDb);
  } else {
    //this crew pos was never saved. Delete it from the store
    newAllCrewPos = newAllCrewPos.filter((c) => c.uuid !== crewPosUuid);
  }

  //automatically save to the db.
  //check rex is running for logging
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;
  const evaUpsertResponse = await httpClient_Rex.upsertRex(
    {
      ...selectedRex,
      crewPos: newAllCrewPos,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
    isRexRunning
  );

  if (evaUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(evaUpsertResponse.data, true));
    dispatch(upsertRexFromDb(evaUpsertResponse.data));
    dispatch(setCrewPosEditingUuid(null));
  } else {
    throw new Error("Error upserting Rex: " + evaUpsertResponse.message);
  }
  dispatch(setRexesCrewPosEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

/**
 * Delete a crew position for an rex and save to db
 */
export const thunkDeleteCrewPosByUuid = appCreateAsyncThunk<{
  crewPosUuid: string;
}>("deleteCrewPos", async ({ crewPosUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexCrewPos: CrewPos[] = _.cloneDeep(selectedRex.crewPos).filter(
    (c) => c.uuid !== crewPosUuid
  );
  // any rex running?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  //automatically save to the db.
  const evaUpsertResponse = await httpClient_Rex.upsertRex(
    {
      ...selectedRex,
      crewPos: newRexCrewPos,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
    rexRunning
  );

  if (evaUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(evaUpsertResponse.data, true));
    dispatch(upsertRexFromDb(evaUpsertResponse.data));
  } else {
    throw new Error("Error upserting Rex: " + evaUpsertResponse.message);
  }
});
