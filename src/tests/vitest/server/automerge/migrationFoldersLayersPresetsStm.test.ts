import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import type { MikroORM } from "@mikro-orm/postgresql";
import {
  Migration20261009000000,
  convertLegacyMissionTableRows,
} from "server/automerge/migrations/Migration20261009000000";
import type { LegacyMissionTableRows } from "server/automerge/migrations/Migration20261009000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankStation } from "store/storeUtils/station";
import { defaultGridStyle, defaultSublayerStyle } from "store/storeUtils/sublayer";
import { checkMissionIntegrity } from "server/automerge/checkMissionIntegrity";

const MISSION_ID = 77;
const NOW = Date.parse("2026-01-01T00:00:00Z");
const timestamps = { createdAt: NOW, updatedAt: NOW };

const emptyRows = (): LegacyMissionTableRows => ({
  folders: [],
  layers: [],
  sublayers: [],
  presets: [],
  stmLevel1s: [],
  stmLevel2s: [],
  stmLevel3s: [],
  stmRules: [],
});

/** Legacy rows that cover nulls, stale preset references, legacy styles, and orphaned items. */
const buildRows = (stationUuid: string): LegacyMissionTableRows => ({
  ...emptyRows(),
  layers: [{ uuid: "layer-1", missionId: MISSION_ID, name: null, ...timestamps }],
  sublayers: [
    {
      uuid: "sub-1",
      missionId: MISSION_ID,
      layerUuid: "layer-1",
      name: "Sublayer 1",
      description: null,
      type: "tile",
      boundingBox: null,
      tileFormat: null,
      minNativeZoom: null,
      maxNativeZoom: null,
      maxZoom: null,
      legend: null,
      path: "tiles",
      tilePattern: null,
      isTimeBased: null,
      timeLayerManifest: null,
      ...timestamps,
    },
    // references a layer that no longer exists
    {
      uuid: "sub-orphan",
      missionId: MISSION_ID,
      layerUuid: "layer-gone",
      name: "Orphan",
      description: "",
      type: "vector",
      boundingBox: null,
      tileFormat: null,
      minNativeZoom: null,
      maxNativeZoom: null,
      maxZoom: null,
      legend: null,
      path: null,
      tilePattern: null,
      isTimeBased: false,
      timeLayerManifest: null,
      ...timestamps,
    },
  ],
  presets: [
    {
      uuid: "preset-1",
      ownerId: null,
      missionId: MISSION_ID,
      name: "Preset 1",
      description: null,
      missionDefault: true,
      mapSublayerControls: {
        "sub-1": {
          name: "stale name",
          sublayerUuid: "sub-1",
          visible: true,
          // legacy halo names and no fillOpacity, as stored before the preset_db SQL backfills
          style: {
            opacity: 0.5,
            labelStrokeColor: "#ff0000",
          } as unknown as MapSublayerStyle,
        },
        "sub-deleted": {
          name: "deleted",
          sublayerUuid: "sub-deleted",
          visible: true,
          style: null,
        },
      },
      layerOrder: [{ layerUuid: "layer-deleted", sublayerUuids: ["sub-deleted"] }],
      mapCircleControls: null,
      mapGridControl: { visible: true, labelsVisible: true },
      sunAzimuth: null,
      sunEnabled: null,
      earthAzimuth: 12,
      earthEnabled: true,
      earthAsMoon: null,
      ...timestamps,
    },
  ],
  folders: [
    {
      uuid: "folder-1",
      missionId: MISSION_ID,
      name: "Stations",
      type: "station",
      items: [stationUuid, "station-gone"],
      ...timestamps,
    },
  ],
  stmLevel1s: [{ uuid: "l1", missionId: MISSION_ID, name: "L1", numbering: "1", ...timestamps }],
  stmLevel2s: [{ uuid: "l2", level1Uuid: "l1", name: "L2", numbering: "a", ...timestamps }],
  stmLevel3s: [{ uuid: "l3", level2Uuid: "l2", name: "L3", numbering: "1", ...timestamps }],
  stmRules: [
    {
      uuid: "rule-1",
      missionId: MISSION_ID,
      stmUuid: "l3",
      count: 2,
      verbUuids: [],
      nounUuids: [],
      adjectiveUuids: [],
      verbAny: true,
      nounAny: false,
      adjectiveAny: false,
      ...timestamps,
    },
  ],
});

