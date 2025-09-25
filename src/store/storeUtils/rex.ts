import type { EntityData } from "@mikro-orm/postgresql";
import type { Rex_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank rex
 * @param partialRex any fields that are to be overridden from default
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
    maestroControlled: false,
    maestroEventId: null,
    maestroEventUrl: null,
    maestroActivityPropertiesByRefUuid: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
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
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
  return { ...defaultNewPosEntry, ...partialPosEntry };
};
/**
 * Converts db rex fks to their uuid/id arrays
 * @param dbRexes an array of rexes in mikro db format
 * @returns an a converted array of rexes or a single rex
 */
export function convertRexesTypeDbToStore(dbRexes: Rex_db[]): Rex[] {
  const rexes: Rex[] = [];
  for (const dbRex of dbRexes) {
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
      maestroControlled: dbRex.maestroControlled,
      maestroEventId: dbRex.maestroEventId,
      maestroEventUrl: dbRex.maestroEventUrl,
      maestroActivityPropertiesByRefUuid: dbRex.maestroActivityPropertiesByRefUuid,
      updatedAt: dbRex.updatedAt.toISOString(),
      createdAt: dbRex.createdAt.toISOString(),
    };
    rexes.push(convertedRex);
  }
  return rexes;
}

/**
 * Converts rexes that come from the store into the db type
 * @param storeRexes
 * @returns
 */
export function convertRexesTypeStoreToDb(storeRexes: Rex[]): EntityData<Rex_db>[] {
  const dbRexes: EntityData<Rex_db>[] = [];
  for (const storeRex of storeRexes) {
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
      maestroControlled: storeRex.maestroControlled,
      maestroEventId: storeRex.maestroEventId,
      maestroEventUrl: storeRex.maestroEventUrl,
      maestroActivityPropertiesByRefUuid: storeRex.maestroActivityPropertiesByRefUuid,
      updatedAt: new Date(storeRex.updatedAt),
      createdAt: new Date(storeRex.createdAt),
    };
    dbRexes.push(convertedRecord);
  }
  return dbRexes;
}
