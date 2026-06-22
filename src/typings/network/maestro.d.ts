/**
 * Ambient global namespace for types sourced from the Maestro project (app/types/aegis.d.ts).
 * These are declared in a namespace to avoid polluting the global scope with type names that
 * conflict with similarly-named types used natively in AEGIS. Reference them as Maestro.AegisEva,
 * Maestro.AegisStation, etc. No import needed.
 */
declare namespace Maestro {
  export interface EvaSequenceItem {
    type: "station" | "traverse";
    refUuid: string;
  }

  export interface CalculatedFieldItems {
    totalDwellTime: number;
    durationMinutes?: number;
  }

  /**
   * Format of successful API responses from AEGIS
   */
  export type AegisResponse<T> = {
    status: string;
    message: string;
    data: T;
  };

  export type AegisMission = {
    name: string;
    id: number;
    description: string;
    actionSystemVersion: 1 | 2;
    createdAt: string;
    updatedAt: string;
  };

  export type AegisMissions = {
    [missionId: number]: AegisMission;
  };

  export type AegisEva = {
    missionId: number;
    name: string;
    refUuid: string;
    description: string;
    sequenceRefUuids: EvaSequenceItem[];
    ingressLocationRefUuid: string;
    ingressDuration: number;
    egressLocationRefUuid: string;
    egressDuration: number;
    createdAt: string;
    updatedAt: string;
    rexUuid?: string;
  };

  export type AegisEvas = { [evaId: string]: AegisEva };

  export type AegisStation = {
    missionId: number;
    name: string;
    refUuid: string;
    iconEmojiDecoded?: string;
    duration: number | null;
    calculatedFields: CalculatedFieldItems;
    description: string;
    actionOrderRefUuids: string[];
    updatedAt: string;
    createdAt: string;
    rexUuid?: string;
  };

  export type AegisStations = { [stationId: string]: AegisStation };

  export type AegisTraverse = {
    refUuid: string;
    missionId: number;
    name: string;
    description: string;
    actionOrderRefUuids: string[] | null;
    createdAt: string;
    updatedAt: string;
    iconEmojiDecoded?: string;
    duration: number | null;
    calculatedFields: CalculatedFieldItems;
    rexUuid?: string;
  };

  export type AegisTraverses = { [traverseId: string]: AegisTraverse };

  export type ActionDefinitionReadable = {
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

  export type AegisDifferences = {
    current: Partial<AegisAction>;
    incoming: Partial<AegisAction>;
  };

  export type EquipmentItemUsage = {
    name: string;
    singleUse: boolean;
    quantityUsed: number;
  };

  export type AegisAction = {
    name: string;
    refUuid: string;
    descriptionTask: string;
    equipmentItemsUsageReadable: EquipmentItemUsage[];
    actionDefinitionReadable: ActionDefinitionReadable | null | undefined;
    missionId: number;
    icon: string;
    createdAt: string;
    updatedAt: string;
    crewAssigned: string[];
    duration: number;
    stmAction: boolean;
    iconEmojiDecoded: string;
    stationRefUuid?: string;
    traverseRefUuid?: string;
    rexUuid?: string;
    enabled: boolean;
  };

  export type AegisActionsRequest = {
    status: string;
    message: string;
    data: AegisAction[];
  };

  export interface AegisActionDateRequest {
    status: string;
    message: string;
    data: {
      actionUuid: string;
      createdAt: string;
      updatedAt: string;
    }[];
  }

  export type AegisActions = { [actionId: string]: AegisAction };

  export type AllocatedAegisActions = {
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
  export type AegisEvaWithSequenceReadable = AegisEva & {
    sequenceReadable: (StationWithReadable | TraverseWithReadable | null)[];
  };

  export type ReadableActions<T extends "Station" | "Traverse"> = {
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
  export type StationWithReadable = AegisStation & ReadableActions<"Station">;

  /**
   * "with readable" type meaning that it's the type coming straight from AEGIS
   * that includes some type of "readable" property, e.g. the full data about
   * an action/station/traverse, not just the UUID. Maestro does not store these
   * properties directly, but uses them to construct other parts of the aegis
   * slice
   */
  export type TraverseWithReadable = AegisTraverse & ReadableActions<"Traverse">;

  export interface IAegisEntity {
    aegisMissions: AegisMissions;
    aegisEvas: AegisEvas;
    aegisStations: AegisStations;
    aegisTraverses: AegisTraverses;
    storedAegisActions: AllocatedAegisActions;
    fetchedAegisActions: AegisActions;
  }

  export interface AegisErrorElement {
    activityUuid: string;
    stepUuid: string;
  }

  export interface AegisErrorTypes {
    mismatchedEva: AegisErrorElement[];
    outdatedAction: AegisErrorElement[];
    durationErrors: AegisErrorElement[];
    actionMissingErrors: AegisErrorElement[];
    stationActionErrors: AegisErrorElement[];
    invalidStationSelected: AegisErrorElement[];
    activityShouldNotExist: AegisErrorElement[];
    activitiesOutOfOrder: string[];
    missingSequenceItem: string[];
  }

  export interface AegisErrorList {
    [key: string]: AegisErrorTypes;
  }

  /**
   * AEGIS passes Maestro "ingress" or "egress", but when sending REX data
   * back to AEGIS it should be "xgress" for either lander activity.
   */
  export type AegisSequenceType = "station" | "traverse" | "ingress" | "egress" | "xgress";
}