describe("convertLegacyMissionTableRows()", () => {
  const station = generateBlankStation({ name: "Vitest Station" });
  const collections = convertLegacyMissionTableRows(buildRows(station.uuid), {
    pois: {},
    stations: { [station.uuid]: station },
    evas: {},
    circleDefinitions: null,
  });

  it("normalizes nullable layer and sublayer columns and drops orphaned sublayers", () => {
    expect(collections.layers["layer-1"].name).toBe("");
    expect(Object.keys(collections.sublayers)).toEqual(["sub-1"]);
    expect(collections.sublayers["sub-1"]).toMatchObject({
      description: "",
      isTimeBased: false,
      timeLayerManifest: [],
      tilePattern: null,
      createdAt: NOW,
    });
  });

  it("reconciles presets with the migrated layers and backfills styles", () => {
    const preset = collections.presets["preset-1"];
    expect(preset.layerOrder).toEqual([{ layerUuid: "layer-1", sublayerUuids: ["sub-1"] }]);
    expect(Object.keys(preset.mapSublayerControls)).toEqual(["sub-1"]);
    const control = preset.mapSublayerControls["sub-1"];
    expect(control.name).toBe("Sublayer 1");
    expect(control.visible).toBe(true);
    expect(control.style).toEqual({
      ...defaultSublayerStyle,
      opacity: 0.5,
      labelHaloColor: "#ff0000",
    });
    expect(control.style).not.toHaveProperty("labelStrokeColor");
    expect(preset.mapCircleControls).toEqual({});
    expect(preset.mapGridControl).toEqual({
      visible: true,
      labelsVisible: true,
      style: defaultGridStyle,
    });
    expect(preset).toMatchObject({ sunAzimuth: 0, sunEnabled: false, earthAzimuth: 12 });
  });

  it("normalizes legacy halo values and drops unknown style keys", () => {
    const rows = buildRows(station.uuid);
    rows.presets[0].mapSublayerControls["sub-1"].style = {
      labelHaloColor: "rgba(255, 0, 16, 0.5)",
      labelHaloOpacity: 0.85,
      strayKey: true,
    } as unknown as MapSublayerStyle;
    const { presets } = convertLegacyMissionTableRows(rows, {
      pois: {},
      stations: {},
      evas: {},
      circleDefinitions: null,
    });
    expect(presets["preset-1"].mapSublayerControls["sub-1"].style).toEqual({
      ...defaultSublayerStyle,
      labelHaloColor: "#ff0010",
      labelHaloOpacity: 0.2,
    });
  });

  it("builds one circle control per circle definition with backfilled styles", () => {
    const rows = buildRows(station.uuid);
    rows.presets[0].mapCircleControls = {
      "circle-1": {
        uuid: "circle-1",
        visible: true,
        style: { opacity: 0.5, fillOpacity: null } as unknown as MapSublayerStyle,
      },
      "circle-deleted": { uuid: "circle-deleted", visible: true, style: defaultSublayerStyle },
    };
    const { presets } = convertLegacyMissionTableRows(rows, {
      pois: {},
      stations: {},
      evas: {},
      circleDefinitions: {
        "circle-1": { name: "Circle 1", radius: 10 },
        "circle-2": { name: "Circle 2", radius: 20 },
      },
    });
    expect(presets["preset-1"].mapCircleControls).toEqual({
      "circle-1": {
        uuid: "circle-1",
        visible: true,
        style: { ...defaultSublayerStyle, opacity: 0.5 },
      },
      "circle-2": { uuid: "circle-2", visible: false, style: defaultSublayerStyle },
    });
  });

  it("drops folder items whose entity no longer exists", () => {
    expect(collections.folders["folder-1"].items).toEqual([station.uuid]);
  });

  it("keeps the STM tree and rules", () => {
    expect(collections.stmLevel2s["l2"].level1Uuid).toBe("l1");
    expect(collections.stmLevel3s["l3"].level2Uuid).toBe("l2");
    expect(collections.stmRules["rule-1"]).toMatchObject({ stmUuid: "l3", count: 2 });
  });
});

