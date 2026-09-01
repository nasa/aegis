import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank mission
 * @param partialMission any fields that are to be overridden from default
 * @returns the generated mission
 */
export const generateBlankMission = (partialMission?: Partial<Mission>): Mission => {
  const defaultNewMission: Mission = {
    id: null,
    name: "",
    maestroDocId: null,
    isArchived: false,
    usingLGRSCoordinates: false,
    gridRenderMode: "server-file",
    description: "",
    actionSystemVersion: 1,
    actionDefinitions: null,
    actionDefinitionLabels: structuredClone(DEFAULT_ACTION_DEFINITION_LABELS),
    actionDefinitionConjunctions: structuredClone(DEFAULT_ACTION_DEFINITION_CONJUNCTIONS),
    missionBanner: "",
    landerLocation: { lat: null, lng: null },
    landerElevationMeters: 0,
    traverseRate: 2,
    defaultEvaDuration: 240,
    walkbackRate: 2,
    equipmentItems: {},
    geographicUnits: {},
    missionPriorities: {},
    serverFileGrid: null,
    planetRadius: 1737400, // moon
    initialZoom: 14,
    demFilePath: "",
    demResolution: 0,
    projIsCustom: false,
    projEpsg: "",
    projProj4String: "",
    projBoundsMinX: 0,
    projBoundsMinY: 0,
    projBoundsMaxX: 0,
    projBoundsMaxY: 0,
    projOriginX: 0,
    projOriginY: 0,
    projResZoomLevel: 0,
    projResUnitsPerPixel: 0,
    circleDefinitions: {},
    actionTemplates: {},
    pois: {},
    actions: {},
    stations: {},
    traverses: {},
    evas: {},
    rexes: {},
    stmLevel1Enabled: true,
    stmLevel1Name: "Goal",
    stmLevel2Name: "Objective",
    stmLevel3Name: "Investigation",
    updatedAt: getAccurateNow().getTime(),
    createdAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewMission, ...partialMission };
};

/**
 * Generate a blank action template
 * @param partialActionTemplate any fields that are to be overridden from default
 * @returns the generated action template
 */
export const generateBlankActionTemplate = (
  partialActionTemplate?: Partial<ActionTemplate>
): ActionTemplate => {
  const defaultNewActionTemplate: ActionTemplate = {
    templateName: null,
    name: "",
    actionDefinition: null,
    icon: null,
    description: "",
    descriptionTask: "",
    status: "Candidate",
    type: "other",
    duration: 6,
    stmAction: false,
    stmPriorities: null,
    missionPriorityUuid: null,
    equipmentItemsUsage: {},
    geographicUnitsUsage: [],
    crewAssigned: [],
    mass: null,
    priority: null,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewActionTemplate, ...partialActionTemplate };
};

export const generateDefaultActionDefinitions = (
  partialActionDefinitions?: Partial<ActionDefinitions>
): ActionDefinitions => {
  const newActionDefinitions = {
    verbs: {
      [uuidv4()]: { name: "Characterize", abbr: "charize" },
      [uuidv4()]: { name: "Describe", abbr: "describe" }, // same as "characterize"?
      [uuidv4()]: { name: "Deploy", abbr: "deploy" },
      [uuidv4()]: { name: "Measure", abbr: "measure" },
      [uuidv4()]: { name: "Observe", abbr: "observe" },
      [uuidv4()]: { name: "Photo", abbr: "photo" },
      [uuidv4()]: { name: "Photo: 360 Panorama", abbr: "p-pano" },
      [uuidv4()]: { name: "Photo: Mosaic", abbr: "p-mosaic" },
      [uuidv4()]: { name: "Photo: Nested Image", abbr: "p-nested" },
      [uuidv4()]: { name: "Photo: Photometric Survey", abbr: "p-survey" },
      [uuidv4()]: { name: "Photo: Stereo Mosaic", abbr: "p-stermosc" },
      [uuidv4()]: { name: "Photo: Stereo Pair", abbr: "p-stereo" },
      [uuidv4()]: { name: "Place", abbr: "place" },
      [uuidv4()]: { name: "Sample: Chip", abbr: "s-chip" },
      [uuidv4()]: { name: "Sample: Double Drive Tube", abbr: "s-ddtube" },
      [uuidv4()]: { name: "Sample: Drive Tube", abbr: "s-dtube" },
      [uuidv4()]: { name: "Sample: Float", abbr: "s-float" },
      [uuidv4()]: { name: "Sample: Rake", abbr: "s-rake" },
      [uuidv4()]: { name: "Sample: Scoop", abbr: "s-scoop" },
      [uuidv4()]: { name: "Sample: Sealed Scoop", abbr: "s-sscoop" },
      [uuidv4()]: { name: "Sample: Skim", abbr: "s-skim" },
      [uuidv4()]: { name: "Sample: Sealed Skim", abbr: "s-sskim" },
      [uuidv4()]: { name: "Sample: Sealed Drive Tube", abbr: "s-sdtube" },
      [uuidv4()]: { name: "Sample: Sealed Double Drive Tube", abbr: "s-sddtube" },
      [uuidv4()]: { name: "Sample: Contact Sample", abbr: "s-contact" },
      [uuidv4()]: { name: "Trench", abbr: "trench" },
    },

    nouns: {
      [uuidv4()]: { name: "Boulder", abbr: "boulder" },
      [uuidv4()]: { name: "Boulder Fillet", abbr: "boulderfillet" },
      [uuidv4()]: { name: "Contact", abbr: "contact" },
      [uuidv4()]: { name: "Crater Floor", abbr: "craterflr" },
      [uuidv4()]: { name: "Crater Rim", abbr: "craterrim" },
      [uuidv4()]: { name: "Geotechnical Properties", abbr: "geoprops" },
      [uuidv4()]: { name: "Impact Melt", abbr: "impactmelt" },
      [uuidv4()]: { name: "Regolith (any)", abbr: "regolith" },
      [uuidv4()]: { name: "Regolith (Disturbed)", abbr: "regdist" },
      [uuidv4()]: { name: "Regolith (Undisturbed)", abbr: "regundist" },
      [uuidv4()]: { name: "Station", abbr: "station" },
      [uuidv4()]: { name: "Trench (any)", abbr: "trench" },
      [uuidv4()]: { name: "Trench Floor", abbr: "trenchflr" },
      [uuidv4()]: { name: "Trench Wall", abbr: "trenchwall" },
    },

    adjectives: {
      [uuidv4()]: { name: "Distal to Lander", abbr: "distalnder" },
      [uuidv4()]: { name: "Proximal to Lander", abbr: "proxlander" },
      [uuidv4()]: { name: "PSR", abbr: "psr" },
      [uuidv4()]: { name: "Shadow", abbr: "shadow" },
      [uuidv4()]: { name: "Terrain Type: cb", abbr: "cb" },
      [uuidv4()]: { name: "Terrain Type: ce", abbr: "ce" },
      [uuidv4()]: { name: "Terrain Type: icwf", abbr: "icwf" },
      [uuidv4()]: { name: "Terrain Type: icwd", abbr: "icwd" },
      [uuidv4()]: { name: "Terrain Type: uh1", abbr: "uh1" },
      [uuidv4()]: { name: "Terrain Type: uh2", abbr: "uh2" },
      [uuidv4()]: { name: "Geo Unit: A", abbr: "A" },
      [uuidv4()]: { name: "Geo Unit: B", abbr: "B" },
      [uuidv4()]: { name: "Geo Unit: C", abbr: "C" },
    },
  };

  return { ...newActionDefinitions, ...partialActionDefinitions };
};

