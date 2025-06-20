import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Rex_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank rex
 * @param partialRex any fields that are to be overriden from default
 * @returns the generated rex
 */
export const generateBlankRex = (partialRex?: Partial<Rex> & { evaUuid: string }): Rex => {
  // default crew position item types
  const posTypeEv1: PosType = {
    uuid: uuidv4(),
    abbr: "1",
    name: "EV1",
    icon: "1f468-200d-1f680", //crew
    pathColor: "#ff0000",
  };

  const posTypeEv2: PosType = {
    uuid: uuidv4(),
    abbr: "2",
    name: "EV2",
    icon: "1f469-200d-1f680", //crew
    pathColor: "#ffffff",
  };

  const posTypeCart: PosType = {
    uuid: uuidv4(),
    abbr: "C",
    name: "Cart",
    icon: "1f6d2", //shopping cart
    pathColor: "#AAAAAA",
  };

  const posSourceCrew: PosSource = {
    uuid: uuidv4(),
    name: "Crew",
    abbr: "C",
  };

  const posSourceTask: PosSource = {
    uuid: uuidv4(),
    name: "Task",
    abbr: "T",
  };

  const posSourceScience: PosSource = {
    uuid: uuidv4(),
    name: "SER",
    abbr: "S",
  };

  const defaultNewRex: Rex = {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    name: "",
    description: "",
    petStartStopTimestamp: null,
    petValueAtStartStop: "+00:00:00",
    petRunning: false,
    evaUuid: partialRex.evaUuid,
    isRunning: false,
    posEntries: null,
    posTypes: [posTypeEv1, posTypeEv2, posTypeCart],
    posSources: [posSourceCrew, posSourceTask, posSourceScience],
    stationEntries: null,
    traverseEntries: null,
    xgressEntries: null,
    actionEntries: null,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  return { ...defaultNewRex, ...partialRex };
};

export const generateBlankPosType = (partialPosType?: Partial<PosType>): PosType => {
  const defaultNewPosType: PosType = {
    uuid: uuidv4(),
    abbr: "",
    name: "",
    icon: "",
    pathColor: "",
  };
  return { ...defaultNewPosType, ...partialPosType };
};

export const generateBlankPosEntry = (partialPosEntry?: Partial<PosEntry>): PosEntry => {
  const defaultNewPosEntry: PosEntry = {
    uuid: uuidv4(),
    location: null,
    elevation: null,
    petSeconds: 0,
    posTypeUuids: [],
    posSourceUuid: null,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  return { ...defaultNewPosEntry, ...partialPosEntry };
};
/**
 * Converts db rex fks to their uuid/id arrays
 * @param dbRexs an array of rexs in mikro db format
 * @returns an a converted array of rexs or a single rex
 */
export function convertRexesTypeDbToStore(dbRexs: Rex_db[]): Rex[] {
  const rexs: Rex[] = [];
  for (const dbRex of dbRexs) {
    const convertedRex: Rex = {
      uuid: dbRex.uuid,
      ownerId: dbRex.ownerId,
      missionId: dbRex.mission.id,
      name: dbRex.name,
      description: dbRex.description,
      petStartStopTimestamp: dbRex.petStartStopTimestamp,
      petValueAtStartStop: dbRex.petValueAtStartStop,
      petRunning: dbRex.petRunning,
      evaUuid: dbRex.evaUuid,
      isRunning: dbRex.isRunning,
      posEntries: dbRex.posEntries,
      posTypes: dbRex.posTypes,
      posSources: dbRex.posSources,
      stationEntries: dbRex.stationEntries,
      traverseEntries: dbRex.traverseEntries,
      actionEntries: dbRex.actionEntries,
      xgressEntries: dbRex.xgressEntries,
      updatedAt: dbRex.createdAt.toISOString(),
      createdAt: dbRex.updatedAt.toISOString(),
    };
    rexs.push(convertedRex);
  }
  return rexs;
}

/**
 * Converts rexs that come from the store into the db type
 * @param storeRexs
 * @returns
 */
export function convertRexesTypeStoreToDb(storeRexs: Rex[]): EntityData<Rex_db>[] {
  const dbRexs: EntityData<Rex_db>[] = [];
  for (const storeRex of storeRexs) {
    const convertedRecord: EntityData<Rex_db> = {
      mission: storeRex.missionId,
      uuid: storeRex.uuid,
      ownerId: storeRex.ownerId,
      name: storeRex.name,
      description: storeRex.description,
      petStartStopTimestamp: storeRex.petStartStopTimestamp,
      petValueAtStartStop: storeRex.petValueAtStartStop,
      petRunning: storeRex.petRunning,
      evaUuid: storeRex.evaUuid,
      isRunning: storeRex.isRunning,
      posEntries: storeRex.posEntries,
      posTypes: storeRex.posTypes,
      posSources: storeRex.posSources,
      stationEntries: storeRex.stationEntries,
      traverseEntries: storeRex.traverseEntries,
      actionEntries: storeRex.actionEntries,
      xgressEntries: storeRex.xgressEntries,
      updatedAt: new Date(storeRex.updatedAt),
      createdAt: new Date(storeRex.createdAt),
    };
    dbRexs.push(convertedRecord);
  }
  return dbRexs;
}
