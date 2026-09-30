import { letterOrdinal } from "utils/formatting";
import { refEqual, shallowEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

/** Prefix shown on action letters for a station/traverse added under limited editing. */
const ADDED_PARENT_ORDINAL_PREFIX = "0+";

/** Each distinct thing that `limited` mode permits across the REX EVA. */
export type EvaEditCapability =
  | "activityDuration" // station, traverse, and xgress-station duration
  | "stationLocation" // location, elevation, and walkback traverse rate
  | "traversePath"
  | "evaSequenceAdd" // Add Station (creates a station slot + traverse)
  | "evaSequenceReorder" // up/down arrows
  | "actionCreate"
  | "actionReorder" // drag-and-drop writing actionOrderUuids
  | "actionCrewAssigned"
  | "actionEnabled" // Activate/Deactivate in the kabob
  | "sampleCollectionIds"
  | "executedSampleMass";

/** Capabilities that `limited` permits on entities that existed before execution. */
const LIMITED_MODE_EVA_EDIT_CAPABILITIES: ReadonlySet<EvaEditCapability> =
  new Set<EvaEditCapability>([
    "activityDuration",
    "traversePath",
    "evaSequenceAdd",
    "evaSequenceReorder",
    "actionCreate",
    "actionReorder",
    "actionCrewAssigned",
    "actionEnabled",
    "sampleCollectionIds",
    "executedSampleMass",
  ]);

/**
 * The mode in force for a REX scope. Returns "unrestricted" for a null scope
 * (as-planned) or a REX that is not currently running.
 */
export const resolveRexExecuteEditMode = (
  mission: Mission | undefined,
  rexUuid: string | null
): RexExecuteEditMode => {
  if (!mission || !rexUuid) return "unrestricted";
  const rex = mission.rexes?.[rexUuid];
  if (!rex || !rex.isRunning) return "unrestricted";
  return rex.executeEditMode ?? "unrestricted";
};

/**
 * Whether a capability is available. `entityWasAdded` marks an entity created
 * under limited editing, which is fully editable — that exemption applies only
 * in `limited`, never in `none`.
 */
export const canEditInRexScope = (
  mode: RexExecuteEditMode,
  capability: EvaEditCapability,
  options?: { entityWasAdded?: boolean }
): boolean => {
  if (mode === "unrestricted") return true;
  if (mode === "none") return false;
  if (options?.entityWasAdded) return true;
  return LIMITED_MODE_EVA_EDIT_CAPABILITIES.has(capability);
};

/**
 * Resolve the REX a given entity belongs to. Walks eva -> rex, and
 * station/traverse/action -> eva -> rex. Returns null for as-planned entities.
 */
export const findRexUuidForEntity = (
  mission: Mission | undefined,
  entity: {
    evaUuid?: string;
    stationUuid?: string;
    traverseUuid?: string;
    actionUuid?: string;
  }
): string | null => {
  if (!mission) return null;

  let evaUuid = entity.evaUuid;

  if (!evaUuid && entity.actionUuid) {
    // An action hangs off a station or a traverse; resolve to that parent first.
    // A POI-parented action is never REX-scoped.
    const action = mission.actions?.[entity.actionUuid];
    const parentUuid = action?.stationUuid || action?.traverseUuid;
    if (parentUuid) evaUuid = findEvaUuidForSequenceEntity(mission, parentUuid);
  }

  if (!evaUuid && (entity.stationUuid || entity.traverseUuid)) {
    evaUuid = findEvaUuidForSequenceEntity(mission, entity.stationUuid ?? entity.traverseUuid);
  }

  if (!evaUuid) return null;

  const rex = Object.values(mission.rexes ?? {}).find((candidate) => candidate.evaUuid === evaUuid);
  return rex?.uuid ?? null;
};

/**
 * First EVA whose sequence contains the given station or traverse uuid. A
 * station may belong to several as-planned EVAs, but a REX EVA's duplicated
 * stations are exclusive to it, so the first match is correct for REX scoping.
 */
const findEvaUuidForSequenceEntity = (
  mission: Mission,
  entityUuid: string | undefined
): string | undefined => {
  if (!entityUuid) return undefined;
  for (const eva of Object.values(mission.evas ?? {})) {
    if (eva.sequence?.some((item) => item.uuid === entityUuid)) return eva.uuid;
  }
  return undefined;
};

/** Resolves a REX scope's mode plus its added-entity and letter-baseline lookups. */
export const useRexExecuteEditMode = (
  rexUuid: string | null
): {
  mode: RexExecuteEditMode;
  isEntityAdded: (uuid: string) => boolean;
  baselineActionOrderFor: (parentUuid: string) => string[] | undefined;
} => {
  const mode = useMissionDocSelector(
    (mission) => resolveRexExecuteEditMode(mission, rexUuid),
    refEqual
  );
  const executeEditState = useMissionDocSelector(
    (mission) => (rexUuid ? (mission.rexes?.[rexUuid]?.executeEditState ?? null) : null),
    shallowEqual
  );

  const resolvedMode = mode ?? "unrestricted";

  return {
    mode: resolvedMode,
    isEntityAdded: (uuid: string) => {
      if (!executeEditState || !uuid) return false;
      return (
        executeEditState.addedStationUuids.includes(uuid) ||
        executeEditState.addedTraverseUuids.includes(uuid) ||
        executeEditState.addedActionUuids.includes(uuid)
      );
    },
    baselineActionOrderFor: (parentUuid: string) =>
      executeEditState?.actionLetterOrderByParent?.[parentUuid],
  };
};

/**
 * The per-action edit permissions threaded through the action tree. Bundled
 * rather than passed as separate booleans because every level forwards them.
 */
export type ActionEditCapabilities = {
  crewAssigned: boolean;
  enabled: boolean;
  sampleIds: boolean;
  executedMass: boolean;
  reorder: boolean;
  /** name, type, priority, duration, planned mass, equipment, geo units, STM */
  generalFields: boolean;
  /** delete, duplicate, save-as-template */
  destructive: boolean;
};

/** Permits everything, for non-REX lists and any list outside a restricted scope. */
export const UNRESTRICTED_ACTION_EDIT_CAPABILITIES: ActionEditCapabilities = {
  crewAssigned: true,
  enabled: true,
  sampleIds: true,
  executedMass: true,
  reorder: true,
  generalFields: true,
  destructive: true,
};

/** Build the action-tree capability bundle for one action in a REX scope. */
export const buildActionEditCapabilities = (
  mode: RexExecuteEditMode,
  { actionWasAdded }: { actionWasAdded: boolean }
): ActionEditCapabilities => ({
  crewAssigned: canEditInRexScope(mode, "actionCrewAssigned", { entityWasAdded: actionWasAdded }),
  enabled: canEditInRexScope(mode, "actionEnabled", { entityWasAdded: actionWasAdded }),
  sampleIds: canEditInRexScope(mode, "sampleCollectionIds", { entityWasAdded: actionWasAdded }),
  executedMass: canEditInRexScope(mode, "executedSampleMass", { entityWasAdded: actionWasAdded }),
  reorder: canEditInRexScope(mode, "actionReorder", { entityWasAdded: actionWasAdded }),
  // Not in the limited allow-list: only available unrestricted or on an added action.
  generalFields: mode === "unrestricted" || (mode === "limited" && actionWasAdded),
  destructive: mode === "unrestricted" || (mode === "limited" && actionWasAdded),
});

/**
 * Display ordinals for one parent's action list.
 *
 * Positional letters normally; baseline-pinned letters for a pre-existing
 * parent under limited editing (so a letter travels with its action through a
 * reorder); "0+"-prefixed positional letters for a parent added under limited
 * editing.
 */
export const buildActionOrdinalLabels = ({
  actionOrderUuids,
  usePinnedLetters,
  parentWasAddedUnderLimitedEdit,
  baselineActionOrder,
}: {
  actionOrderUuids: string[];
  usePinnedLetters: boolean;
  parentWasAddedUnderLimitedEdit: boolean;
  baselineActionOrder: string[] | undefined;
}): string[] => {
  const order = actionOrderUuids ?? [];

  if (parentWasAddedUnderLimitedEdit) {
    return order.map((_, index) => `${ADDED_PARENT_ORDINAL_PREFIX}${letterOrdinal(index + 1)}`);
  }

  if (!usePinnedLetters || !baselineActionOrder) {
    return order.map((_, index) => letterOrdinal(index + 1));
  }

  // Actions missing from the baseline (data gap, or created outside the tracked
  // paths) are appended to the end of the letter sequence so the UI never throws.
  const letterIndexByUuid = new Map<string, number>();
  baselineActionOrder.forEach((uuid, index) => letterIndexByUuid.set(uuid, index));
  let nextUnknownLetterIndex = baselineActionOrder.length;

  return order.map((actionUuid) => {
    let letterIndex = letterIndexByUuid.get(actionUuid);
    if (letterIndex === undefined) {
      letterIndex = nextUnknownLetterIndex;
      nextUnknownLetterIndex += 1;
      letterIndexByUuid.set(actionUuid, letterIndex);
    }
    return letterOrdinal(letterIndex + 1);
  });
};
