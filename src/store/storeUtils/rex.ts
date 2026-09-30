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
    ownerId: 0,
    missionId: 0,
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
    actionEntries: null,
    maestroControlled: false,
    maestroEventId: null,
    maestroEventUrl: null,
    maestroActivityPropertiesByRefUuid: null,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
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
    posSourceUuid: "",
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewPosEntry, ...partialPosEntry };
};
