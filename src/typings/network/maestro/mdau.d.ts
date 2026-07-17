/**
 * Typings file for Maestro Data Aegis Uses (MDAU)
 * This typings file is hopefully temporary and will be eventually merged into a fully shared Maegistro typings file (maegistro.d.ts)
 * that will be used by both Maestro and AEGIS
 */
declare namespace Maegistro {
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

  interface EvaSequenceItem {
    type: "station" | "traverse";
    refUuid: string;
  }

  type MdauStation = {
    refUuid: string;
    name: string;
    duration: number;
    actionOrderRefUuids: string[] | null;
    updatedAt: string;
    rexUuid?: string;
  };

  type MdauTraverse = {
    refUuid: string;
    duration: number;
    actionOrderRefUuids: string[] | null;
    updatedAt: string;
    rexUuid?: string;
  };

  type MdauEva = {
    refUuid: string;
    name: string[];
    /**
     * Maestro's executeEventId
     */
    maestroEventId: string;
    /**
     * The full URL to the event (what is in your browser when following)
     */
    maestroEventUrl: string;
    sequenceRefUuids: EvaSequenceItem[];
    ingressDuration: number;
    egressDuration: number;
    updatedAt: string;
    rexUuid?: string;
  };

  type MdauAction = {
    refUuid: string;
    actors: string[]; // crewAssigned in AEGIS
    updatedAt: string;
    rexUuid?: string;
  };

  type MdauRex = {
    /**
     * The rexUuid for the event
     */
    uuid: string;

    /**
     * The timestamp the play/pause button was clicked. Null if not in execute
     * mode
     *
     * @example "2025-01-21T17:06:59.000Z"
     */
    petStartStopTimestamp: string | null;

    /**
     * The value of the PET timer when the play/pause button was clicked in
     * "+hh:mm:ss" format. Note that in Maestro this will always be set to
     * "+00:00:00" for a running clock, and the `petStartStopTimestamp` will
     * be adjusted accordingly to make the clock correct.
     *
     * @example "+00:00:00"
     */
    petValueAtStartStop: string;

    /**
     * Whether the PET is currently running
     */
    petRunning: boolean;

    /**
     * Whether the REX in AEGIS is running
     */
    isRunning: boolean;

    /**
     * Whether the REX in AEGIS is controlled by Maestro or not
     */
    maestroControlled: boolean;
    updatedAt: string;
    /**
     * Just the non-REX info from activities
     */
    maestroActivityPropertiesByRefUuid: {
      [refUuid: string]: {
        /**
         * Hex color for the activity
         */
        color: string;
        /**
         * Number of the activity in the maestro procedure. This will be a
         * letter if it's a newly inserted activity when executing in
         * limited editing mode, so this is type `string` even though the
         * name is `number`
         */
        number: string;
      };
    };
    /**
     * Lander activities/sequence items
     */
    xgressEntries: {
      [xgressUuid: string]: {
        rexStatus: AegisRexStatus;
      };
    };
    /**
     * Station activities/sequence items
     */
    stationEntriesByRefUuid: {
      [stationOrTraverseRefUuid: string]: AegisActivityEntry;
    };

    /**
     * Traverse activities/sequence items
     */
    traverseEntriesByRefUuid: {
      [stationOrTraverseRefUuid: string]: AegisActivityEntry;
    };

    /**
     * Data from steps with AEGIS Action fields
     */
    actionEntriesByRefUuid: {
      [actionRefUuid: string]: {
        rexStatus: AegisRexStatus;

        /**
         * Contents of Marker ID textbox, if any
         */
        markerId: string;

        /**
         * Contents of Container ID textbox, if any
         */
        containerId: string;

        /**
         * Contents of second Container ID textbox, if any
         */
        secondaryContainerId: string;
      };
    };
  };

  type MaestroDataAegisUses = {
    aegisStations?: {
      [stationRefUuid: string]: MdauStation;
    };

    aegisTraverse?: {
      [traverseRefUuid: string]: MdauTraverse;
    };

    aegisEva?: {
      [evaRefUuid: string]: MdauEva;
    };

    aegisAction?: {
      [actionRefUuid: string]: MdauAction;
    };
    aegisRexes?: {
      [rexUuid: string]: MdauRex;
    };
  };
}
