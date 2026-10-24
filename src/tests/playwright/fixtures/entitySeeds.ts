const createdAt = Date.parse("2026-10-24T12:00:00.000Z");

export function seedEva(overrides: Partial<Eva>): Eva {
  return {
    uuid: "",
    refUuid: "",
    ownerId: 0,
    name: "",
    status: "Candidate",
    sequence: [],
    description: "",
    traverseRate: 2,
    duration: 240,
    traverseColor: "#ff0000",
    datetime: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedStation(overrides: Partial<Station>): Station {
  return {
    uuid: "",
    refUuid: "",
    ownerId: 0,
    poiUuids: [],
    actionOrderUuids: [],
    name: "",
    status: "Candidate",
    description: "",
    icon: "1f535",
    isLanderXgress: false,
    radius: 5,
    location: null,
    elevation: 0,
    duration: 15,
    walkbackPath: null,
    walkbackPathSegmentDistances: null,
    walkbackPathSegmentElevations: null,
    walkbackTraverseRate: null,
    mapCircleControls: {},
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedTraverse(overrides: Partial<Traverse>): Traverse {
  return {
    uuid: "",
    refUuid: "",
    name: "",
    description: "",
    duration: 5,
    path: [],
    pathSegmentDistances: [],
    pathSegmentElevations: [],
    pathSegmentAbsoluteSlopes: [],
    status: "Candidate",
    color: null,
    actionOrderUuids: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedPoi(overrides: Partial<POI>): POI {
  return {
    uuid: "",
    ownerId: 0,
    name: "",
    description: "",
    actionOrderUuids: [],
    priorityOverride: 0,
    radius: 5,
    location: null,
    elevation: 0,
    icon: "1f534",
    tags: [],
    status: "Candidate",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedAction(overrides: Partial<Action>): Action {
  return {
    uuid: "",
    refUuid: "",
    name: "",
    poiUuid: null,
    stationUuid: null,
    traverseUuid: null,
    parentActionUuid: null,
    parentCopyDate: null,
    priority: null,
    stmPriorities: null,
    missionPriorityUuid: null,
    type: "other",
    description: "",
    descriptionTask: "",
    stmAction: false,
    actionDefinition: null,
    icon: "26cf-fe0f",
    location: null,
    elevation: 0,
    duration: 6,
    equipmentItemsUsage: {},
    geographicUnitsUsage: [],
    mass: null,
    status: "Candidate",
    enabled: true,
    crewAssigned: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedFolder(overrides: Partial<Folder>): Folder {
  return {
    uuid: "",
    name: "",
    type: "station",
    items: [],
    visible: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedPreset(overrides: Partial<Preset>): Preset {
  return {
    uuid: "",
    name: "",
    ownerId: null,
    description: "",
    missionDefault: false,
    layerOrder: [],
    mapSublayerControls: {},
    mapCircleControls: {},
    mapGridControl: {
      visible: false,
      labelsVisible: false,
      style: {
        opacity: 0.4,
        contrast: 1,
        brightness: 1,
        saturation: 1,
        blendMode: "normal",
        color: "#ffffff",
        weight: 1,
        fillColor: "none",
        fillOpacity: 0,
        isDashed: false,
        dashLen: 10,
        altColor: "#ffffff",
        altOpacity: 1,
        showLabels: true,
        labelColor: "#ffffff",
        labelHaloColor: "#000000",
        labelHaloWidth: 4,
        labelHaloOpacity: 0.2,
      },
    },
    sunAzimuth: 0,
    sunEnabled: false,
    earthAzimuth: 0,
    earthEnabled: false,
    earthAsMoon: false,
    sunEarthFromDate: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedRex(overrides: Partial<Rex>): Rex {
  return {
    uuid: "",
    ownerId: 0,
    name: "",
    description: "",
    petStartStopTimestamp: null,
    petValueAtStartStop: "+00:00:00",
    petRunning: false,
    evaUuid: "",
    isRunning: false,
    posEntries: [],
    posTypes: [],
    posSources: [],
    stationEntries: {},
    traverseEntries: {},
    actionEntries: {},
    maestroControlled: false,
    maestroEventId: null,
    maestroEventUrl: null,
    maestroActivityProperties: null,
    executeEditMode: "unrestricted",
    executeEditState: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function seedPosEntry(overrides: Partial<PosEntry>): PosEntry {
  return {
    uuid: "",
    location: null,
    elevation: 0,
    petSeconds: 0,
    posTypeUuids: [],
    posSourceUuid: "",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
