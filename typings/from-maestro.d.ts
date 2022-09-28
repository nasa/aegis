/**
 * These types are copy-pasted from Maestro with minimal alteration. Some may have types compressed
 * so that there's not multiple extending types.
 */

/**
 * Specify the duration of a period
 */
interface IDurationField {
  /**
   * Hours in duration
   */
  hours?: number | string;

  /**
   * Minutes in duration
   */
  minutes?: number | string;

  /**
   * Seconds in duration
   */
  seconds?: number | string;
}

/**
 * Duration field with the ability to be offset by another duration
 */
interface IOffsetableDurationField extends IDurationField {
  /**
   * Specify a duration by which to offset the duration
   */
  offset?: IDurationField;
}

type IActivityPrototypeRole = {
  /**
   * Role name
   */
  name: string;

  /**
   * Duration, including any offset (starting early or late), for a role on an activity
   */
  duration: IOffsetableDurationField;

  /**
   * Brief explanation of what a role does on an activity
   */
  description: string;
};

/**
 * Activity Prototype Entity: The shape of a activity prototype in Redux store
 */
type ActivityPrototypeEntity = {
  /**
   * Title of the activity
   *
   * @examples ["Egress & Setup", "Failed FHRC Removal"]
   */
  title: string;

  /**
   * Info regarding roles required for this activity
   */
  roles: IActivityPrototypeRole[];

  /**
   * UUID for the activity prototype. Corresponds to IActivityPrototypeDefinition.prototypeUuid.
   * Is named `uuid` here to match Maestro's Redux conventions.
   */
  uuid: string;

  /**
   * Path of the activity YAML file relative to the Maestro project's `./activities` directory.
   * For a file directly in the `./activities` directory, this will just be the file name itself.
   * If the file is in a sub-directory then that directory is included.
   *
   * @examples ["Egress_!_Setup.yml", "MAINT_5/Egress_!_Setup.yml"]
   */
  file: string;

  /**
   * Array of Sync Block UUIDs, pointing to Redux store at state.syncBlocks.entities[uuid]
   */
  syncBlocks: string[];

  /**
   * Stations and traverses can have actions assigned to them. This is to cover cases where the station is defined first and then activites are planned around that
   */
  actions: Action[];

  /**
   * Allow linkage to any part of the STM hierarchy. This is usually inferred from the POIs, but can be overridden here to provide more context.
   */
  STMRefs: STMRef[];

  /**
   * Estimated duration of the station in minutes
   */
  estimatedDuration: number;

  /**
   * Previous traverse / station uuid
   */
  previousActivityPrototypeEntityUuid: string;

  /**
   * Next traverse / station uuid
   */
  nextActivityPrototypeEntityUuid: string;

  /**
   * Whether the activity is a candidate, has been selected to be part of an itinerary, or has been rejected
   */
  status: "candidate" | "selected" | "rejected";

  /**
   * Status comments. This is a free-form text field that can be used to record notes about the status of the activity.
   */
  statusComments: string;
};
