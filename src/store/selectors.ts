import sortBy from "lodash/sortBy";
import type { RootState } from "store";
import { getSequenceStationUuids, getSequenceTraverseUuids } from "operations/helpers/evaSequence";

/**
 * Gets all Stations for an EVA, including the egress and ingress stations.
 */
export const selectEvaStations = (mission: Mission, evaUuid: string): Station[] => {
  const allStations = mission?.stations ?? {};
  const eva = mission?.evas?.[evaUuid];
  if (!eva) return [];
  return getSequenceStationUuids(eva.sequence)
    .map((stationUuid) => allStations[stationUuid])
    .filter(Boolean) as Station[];
};

/**
 * Gets all Traverses for an EVA.
 */
export const selectEvaTraverses = (mission: Mission, evaUuid: string): Traverse[] => {
  const allTraverses = mission?.traverses ?? {};
  const eva = mission?.evas?.[evaUuid];
  if (!eva?.sequence) return [];

  const traverses = getSequenceTraverseUuids(eva.sequence)
    .map((traverseUuid) => allTraverses[traverseUuid])
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

  const actionArrays = getSequenceStationUuids(eva.sequence).map((stationUuid) =>
    Object.values(allActionRecords).filter((a) => a.stationUuid === stationUuid)
  );
  return actionArrays.flat();
};

/**
 * Gets all stations available for planning, sorted by name.
 *
 * Excludes stations in a REX EVA the lander copy xgress stations.
 */
export const selectAsPlannedStations = (mission: Mission): Station[] => {
  const allRexEvaUuids = Object.values(mission?.rexes ?? {}).map((rex) => rex.evaUuid);
  const allEvas = Object.values(mission?.evas ?? {});

  const allRexEvaStationUuids = allEvas
    .filter((e) => allRexEvaUuids.includes(e.uuid))
    .flatMap((eva) => getSequenceStationUuids(eva.sequence));

  const stationList = Object.values(mission?.stations ?? {}).filter(
    (station) => !allRexEvaStationUuids.includes(station.uuid) && !station.isLanderXgress
  );
  return sortBy(stationList, (station) => station.name.toLowerCase());
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
 * Only returns true if all connections (browser internet, socket, and the
 * Automerge sync socket) are connected
 */
export const isConnected = (state: RootState): boolean => {
  return (
    state.connection.browserConnectionStatus === "connected" &&
    state.connection.socketStatus.connectionStatus === "connected" &&
    state.connection.automergeConnectionStatus === "connected"
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

/**
 * Stable empty array for `useMissionDocSelector(...) ?? EMPTY_DOC_LIST` fallbacks, so hook
 * dependencies do not change on every render while the mission doc is loading.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMPTY_DOC_LIST: any[] = [];

const compareNumbering = (a: { numbering: string }, b: { numbering: string }): number =>
  a.numbering < b.numbering ? -1 : a.numbering > b.numbering ? 1 : 0;

/** All STM level 1 items, sorted by numbering. */
export const selectStmLevel1s = (mission: Mission): STMLevel1[] =>
  Object.values(mission?.stmLevel1s ?? {}).sort(compareNumbering);

/** All STM level 2 items, sorted by their level 1 numbering and then their own numbering. */
export const selectStmLevel2s = (mission: Mission): STMLevel2[] => {
  const level1s = mission?.stmLevel1s ?? {};
  return Object.values(mission?.stmLevel2s ?? {}).sort(
    (a, b) =>
      compareNumbering(
        level1s[a.level1Uuid] ?? { numbering: "" },
        level1s[b.level1Uuid] ?? { numbering: "" }
      ) || compareNumbering(a, b)
  );
};

/** All STM level 3 items, sorted by their level 1, level 2, and own numbering. */
export const selectStmLevel3s = (mission: Mission): STMLevel3[] => {
  const level1s = mission?.stmLevel1s ?? {};
  const level2s = mission?.stmLevel2s ?? {};
  const numberingPath = (level3: STMLevel3): { numbering: string }[] => {
    const level2 = level2s[level3.level2Uuid];
    const level1 = level2 ? level1s[level2.level1Uuid] : undefined;
    return [level1 ?? { numbering: "" }, level2 ?? { numbering: "" }, level3];
  };
  return Object.values(mission?.stmLevel3s ?? {}).sort((a, b) => {
    const pathA = numberingPath(a);
    const pathB = numberingPath(b);
    for (let index = 0; index < pathA.length; index += 1) {
      const result = compareNumbering(pathA[index], pathB[index]);
      if (result !== 0) return result;
    }
    return 0;
  });
};

/** All STM rules, oldest first. */
export const selectStmRules = (mission: Mission): STMRule[] =>
  Object.values(mission?.stmRules ?? {}).sort((a, b) => a.createdAt - b.createdAt);

/** All presets, sorted by name. */
export const selectPresets = (mission: Mission): Preset[] =>
  Object.values(mission?.presets ?? {}).sort((a, b) => a.name.localeCompare(b.name));

/** All layers, sorted by name. */
export const selectLayers = (mission: Mission): Layer[] =>
  Object.values(mission?.layers ?? {}).sort((a, b) => a.name.localeCompare(b.name));

/** All sublayers, sorted by name. */
export const selectSublayers = (mission: Mission): Sublayer[] =>
  Object.values(mission?.sublayers ?? {}).sort((a, b) => a.name.localeCompare(b.name));

/** Folders of one type, sorted by name. */
export const selectFoldersByType = (mission: Mission, type: FolderType): Folder[] =>
  Object.values(mission?.folders ?? {})
    .filter((folder) => folder.type === type)
    .sort((a, b) => a.name.localeCompare(b.name));
