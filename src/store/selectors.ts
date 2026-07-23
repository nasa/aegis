import sortBy from "lodash/sortBy";
import concat from "lodash/concat";
import type { RootState } from "store";

/**
 * Gets all Stations for an EVA.
 * Also includes ingress and egress stations if they are not "lander"
 */
export const selectEvaStations = (mission: Mission, evaUuid: string): Station[] => {
  const allStations = mission?.stations ?? {};
  const evaStations: Station[] = [];
  const eva = mission?.evas?.[evaUuid];
  if (!eva) return [];
  if (eva.sequence) {
    const sequenceStations = eva.sequence
      .filter((seqItem) => seqItem.type === "station" && seqItem.uuid)
      .map((stationSeqItem) => allStations[stationSeqItem.uuid])
      .filter(Boolean) as Station[];
    evaStations.push(...sequenceStations);
  }
  if (eva.ingressLocationUuid !== "lander") {
    const ingressStation = allStations[eva.ingressLocationUuid];
    if (ingressStation) evaStations.push(ingressStation);
  }
  if (eva.egressLocationUuid !== "lander") {
    const egressStation = allStations[eva.egressLocationUuid];
    if (egressStation) evaStations.push(egressStation);
  }
  return evaStations;
};

/**
 * Gets all Traverses for an EVA.
 */
export const selectEvaTraverses = (mission: Mission, evaUuid: string): Traverse[] => {
  const allTraverses = mission?.traverses ?? {};
  const eva = mission?.evas?.[evaUuid];
  if (!eva?.sequence) return [];

  const traverseSeqItems = eva.sequence.filter((seqItem) => seqItem.type === "traverse");
  const traverses = traverseSeqItems
    .map((traverseSeqItem) => allTraverses[traverseSeqItem.uuid])
    .filter(Boolean) as Traverse[];

  return traverses;
};

/**
 * Gets all Actions for an EVA.
 * Accepts an actions record and eva from automerge as parameters.
 */
export const selectEvaActions = (
  allActionRecords: Record<string, Action>,
  eva: Eva | null | undefined
): Action[] => {
  if (!eva?.sequence) return [];

  const stationSeqItems = eva.sequence.filter((seqItem) => seqItem.type === "station");
  const actionArrays = stationSeqItems.map((stationSeqItem) =>
    Object.values(allActionRecords).filter((a) => a.stationUuid === stationSeqItem.uuid)
  );
  return actionArrays.flat();
};

/**
 * Gets all stations that are not in a REX EVA or ingress/egress locations and returns them sorted by name.
 */
export const selectAsPlannedStations = (mission: Mission): Station[] => {
  const allRexEvaUuids = Object.values(mission?.rexes ?? {}).map((rex) => rex.evaUuid);
  const allEvas = Object.values(mission?.evas ?? {});

  const allRexEvaStationUuids = allEvas
    .filter((e) => allRexEvaUuids.includes(e.uuid))
    .flatMap((eva) => eva.sequence?.filter((seq) => seq.type === "station").map((seq) => seq.uuid));
  const allIngressEgressStationUuids = allEvas
    .filter((e) => allRexEvaUuids.includes(e.uuid))
    .flatMap((eva) => {
      const xgressStationUuids = [];
      if (eva.ingressLocationUuid !== "lander") xgressStationUuids.push(eva.ingressLocationUuid);
      if (eva.egressLocationUuid !== "lander") xgressStationUuids.push(eva.egressLocationUuid);
      return xgressStationUuids;
    });
  // Combine all uuids get stations that we need to filter out
  const allStationUuids = concat(allRexEvaStationUuids, allIngressEgressStationUuids);
  const stationList = Object.values(mission?.stations ?? {}).filter(
    (station) => !allStationUuids.includes(station.uuid)
  );
  return sortBy(stationList, (station) => station.name.toLowerCase());
};

/**
 * This selector takes maestroActivityPropertiesByRefUuid that are keyed by station/traverse
 * refUuids and returns a new object where the keys are regular UUIDs.
 */
export const selectConvertMaestroActivityPropertiesByRefUuidToUuid = (
  mission: Mission,
  {
    maestroActivityPropertiesByRefUuid,
    rexUuid,
  }: {
    maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid;
    rexUuid: string | null;
  }
): MaestroActivityProperties => {
  if (!maestroActivityPropertiesByRefUuid) return {};
  // Loop through the maestroActivityProperty keys which are refUuids for stations and traverses,
  // and create an object that keys to the uuids
  const activityProperties: MaestroActivityProperties = {};
  for (const [key, value] of Object.entries(maestroActivityPropertiesByRefUuid)) {
    const uuid = getSequenceUuidByRefUuidAndRexUuid(mission, {
      refUuid: key,
      rexUuid,
    });
    if (uuid) {
      activityProperties[uuid] = { ...value };
    }
  }

  // Handle xgress entries
  for (const [key, value] of Object.entries(maestroActivityPropertiesByRefUuid)) {
    if (key.endsWith("gress")) {
      activityProperties[key] = { ...value };
    }
  }

  // Return the new object with uuid keys
  return activityProperties;
};

