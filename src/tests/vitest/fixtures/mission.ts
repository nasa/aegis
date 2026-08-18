import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

/**
 * Generates fully-wired test `Mission` object.
 *
 * **Combined entity counts:**
 * - POIs: 4 (1 named + 3 with lat/lng)
 * - Stations: 7 (3 named + 4 with lat/lng) + 4 lander xgress + rex duplicates
 * - Traverses: 8 (2 named + 6 base) + rex duplicates
 * - Actions: ~20 (4 named + 3 poi + 4 station + 6 traverse + rex duplicates)
 * - EVAs: 4 (testEva, eva1, eva2, eva1ForRex)
 * - REXes: 2 (testRex with entry maps, rex1 with posEntries)
 *
 * EVA names that tests look up by name:
 *   - "Vitest Eva-1 Planned with Rex"
 *   - "Vitest Eva-2 Planned No Rex"
 *   - "Vitest Eva-1 Rex Version"
 */
export const generateFullMission = (): Mission => {
  // ====== STATIONS (named) ======
  const testStation = generateBlankStation({ name: "Vitest Station-1" });
  const testStation2 = generateBlankStation({ name: "Vitest Station-2" });
  const testStationMid = generateBlankStation({ name: "Vitest Station-3" });

  /** A d lander station created for an EVA's xgress position. */
  const makeLanderStation = () =>
    generateBlankStation({ name: "Lander", isLanderXgress: true, location: { lat: 0, lng: 0 } });

  // ====== POI (named) ======
  const testPoi = generateBlankPoi({ name: "Vitest POI-1" });

  // ====== TRAVERSES (named) ======
  const testTraverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
  const testTraverse2 = generateBlankTraverse({ name: "Vitest Traverse-2" });

  // ====== ACTIONS — one per relationship type + parentActionUuid example ======
  const stationAction = generateBlankAction({
    name: "Vitest Station Action",
    stationUuid: testStation.uuid,
  });
  const poiAction = generateBlankAction({
    name: "Vitest POI Action",
    poiUuid: testPoi.uuid,
  });
  const traverseAction = generateBlankAction({
    name: "Vitest Traverse Action",
    traverseUuid: testTraverse.uuid,
  });
  // Mimics a POI action duplicated onto a station.
  const stationActionFromPoi = generateBlankAction({
    name: "Vitest Station Action (from POI)",
    stationUuid: testStation2.uuid,
    parentActionUuid: poiAction.uuid,
  });
  const allActions: Action[] = [stationAction, poiAction, traverseAction, stationActionFromPoi];

  // Wire actionOrderUuids on named entities.
  testStation.actionOrderUuids = [stationAction.uuid];
  testStation2.actionOrderUuids = [stationActionFromPoi.uuid];
  testPoi.actionOrderUuids = [poiAction.uuid];
  testTraverse.actionOrderUuids = [traverseAction.uuid];

  // ====== EVA — sequence bookended by non-lander egress/ingress stations ======
  const testEva = generateBlankEVA({
    name: "Vitest EVA-1",
    sequence: [
      { type: "station", uuid: testStation.uuid },
      { type: "traverse", uuid: testTraverse.uuid },
      { type: "station", uuid: testStationMid.uuid },
      { type: "traverse", uuid: testTraverse2.uuid },
      { type: "station", uuid: testStation2.uuid },
    ],
    egressLocationUuid: testStation.uuid,
    ingressLocationUuid: testStation2.uuid,
  });

  // ====== REX — entries referencing named entities ======
  const testRex = generateBlankRex({
    name: "Vitest Rex-1",
    evaUuid: testEva.uuid,
    stationEntries: { [testStation.uuid]: { rexStatus: "pending" } },
    traverseEntries: { [testTraverse.uuid]: { rexStatus: "pending" } },
    actionEntries: { [stationAction.uuid]: { rexStatus: "pending" } },
  });

  // ====== EXTRA POIs with lat/lng ======
  const extraPois: POI[] = [];
  for (let i = 0; i < 3; i++) {
    const poi = generateBlankPoi({
      name: `Vitest POI-Extra-${i}`,
      location: { lat: i + 0.1, lng: i },
    });
    extraPois.push(poi);
  }
  for (let i = 0; i < extraPois.length; i++) {
    const action = generateBlankAction({
      name: `Vitest Action-POI-${i}`,
      poiUuid: extraPois[i].uuid,
    });
    action.duration = i + 6;
    allActions.push(action);
    extraPois[i].actionOrderUuids.push(action.uuid);
  }

  // ====== EXTRA STATIONS with lat/lng ======
  const extraStations: Station[] = [];
  for (let i = 0; i < 4; i++) {
    const station = generateBlankStation({
      name: `Vitest Station-${i}`,
      location: { lat: i, lng: i + 0.1 },
    });
    extraStations.push(station);
  }
  for (let i = 0; i < extraStations.length; i++) {
    const action = generateBlankAction({
      name: `Vitest Action-Station-${i}`,
      stationUuid: extraStations[i].uuid,
    });
    action.duration = i + 6;
    allActions.push(action);
    extraStations[i].actionOrderUuids.push(action.uuid);
  }

  // ====== BASE TRAVERSES (6) used in EVA sequences ======
  const baseTraverses: Traverse[] = [];
  for (let i = 0; i < 6; i++) {
    baseTraverses.push(generateBlankTraverse({ name: `Vitest Traverse for EVA-${i + 1}` }));
  }
  for (let i = 0; i < baseTraverses.length; i++) {
    const action = generateBlankAction({
      name: `Vitest Action-Traverse-${i}`,
      traverseUuid: baseTraverses[i].uuid,
    });
    action.duration = i + 6;
    allActions.push(action);
    baseTraverses[i].actionOrderUuids.push(action.uuid);
  }

  // ====== EVAs ======
  const eva1Egress = makeLanderStation();
  const eva1Ingress = makeLanderStation();
  const eva1 = generateBlankEVA({ name: "Vitest Eva-1 Planned with Rex" });
  eva1.sequence = [
    { uuid: eva1Egress.uuid, type: "station" },
    { uuid: baseTraverses[0].uuid, type: "traverse" },
    { uuid: extraStations[0].uuid, type: "station" },
    { uuid: baseTraverses[1].uuid, type: "traverse" },
    { uuid: extraStations[1].uuid, type: "station" },
    { uuid: baseTraverses[2].uuid, type: "traverse" },
    { uuid: extraStations[2].uuid, type: "station" },
    { uuid: baseTraverses[3].uuid, type: "traverse" },
    { uuid: eva1Ingress.uuid, type: "station" },
  ];

  const eva2Egress = makeLanderStation();
  const eva2Ingress = makeLanderStation();
  const eva2 = generateBlankEVA({ name: "Vitest Eva-2 Planned No Rex" });
  eva2.traverseRate = 2;
  eva2.sequence = [
    { uuid: eva2Egress.uuid, type: "station" },
    { uuid: baseTraverses[4].uuid, type: "traverse" },
    { uuid: extraStations[3].uuid, type: "station" },
    { uuid: baseTraverses[5].uuid, type: "traverse" },
    { uuid: eva2Ingress.uuid, type: "station" },
  ];

  // Duplicate EVA-1 with fresh entities for the REX record, so the rex EVA
  // doesn't share traverses/stations with the planned EVA.
  const allTraverses: Traverse[] = [...baseTraverses, testTraverse, testTraverse2];
  const allStations: Station[] = [
    ...extraStations,
    testStation,
    testStation2,
    testStationMid,
    eva1Egress,
    eva1Ingress,
    eva2Egress,
    eva2Ingress,
  ];

  const eva1ForRex = cloneDeep(eva1);
  eva1ForRex.name = "Vitest Eva-1 Rex Version";
  eva1ForRex.uuid = uuidv4();
  for (const seq of eva1ForRex.sequence) {
    if (seq.type === "traverse") {
      const traverse = allTraverses.find((t) => t.uuid === seq.uuid);
      if (!traverse) throw new Error(`Fixture: traverse ${seq.uuid} not found in allTraverses`);
      const dupTraverse = cloneDeep(traverse);
      dupTraverse.uuid = uuidv4();
      dupTraverse.name = traverse.name + " For Rex";
      allTraverses.push(dupTraverse);

      const action = allActions.find((a) => a.traverseUuid === seq.uuid);
      if (!action)
        throw new Error(`Fixture: action for traverse ${seq.uuid} not found in allActions`);
      const dupAction = cloneDeep(action);
      dupAction.uuid = uuidv4();
      dupAction.traverseUuid = dupTraverse.uuid;
      dupAction.name = action.name + " For Rex";
      dupTraverse.actionOrderUuids = [dupAction.uuid];
      allActions.push(dupAction);

      seq.uuid = dupTraverse.uuid;
    } else if (seq.type === "station") {
      const station = allStations.find((s) => s.uuid === seq.uuid);
      if (!station) throw new Error(`Fixture: station ${seq.uuid} not found in allStations`);
      const dupStation = cloneDeep(station);
      dupStation.uuid = uuidv4();
      dupStation.name = station.name + " For Rex";
      allStations.push(dupStation);

      const action = allActions.find((a) => a.stationUuid === seq.uuid);
      if (action) {
        const dupAction = cloneDeep(action);
        dupAction.uuid = uuidv4();
        dupAction.stationUuid = dupStation.uuid;
        dupAction.name = action.name + " For Rex";
        dupStation.actionOrderUuids = [dupAction.uuid];
        allActions.push(dupAction);
      } else {
        dupStation.actionOrderUuids = [];
      }

      seq.uuid = dupStation.uuid;
    }
  }

  // REX linked to eva1ForRex, with posEntries + entry maps referencing named entities.
  const rex1 = generateBlankRex({ name: "Vitest Rex-1 With PosEntries", evaUuid: eva1ForRex.uuid });
  rex1.posEntries = [generateBlankPosEntry({ posTypeUuids: [rex1.posTypes[0].uuid] })];

  const allPois: POI[] = [...extraPois, testPoi];
  const allEvas: Eva[] = [eva1, eva2, eva1ForRex, testEva];
  const allRexes: Rex[] = [rex1, testRex];

  // Build and return the full Mission object.
  const mission = generateBlankMission({ name: "Vitest Mission" });
  for (const poi of allPois) mission.pois[poi.uuid] = poi;
  for (const station of allStations) mission.stations[station.uuid] = station;
  for (const traverse of allTraverses) mission.traverses[traverse.uuid] = traverse;
  for (const action of allActions) mission.actions[action.uuid] = action;
  for (const eva of allEvas) mission.evas[eva.uuid] = eva;
  for (const rex of allRexes) mission.rexes[rex.uuid] = rex;

  return mission;
};

/**
 * Writes a `Mission` object into an Automerge DocHandle
 * Use this for server-side / integration tests where you need a full mission
 */
export const writeMissionDataToAutomergeDocHandle = (
  mission: Mission,
  docHandle: { change: (fn: (doc: Mission) => void) => void }
): void => {
  docHandle.change((doc: Mission) => {
    for (const poi of Object.values(mission.pois)) doc.pois[poi.uuid] = cloneDeep(poi);
    for (const station of Object.values(mission.stations))
      doc.stations[station.uuid] = cloneDeep(station);
    for (const traverse of Object.values(mission.traverses))
      doc.traverses[traverse.uuid] = cloneDeep(traverse);
    for (const action of Object.values(mission.actions))
      doc.actions[action.uuid] = cloneDeep(action);
    for (const eva of Object.values(mission.evas)) doc.evas[eva.uuid] = cloneDeep(eva);
    for (const rex of Object.values(mission.rexes)) doc.rexes[rex.uuid] = cloneDeep(rex);
  });
};
