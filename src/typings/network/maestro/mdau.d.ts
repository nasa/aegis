/**
 * Typings file for Maestro Data Aegis Uses (MADU)
 * Based off of the RexOverwrite type that Maegistro v1 used to support MS2
 * This typings file is hopefully temporary and will be eventually merged into a fully shared Maegistro typings file (maegistro.d.ts)
 * that will be used by both Maestro and AEGIS
 */

type MaestroDataAegisUses = {
  uuid: string; // Rex uuid
  petStartStopTimestamp: string | null;
  petValueAtStartStop: string;
  petRunning: boolean;
  isRunning: boolean;
  maestroControlled: boolean;
  maestroEventId: string;
  maestroEventUrl: string;
  maestroActivityPropertiesByRefUuid: {
    [refUuid: string]: {
      color: string;
      number: string;
    };
  };
  xgressEntries: {
    [xgressUuid: string]: {
      rexStatus: AegisRexStatus;
    };
  };
  stationEntriesByRefUuid: {
    [stationOrTraverseRefUuid: string]: AegisActivityEntry;
  };
  traverseEntriesByRefUuid: {
    [stationOrTraverseRefUuid: string]: AegisActivityEntry;
  };
  actionEntriesByRefUuid: {
    [actionRefUuid: string]: {
      rexStatus: AegisRexStatus;
      markerId: string;
      containerId: string;
      secondaryContainerId: string;
    };
  };
  aegisStations: {
    [stationId: string]: {
      refUuid: string;
      name: string;
      rexUuid?: string;
    };
  };
};
/**
 * Status of AEGIS sequence items (stations, traverses, lander) and actions
 */
type AegisRexStatus = "pending" | "in-progress" | "complete" | "skipped";

interface AegisActivityEntry {
  /**
   * Activity/sequence-item status
   */
  rexStatus: AegisRexStatus;

  /**
   * EV1 percent complete for the activity. A number from 0 to 100.
   */
  maestroPercentCompleteEv1: number;

  /**
   * EV2 percent complete for the activity. A number from 0 to 100.
   */
  maestroPercentCompleteEv2: number;
}