/**
 * Get sequence item (station or traverse) from a refUuid and rexUuid
 * Returns the UUID of the sequence item or undefined if not found
 * If rexUuid is null, returns the as-planned sequence uuid
 */
export const getSequenceUuidByRefUuidAndRexUuid = (
  mission: Mission,
  { refUuid, rexUuid }: { refUuid: string | null; rexUuid: string | null }
): string | undefined => {
  const matchesRefUuid = (seq: EvaSequenceItem): boolean => {
    if (seq.type === "station") return mission.stations[seq.uuid]?.refUuid === refUuid;
    if (seq.type === "traverse") return mission.traverses[seq.uuid]?.refUuid === refUuid;
    return false;
  };

  if (rexUuid === null) {
    // Use all as-planned EVAs (not referenced by any REX)
    // Use a Set for O(1) rex EVA uuid lookups instead of O(n) array.includes
    const rexEvaUuidSet = new Set(Object.values(mission?.rexes ?? {}).map((rex) => rex.evaUuid));
    for (const eva of Object.values(mission?.evas ?? {})) {
      if (rexEvaUuidSet.has(eva.uuid)) continue;
      // Iterate each EVA's sequence directly to short-circuit as soon as a match is found,
      // avoiding the cost of flatMap materializing the full combined sequence array upfront
      const match = eva.sequence?.find(matchesRefUuid);
      if (match) return match.uuid;
    }
    return undefined;
  } else {
    const evaUuid = mission.rexes[rexUuid]?.evaUuid;
    const sequence = mission.evas[evaUuid]?.sequence ?? [];
    return sequence.find(matchesRefUuid)?.uuid;
  }
};

/** Returns the as planned eva given an eva refUuid */
export const getAsPlannedEvaFromRefUuid = (mission: Mission, refUuid: string): Eva | undefined => {
  if (!refUuid) return undefined;
  const allRexEvasUuids = Object.values(mission?.rexes ?? {}).map((rex) => rex.evaUuid);
  const asPlannedEva = Object.values(mission?.evas ?? {}).find(
    (eva) => !allRexEvasUuids.includes(eva.uuid) && eva.refUuid === refUuid
  );
  if (!asPlannedEva) return undefined;
  return asPlannedEva;
};

/**
 * Only returns true if all connections (browser internet, and socket) are connected
 */
export const isConnected = (state: RootState): boolean => {
  return (
    state.connection.browserConnectionStatus === "connected" &&
    state.connection.socketStatus.connectionStatus === "connected"
  );
};

/**
 * Returns highlight flags for a list of action uuids, based on STM priority membership.
 * Pure derivation from action data — accepts an actions record as a parameter.
 */
export function getHighlightedActions({
  actionUuids,
  stmUuid,
  actions,
}: {
  actionUuids: string[];
  stmUuid: string;
  actions: Record<string, Action>;
}): ActionHighlight[] {
  const matchingActions = Object.values(actions).filter((a) => actionUuids.includes(a.uuid));
  const actionHighlights: ActionHighlight[] = [];
  for (const action of matchingActions) {
    const highlight: ActionHighlight = { uuid: action.uuid, highlight: false };
    if (action.stmPriorities && stmUuid) {
      for (const actionSTMUuid of Object.keys(action.stmPriorities)) {
        if (actionSTMUuid === stmUuid) {
          highlight.highlight = true;
        }
      }
    }
    actionHighlights.push(highlight);
  }
  return actionHighlights;
}

/**
 * Resolve the display label for an action-definition category. Every mission stores a fully
 * populated `actionDefinitionLabels` (see generateBlankMission + the Automerge migration), so
 * this reads it directly; the default is only used when a mission snapshot is unavailable.
 * @param type the plural ActionDefinitionType ("verbs" | "nouns" | "adjectives")
 * @param form "singular" (used in the action sentence) or "plural" (used in headings/menus)
 */
export const getActionDefinitionLabel = (
  mission: Pick<Mission, "actionDefinitionLabels">,
  type: ActionDefinitionType,
  form: "singular" | "plural" = "singular"
): string => {
  const key = type.slice(0, -1) as "verb" | "noun" | "adjective";
  const labels = mission.actionDefinitionLabels;
  return labels[key][form];
};
