import {
  seedAction,
  seedEva,
  seedFolder,
  seedPoi,
  seedPreset,
  seedPosEntry,
  seedRex,
  seedStation,
  seedTraverse,
} from "./entitySeeds";

export const BEHAVIORAL_NOW = "2026-10-24T12:00:00.000Z";

const fixtureUuid = (value: number): string =>
  `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

export const MISSION_IDS = {
  evaA: fixtureUuid(1),
  evaB: fixtureUuid(2),
  stationA: fixtureUuid(3),
  stationB: fixtureUuid(4),
  poiA: fixtureUuid(5),
  actionA: fixtureUuid(6),
  traverseA: fixtureUuid(7),
  presetA: fixtureUuid(8),
  presetB: fixtureUuid(9),
  folderA: fixtureUuid(10),
  egressA: fixtureUuid(11),
  ingressA: fixtureUuid(12),
  egressB: fixtureUuid(13),
  ingressB: fixtureUuid(14),
  traverseOutbound: fixtureUuid(15),
  traverseReturn: fixtureUuid(16),
  traverseB: fixtureUuid(17),
  traverseBReturn: fixtureUuid(18),
  rexA: fixtureUuid(21),
  rexB: fixtureUuid(22),
  rexEvaA: fixtureUuid(23),
  rexEvaB: fixtureUuid(24),
  rexStationA: fixtureUuid(25),
  rexStationB: fixtureUuid(26),
  rexStationABravo: fixtureUuid(27),
  rexEgressA: fixtureUuid(28),
  rexIngressA: fixtureUuid(29),
  rexEgressB: fixtureUuid(30),
  rexIngressB: fixtureUuid(31),
  rexTraverseOutbound: fixtureUuid(32),
  rexTraverseA: fixtureUuid(33),
  rexTraverseReturn: fixtureUuid(34),
  rexTraverseB: fixtureUuid(35),
  rexTraverseBReturn: fixtureUuid(36),
  rexActionA: fixtureUuid(37),
  posA: fixtureUuid(40),
  posB: fixtureUuid(41),
  posType: fixtureUuid(42),
  posSource: fixtureUuid(43),
} as const;

export const MISSION_NAMES = {
  evaA: "Survey Alpha",
  evaB: "Survey Bravo",
  stationA: "Alpha station",
  stationB: "Bravo station",
  poiA: "Reference POI",
  actionA: "Sample regolith",
  traverseA: "Alpha to Bravo",
  presetA: "Overview",
  presetB: "Detail",
  folderA: "Surface sites",
  rexA: "Stopped Alpha",
  rexB: "Active Bravo",
} as const;

const referenceUuid = (uuid: string): string => uuid.replace("10000000", "20000000");

function makeStation(
  uuid: string,
  name: string,
  location: AEGISPoint,
  extra: Partial<Station> = {}
): Station {
  return seedStation({
    uuid,
    refUuid: referenceUuid(uuid),
    name,
    location,
    icon: "1f535",
    elevation: 0,
    duration: 15,
    walkbackPath: [{ lat: 0, lng: 0 }, location],
    walkbackPathSegmentDistances: [50],
    walkbackPathSegmentElevations: [[0, 0]],
    ...extra,
  });
}

function makeTraverse(uuid: string, name: string, path: AEGISPoint[]): Traverse {
  return seedTraverse({
    uuid,
    refUuid: referenceUuid(uuid),
    name,
    path,
    pathSegmentDistances: path.slice(1).map(() => 50),
    pathSegmentElevations: path.slice(1).map(() => [0, 0]),
    pathSegmentAbsoluteSlopes: path.slice(1).map(() => [0, 0]),
    status: "Candidate",
    duration: 5,
  });
}

/** Small explicit missions cover relationships without relying on an imported database. */
export function buildBehavioralMission(
  id: number,
  name: string,
  scenario: BehavioralScenario,
  blankMission: Mission
): Mission {
  const ids = MISSION_IDS;
  const lander = { lat: 0, lng: 0 };
  const alpha = { lat: 0.001, lng: 0.001 };
  const bravo = { lat: 0.001, lng: 0.003 };
  const mission: Mission = {
    ...blankMission,
    id,
    name,
    description: "Isolated behavioral test mission",
    missionBanner: "Behavioral baseline",
    landerLocation: lander,
    initialZoom: 17,
    demFilePath: "",
    presets: {
      [ids.presetA]: seedPreset({
        uuid: ids.presetA,
        name: MISSION_NAMES.presetA,
        missionDefault: true,
      }),
      [ids.presetB]: seedPreset({
        uuid: ids.presetB,
        name: MISSION_NAMES.presetB,
        sunEnabled: true,
        sunAzimuth: 90,
      }),
    },
    pois: {
      [ids.poiA]: seedPoi({
        uuid: ids.poiA,
        name: MISSION_NAMES.poiA,
        description: "A reference outcrop",
        location: { lat: 0.0015, lng: 0.002 },
        elevation: 0,
      }),
    },
    stations: {
      [ids.stationA]: makeStation(ids.stationA, MISSION_NAMES.stationA, alpha, {
        poiUuids: [ids.poiA],
        actionOrderUuids: [ids.actionA],
      }),
      [ids.stationB]: makeStation(ids.stationB, MISSION_NAMES.stationB, bravo),
      [ids.egressA]: makeStation(ids.egressA, "Lander Egress", lander, {
        isLanderXgress: true,
        icon: "landerIcon",
        duration: 10,
      }),
      [ids.ingressA]: makeStation(ids.ingressA, "Lander Ingress", lander, {
        isLanderXgress: true,
        icon: "landerIcon",
        duration: 10,
      }),
      [ids.egressB]: makeStation(ids.egressB, "Lander Egress", lander, {
        isLanderXgress: true,
        icon: "landerIcon",
        duration: 10,
      }),
      [ids.ingressB]: makeStation(ids.ingressB, "Lander Ingress", lander, {
        isLanderXgress: true,
        icon: "landerIcon",
        duration: 10,
      }),
    },
    traverses: {
      [ids.traverseOutbound]: makeTraverse(ids.traverseOutbound, "Lander to Alpha", [
        lander,
        alpha,
      ]),
      [ids.traverseA]: makeTraverse(ids.traverseA, MISSION_NAMES.traverseA, [
        alpha,
        { lat: 0.0015, lng: 0.002 },
        bravo,
      ]),
      [ids.traverseReturn]: makeTraverse(ids.traverseReturn, "Bravo to Lander", [bravo, lander]),
      [ids.traverseB]: makeTraverse(ids.traverseB, "Lander to Bravo", [lander, bravo]),
      [ids.traverseBReturn]: makeTraverse(ids.traverseBReturn, "Bravo to Lander", [bravo, lander]),
    },
    actions: {
      [ids.actionA]: seedAction({
        uuid: ids.actionA,
        refUuid: referenceUuid(ids.actionA),
        name: MISSION_NAMES.actionA,
        stationUuid: ids.stationA,
        poiUuid: ids.poiA,
        location: alpha,
        type: "sample",
        duration: 6,
        crewAssigned: ["EV1"],
      }),
    },
    evas: {
      [ids.evaA]: seedEva({
        uuid: ids.evaA,
        refUuid: referenceUuid(ids.evaA),
        name: MISSION_NAMES.evaA,
        duration: 240,
        traverseRate: 2,
        traverseColor: "#ff0000",
        sequence: [
          { type: "station", uuid: ids.egressA },
          { type: "traverse", uuid: ids.traverseOutbound },
          { type: "station", uuid: ids.stationA },
          { type: "traverse", uuid: ids.traverseA },
          { type: "station", uuid: ids.stationB },
          { type: "traverse", uuid: ids.traverseReturn },
          { type: "station", uuid: ids.ingressA },
        ],
      }),
      [ids.evaB]: seedEva({
        uuid: ids.evaB,
        refUuid: referenceUuid(ids.evaB),
        name: MISSION_NAMES.evaB,
        duration: 180,
        traverseRate: 2,
        traverseColor: "#00ff00",
        sequence: [
          { type: "station", uuid: ids.egressB },
          { type: "traverse", uuid: ids.traverseB },
          { type: "station", uuid: ids.stationB },
          { type: "traverse", uuid: ids.traverseBReturn },
          { type: "station", uuid: ids.ingressB },
        ],
      }),
    },
    folders: {
      [ids.folderA]: seedFolder({
        uuid: ids.folderA,
        name: MISSION_NAMES.folderA,
        type: "station",
        items: [ids.stationA, ids.stationB],
      }),
    },
  };

  if (scenario === "execution") addExecutions(mission);
  const timestamp = Date.parse(BEHAVIORAL_NOW);
  mission.createdAt = timestamp;
  mission.updatedAt = timestamp;
  for (const entities of [
    mission.stations,
    mission.traverses,
    mission.evas,
    mission.actions,
    mission.pois,
    mission.presets,
    mission.folders,
    mission.rexes,
  ]) {
    for (const entity of Object.values(entities)) {
      entity.createdAt = timestamp;
      entity.updatedAt = timestamp;
    }
  }
  for (const rex of Object.values(mission.rexes)) {
    for (const entry of rex.posEntries ?? []) {
      entry.createdAt = timestamp;
      entry.updatedAt = timestamp;
    }
  }
  return mission;
}

function addExecutions(mission: Mission): void {
  const ids = MISSION_IDS;
  const copyMaps = [
    {
      evaUuid: ids.evaA,
      rexEvaUuid: ids.rexEvaA,
      stations: {
        [ids.egressA]: ids.rexEgressA,
        [ids.stationA]: ids.rexStationA,
        [ids.stationB]: ids.rexStationABravo,
        [ids.ingressA]: ids.rexIngressA,
      },
      traverses: {
        [ids.traverseOutbound]: ids.rexTraverseOutbound,
        [ids.traverseA]: ids.rexTraverseA,
        [ids.traverseReturn]: ids.rexTraverseReturn,
      },
    },
    {
      evaUuid: ids.evaB,
      rexEvaUuid: ids.rexEvaB,
      stations: {
        [ids.egressB]: ids.rexEgressB,
        [ids.stationB]: ids.rexStationB,
        [ids.ingressB]: ids.rexIngressB,
      },
      traverses: {
        [ids.traverseB]: ids.rexTraverseB,
        [ids.traverseBReturn]: ids.rexTraverseBReturn,
      },
    },
  ];

  for (const copy of copyMaps) {
    for (const [oldUuid, newUuid] of Object.entries(copy.stations)) {
      const source = structuredClone(mission.stations[oldUuid]);
      mission.stations[newUuid] = {
        ...source,
        uuid: newUuid,
        actionOrderUuids: oldUuid === ids.stationA ? [ids.rexActionA] : [],
      };
    }
    for (const [oldUuid, newUuid] of Object.entries(copy.traverses)) {
      mission.traverses[newUuid] = {
        ...structuredClone(mission.traverses[oldUuid]),
        uuid: newUuid,
      };
    }
    const source = structuredClone(mission.evas[copy.evaUuid]);
    mission.evas[copy.rexEvaUuid] = {
      ...source,
      uuid: copy.rexEvaUuid,
      name: "",
      sequence: source.sequence.map((item) => ({
        type: item.type,
        uuid: (item.type === "station" ? copy.stations : copy.traverses)[item.uuid],
      })),
    };
  }

  mission.actions[ids.rexActionA] = {
    ...structuredClone(mission.actions[ids.actionA]),
    uuid: ids.rexActionA,
    stationUuid: ids.rexStationA,
  };
  const posTypes: PosType[] = [
    { uuid: ids.posType, name: "EV1", abbr: "1", icon: "1f468-200d-1f680", pathColor: "#ff0000" },
  ];
  const posSources: PosSource[] = [{ uuid: ids.posSource, name: "Crew", abbr: "C" }];
  mission.rexes[ids.rexA] = seedRex({
    uuid: ids.rexA,
    name: MISSION_NAMES.rexA,
    evaUuid: ids.rexEvaA,
    isRunning: false,
    petRunning: false,
    petValueAtStartStop: "+02:10:05",
    petStartStopTimestamp: BEHAVIORAL_NOW,
    posTypes: structuredClone(posTypes),
    posSources: structuredClone(posSources),
    posEntries: [
      seedPosEntry({
        uuid: ids.posA,
        location: { lat: 0.0005, lng: 0.0015 },
        elevation: 0,
        petSeconds: 6905,
        posTypeUuids: [ids.posType],
        posSourceUuid: ids.posSource,
      }),
    ],
  });
  mission.rexes[ids.rexB] = seedRex({
    uuid: ids.rexB,
    name: MISSION_NAMES.rexB,
    evaUuid: ids.rexEvaB,
    isRunning: true,
    petRunning: false,
    petValueAtStartStop: "+00:05:00",
    petStartStopTimestamp: BEHAVIORAL_NOW,
    posTypes: structuredClone(posTypes),
    posSources: structuredClone(posSources),
    stationEntries: { [ids.rexStationB]: { rexStatus: "in-progress" } },
    posEntries: [
      seedPosEntry({
        uuid: ids.posB,
        location: { lat: 0.001, lng: 0.0025 },
        elevation: 0,
        petSeconds: 120,
        posTypeUuids: [ids.posType],
        posSourceUuid: ids.posSource,
      }),
    ],
  });
}
