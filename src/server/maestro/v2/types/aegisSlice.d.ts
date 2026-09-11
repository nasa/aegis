/**
 * Ambient global namespace for types sourced from the Maestro project (app/types/aegis.d.ts).
 * These are declared in a namespace to avoid polluting the global scope with type names that
 * conflict with similarly-named types used natively in AEGIS. Reference them as Maestro.AegisEva,
 * Maestro.AegisStation, etc. No import needed.
 */
export declare namespace AegisSlice {
  interface EvaSequenceItem {
    type: "station" | "traverse";
    uuid: string;
  }

  interface CalculatedFieldItems {
    totalDwellTime: number;
    durationMinutes?: number;
  }

  /**
   * Format of successful API responses from AEGIS
   */
  type AegisResponse<T> = {
    status: string;
    message: string;
    data: T;
  };

  type AegisMission = {
    name: string;
    id: number;
    description: string;
    actionSystemVersion: 1 | 2;
    createdAt: number;
    updatedAt: number;
  };

  type AegisMissions = {
    [missionId: number]: AegisMission;
  };

  type AegisEva = {
    missionId: number;
    name: string;
    uuid: string;
    description: string;
    sequence: EvaSequenceItem[];
    datetime: number | null;
    createdAt: number;
    updatedAt: number;
    /** Present only when this EVA belongs to a REX. */
    rexUuid?: string;
  };

  type AegisEvas = { [evaId: string]: AegisEva };

  type AegisStation = {
    missionId: number;
    name: string;
    uuid: string;
    iconEmojiDecoded?: string;
    duration: number | null;
    calculatedFields: CalculatedFieldItems;
    description: string;
    actionOrderUuids: string[];
    isLanderXgress: boolean;
    updatedAt: number;
    createdAt: number;
    /** Present only when this station belongs to a REX. */
    rexUuid?: string;
  };

  type AegisStations = { [stationId: string]: AegisStation };

  type AegisTraverse = {
    uuid: string;
    missionId: number;
    name: string;
    description: string;
    actionOrderUuids: string[] | null;
    createdAt: number;
    updatedAt: number;
    iconEmojiDecoded?: string;
    duration: number | null;
    calculatedFields: CalculatedFieldItems;
    /** Present only when this traverse belongs to a REX. */
    rexUuid?: string;
  };

  type AegisTraverses = { [traverseId: string]: AegisTraverse };

  type ActionDefinitionReadable = {
    displayString: string;
    verb?: {
      abbr: string;
      name: string;
      uuid: string;
    };
    noun?: {
      abbr: string;
      name: string;
      uuid: string;
    };
    adjective?: {
      abbr: string;
      name: string;
      uuid: string;
    };
  };

  type EquipmentItemUsage = {
    name: string;
    singleUse: boolean;
    quantityUsed: number;
  };

  type AegisAction = {
    name: string;
    uuid: string;
    descriptionTask: string;
    equipmentItemsUsageReadable: EquipmentItemUsage[];
    actionDefinitionReadable: ActionDefinitionReadable | null | undefined;
    missionId: number;
    icon: string;
    createdAt: number;
    updatedAt: number;
    crewAssigned: string[];
    duration: number;
    stmAction: boolean;
    iconEmojiDecoded: string;
    stationUuid?: string;
    traverseUuid?: string;
    enabled: boolean;
    /** Present only when this action belongs to a REX. */
    rexUuid?: string;
  };

  type AegisActionsRequest = {
    status: string;
    message: string;
    data: AegisAction[];
  };

  interface AegisActionDateRequest {
    status: string;
    message: string;
    data: {
      actionUuid: string;
      createdAt: number;
      updatedAt: number;
    }[];
  }

  type AegisActions = { [actionId: string]: AegisAction };

  type AllocatedAegisActions = {
    [actionId: string]: {
      aegisAction: AegisAction;
      stepUuids: string[];
    };
  };

  /**
   * "with readable" type meaning that it's the type coming straight from AEGIS
   * that includes some type of "readable" property, e.g. the full data about
   * an action/station/traverse, not just the UUID. Maestro does not store these
   * properties directly, but uses them to construct other parts of the aegis
   * slice
   */
  type AegisEvaWithSequenceReadable = AegisEva & {
    sequenceReadable: (StationWithReadable | TraverseWithReadable | null)[];
  };

  type ReadableActions<T extends "Station" | "Traverse"> = {
    actionsReadable: AegisAction[];
    _itemType: T;
  };

  /**
   * "with readable" type meaning that it's the type coming straight from AEGIS
   * that includes some type of "readable" property, e.g. the full data about
   * an action/station/traverse, not just the UUID. Maestro does not store these
   * properties directly, but uses them to construct other parts of the aegis
   * slice
   */
  type StationWithReadable = AegisStation & ReadableActions<"Station">;

  /**
   * "with readable" type meaning that it's the type coming straight from AEGIS
   * that includes some type of "readable" property, e.g. the full data about
   * an action/station/traverse, not just the UUID. Maestro does not store these
   * properties directly, but uses them to construct other parts of the aegis
   * slice
   */
  type TraverseWithReadable = AegisTraverse & ReadableActions<"Traverse">;

  interface AegisSlice {
    aegisMissions: AegisMissions;
    aegisEvas: AegisEvas;
    aegisStations: AegisStations;
    aegisTraverses: AegisTraverses;
    storedAegisActions: AllocatedAegisActions;
    fetchedAegisActions: AegisActions;
  }

  interface AegisErrorElement {
    activityUuid: string;
    stepUuid: string;
  }

  interface AegisErrorTypes {
    mismatchedEva: AegisErrorElement[];
    durationErrors: AegisErrorElement[];
    actionMissingErrors: AegisErrorElement[];
    stationActionErrors: AegisErrorElement[];
    invalidStationSelected: AegisErrorElement[];
    activityShouldNotExist: AegisErrorElement[];
    activitiesOutOfOrder: string[];
    missingSequenceItem: string[];
  }

  interface AegisErrorList {
    [key: string]: AegisErrorTypes;
  }

  /**
   * AEGIS passes Maestro "ingress" or "egress", but when sending REX data
   * back to AEGIS it should be "xgress" for either lander activity.
   */
  type AegisSequenceType = "station" | "traverse" | "ingress" | "egress" | "xgress";
}