describe("Migration20261009000000", () => {
  /** A doc handle backed by the real Automerge engine, like the migration runner uses. */
  const makeDocHandle = (mission: Mission): DocHandle<Mission> => {
    let doc = Automerge.from(mission as unknown as Record<string, unknown>) as unknown as Mission;
    return {
      doc: () => doc,
      change: (fn: (m: Mission) => void) => {
        doc = Automerge.change(doc, fn);
      },
    } as unknown as DocHandle<Mission>;
  };

  /** Strip the new collections so the doc looks like one from before this migration. */
  const makeLegacyMission = (action: Action): Mission => {
    const mission = generateBlankMission({ id: MISSION_ID, name: "Vitest Legacy" });
    for (const key of [
      "folders",
      "layers",
      "sublayers",
      "presets",
      "stmLevel1s",
      "stmLevel2s",
      "stmLevel3s",
      "stmRules",
    ]) {
      delete (mission as unknown as Record<string, unknown>)[key];
    }
    mission.actions = { [action.uuid]: action };
    return mission;
  };

  /** ORM stub whose connection answers the table-exists and per-table queries. */
  const makeOrm = (rows: LegacyMissionTableRows, existingTables: string[]): MikroORM => {
    const tableToKey: Record<string, keyof LegacyMissionTableRows> = {
      folder_db: "folders",
      layer_db: "layers",
      sublayer_db: "sublayers",
      preset_db: "presets",
      stm_level1_db: "stmLevel1s",
      stm_level2_db: "stmLevel2s",
      stm_level3_db: "stmLevel3s",
      stm_rule_db: "stmRules",
    };
    const execute = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("to_regclass")) {
        const table = String(params[0]).replace("public.", "");
        return [{ exists: existingTables.includes(table) }];
      }
      const table = Object.keys(tableToKey).find((name) => sql.includes(`from "${name}"`));
      return rows[tableToKey[table]];
    });
    return { em: { fork: () => ({ getConnection: () => ({ execute }) }) } } as unknown as MikroORM;
  };

  it("writes every collection and removes action STM priorities for missing level 3 items", async () => {
    const action = generateBlankAction({
      name: "Vitest Action",
      stmPriorities: { l3: 1, "l3-deleted": 2 },
    });
    const docHandle = makeDocHandle(makeLegacyMission(action));
    const rows = buildRows("no-station");

    await Migration20261009000000.migrate(docHandle, {
      docListing: { missionId: MISSION_ID, automergeUrl: "automerge:test" } as AutomergeDocListing,
      orm: makeOrm(rows, [
        "folder_db",
        "layer_db",
        "sublayer_db",
        "preset_db",
        "stm_level1_db",
        "stm_level2_db",
        "stm_level3_db",
        "stm_rule_db",
      ]),
    });

    const mission = docHandle.doc();
    expect(Object.keys(mission.layers)).toEqual(["layer-1"]);
    expect(Object.keys(mission.presets)).toEqual(["preset-1"]);
    expect(Object.keys(mission.stmRules)).toEqual(["rule-1"]);
    expect(mission.folders["folder-1"].items).toEqual([]);
    expect(mission.actions[action.uuid].stmPriorities).toEqual({ l3: 1 });
    expect(checkMissionIntegrity(MISSION_ID, mission)).toEqual([]);
  });

  it("uses empty collections when the legacy tables are already dropped", async () => {
    const action = generateBlankAction({ name: "Vitest Action" });
    const docHandle = makeDocHandle(makeLegacyMission(action));

    await Migration20261009000000.migrate(docHandle, {
      docListing: { missionId: MISSION_ID, automergeUrl: "automerge:test" } as AutomergeDocListing,
      orm: makeOrm(emptyRows(), []),
    });

    const mission = docHandle.doc();
    expect(mission.presets).toEqual({});
    expect(mission.stmLevel3s).toEqual({});
  });

  it("rebuilds collections from the tables even if a failed run already wrote them", async () => {
    const mission = generateBlankMission({ id: MISSION_ID, name: "Vitest Partially Migrated" });
    mission.layers = {
      stale: { uuid: "stale", missionId: MISSION_ID, name: "Stale", ...timestamps },
    };
    const docHandle = makeDocHandle(mission);

    await Migration20261009000000.migrate(docHandle, {
      docListing: { missionId: MISSION_ID, automergeUrl: "automerge:test" } as AutomergeDocListing,
      orm: makeOrm(buildRows("x"), ["layer_db", "sublayer_db"]),
    });

    const migrated = docHandle.doc();
    expect(Object.keys(migrated.layers)).toEqual(["layer-1"]);
    expect(Object.keys(migrated.sublayers)).toEqual(["sub-1"]);
    // missing tables leave the existing collections untouched
    expect(migrated.presets).toEqual({});
  });

  it("keeps action STM priorities when the level 3 table is missing", async () => {
    const action = generateBlankAction({ name: "Vitest Action", stmPriorities: { l3: 1 } });
    const docHandle = makeDocHandle(makeLegacyMission(action));

    await Migration20261009000000.migrate(docHandle, {
      docListing: { missionId: MISSION_ID, automergeUrl: "automerge:test" } as AutomergeDocListing,
      orm: makeOrm(emptyRows(), []),
    });

    expect(docHandle.doc().actions[action.uuid].stmPriorities).toEqual({ l3: 1 });
  });
});