/**
 * Default category labels + conjunctions for the action-definition "sentence"
 * (<verb> of <noun> in <adjective>).
 */
export const DEFAULT_ACTION_DEFINITION_LABELS: Mission["actionDefinitionLabels"] = {
  verb: { singular: "Verb", plural: "Verbs" },
  noun: { singular: "Noun", plural: "Nouns" },
  adjective: { singular: "Adjective", plural: "Adjectives" },
};

export const DEFAULT_ACTION_DEFINITION_CONJUNCTIONS: Mission["actionDefinitionConjunctions"] = {
  verbToNoun: "of",
  nounToAdjective: "in",
};

/**
 * Join the parts of an action-definition sentence into a display name.
 * The adjective is optional: when it isn't selected, both the adjective and its
 * leading conjunction are omitted (no trailing "in Unknown"). The verb and noun
 * fall back to "Unknown" so an action always has a stable, non-empty name.
 */
export const buildActionDefinitionName = ({
  verbName,
  nounName,
  adjectiveName,
  conjunctions,
}: {
  verbName?: string;
  nounName?: string;
  adjectiveName?: string;
  conjunctions: { verbToNoun: string; nounToAdjective: string };
}): string => {
  let name = `${verbName || "Unknown"} ${conjunctions.verbToNoun} ${nounName || "Unknown"}`;
  if (adjectiveName) {
    name += ` ${conjunctions.nounToAdjective} ${adjectiveName}`;
  }
  return name;
};

export const generateBlankEquipmentItem = (
  partialEquipmentItem?: Partial<EquipmentItem>
): EquipmentItem => {
  const defaultNewEquipmentItem: EquipmentItem = {
    name: "(Equipment Name)",
    quantity: 1,
    singleUse: false,
  };
  return { ...defaultNewEquipmentItem, ...partialEquipmentItem };
};

export const generateBlankGeographicUnit = (
  partialGeographicUnit?: Partial<GeographicUnit>
): GeographicUnit => {
  const defaultNewGeographicUnit: GeographicUnit = {
    name: "(Geographic Unit Name)",
    abbr: "GU",
  };
  return { ...defaultNewGeographicUnit, ...partialGeographicUnit };
};

/**
 * Placeholder trace used for a freshly-created mission priority row. Matches the
 * "(Equipment Name)" / "(Geographic Unit Name)" convention so the field auto-selects
 * its contents on focus.
 */
export const BLANK_MISSION_PRIORITY_TRACE = "(Trace)";

/**
 * Generate a blank mission priority (a single trace row within a category).
 * @param partialMissionPriority any fields that are to be overridden from default
 * @returns the generated mission priority
 */
export const generateBlankMissionPriority = (
  partialMissionPriority?: Partial<MissionPriority>
): MissionPriority => {
  const defaultNewMissionPriority: MissionPriority = {
    trace: BLANK_MISSION_PRIORITY_TRACE,
    category: "",
  };
  return { ...defaultNewMissionPriority, ...partialMissionPriority };
};

/**
 * Join a mission priority into its display form: "<trace> | <category>".
 */
export const buildMissionPriorityName = (missionPriority: MissionPriority): string =>
  `${missionPriority.trace} | ${missionPriority.category}`;

/**
 * Sort mission priority entries by trace. Numeric collation keeps SIMD-0002 ahead of
 * SIMD-0010 instead of sorting them lexically.
 */
export const sortMissionPriorities = (
  missionPriorities: MissionPriorities | null
): [string, MissionPriority][] =>
  Object.entries(missionPriorities ?? {}).sort(([, a], [, b]) =>
    a.trace.localeCompare(b.trace, undefined, { numeric: true })
  );
