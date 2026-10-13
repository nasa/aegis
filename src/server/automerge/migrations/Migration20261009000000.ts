import isEqual from "lodash/isEqual";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { defaultGridStyle } from "store/storeUtils/sublayer";
import {
  migrateLegacyCircleControlHaloStyles,
  migrateLegacyHaloStyle,
} from "store/storeUtils/preset";
import { serverLogger } from "utils/logging/serverLogger";

// Raw rows as selected below. Timestamps are converted to epoch ms in SQL.
type LegacyFolderRow = Omit<Folder, "createdAt" | "updatedAt"> & LegacyTimestamps;
type LegacyLayerRow = { uuid: string; missionId: number; name: string | null } & LegacyTimestamps;
type LegacySublayerRow = {
  uuid: string;
  missionId: number;
  layerUuid: string;
  name: string | null;
  description: string | null;
  type: SublayerType | null;
  boundingBox: number[] | null;
  tileFormat: string | null;
  minNativeZoom: number | null;
  maxNativeZoom: number | null;
  maxZoom: number | null;
  legend: Legend | null;
  path: string | null;
  tilePattern: string | null;
  isTimeBased: boolean | null;
  timeLayerManifest: TimeLayerInfo[] | null;
} & LegacyTimestamps;
type LegacyPresetRow = {
  uuid: string;
  ownerId: number | null;
  missionId: number;
  name: string;
  description: string | null;
  missionDefault: boolean;
  mapSublayerControls: MapSublayerControls | null;
  layerOrder: PresetLayerOrder[] | null;
  mapCircleControls: MapCircleControls | null;
  mapGridControl: Partial<MapGridControl> | null;
  sunAzimuth: number | null;
  sunEnabled: boolean | null;
  earthAzimuth: number | null;
  earthEnabled: boolean | null;
  earthAsMoon: boolean | null;
} & LegacyTimestamps;
type LegacyStmLevel1Row = Omit<STMLevel1, "createdAt" | "updatedAt"> & LegacyTimestamps;
type LegacyStmLevel2Row = Omit<STMLevel2, "createdAt" | "updatedAt"> & LegacyTimestamps;
type LegacyStmLevel3Row = Omit<STMLevel3, "createdAt" | "updatedAt"> & LegacyTimestamps;
type LegacyStmRuleRow = Omit<STMRule, "createdAt" | "updatedAt"> & LegacyTimestamps;
type LegacyTimestamps = { createdAt: number | string; updatedAt: number | string };

export type LegacyMissionTableRows = {
  folders: LegacyFolderRow[];
  layers: LegacyLayerRow[];
  sublayers: LegacySublayerRow[];
  presets: LegacyPresetRow[];
  stmLevel1s: LegacyStmLevel1Row[];
  stmLevel2s: LegacyStmLevel2Row[];
  stmLevel3s: LegacyStmLevel3Row[];
  stmRules: LegacyStmRuleRow[];
};

type MigratedCollections = Pick<
  Mission,
  | "folders"
  | "layers"
  | "sublayers"
  | "presets"
  | "stmLevel1s"
  | "stmLevel2s"
  | "stmLevel3s"
  | "stmRules"
>;

const COLLECTION_KEYS: (keyof MigratedCollections)[] = [
  "folders",
  "layers",
  "sublayers",
  "presets",
  "stmLevel1s",
  "stmLevel2s",
  "stmLevel3s",
  "stmRules",
];

const epoch = (column: string) => `(extract(epoch from ${column}) * 1000)::double precision`;
const timestamps = (alias: string) =>
  `${epoch(`${alias}."created_at"`)} as "createdAt", ${epoch(`${alias}."updated_at"`)} as "updatedAt"`;

// Each query reads one legacy table for one mission. STM levels 2 and 3 have no mission_id
// column, so they are scoped through their parent level.
const LEGACY_QUERIES: Record<keyof LegacyMissionTableRows, { table: string; sql: string }> = {
  folders: {
    table: "folder_db",
    sql: `select f."uuid", f."mission_id" as "missionId", f."name", f."type", f."items", ${timestamps("f")}
          from "folder_db" f where f."mission_id" = ? order by f."name"`,
  },
  layers: {
    table: "layer_db",
    sql: `select l."uuid"::text, l."mission_id" as "missionId", l."name", ${timestamps("l")}
          from "layer_db" l where l."mission_id" = ? order by l."name"`,
  },
  sublayers: {
    table: "sublayer_db",
    sql: `select s."uuid"::text, s."mission_id" as "missionId", s."layer_uuid"::text as "layerUuid",
                 s."name", s."description", s."type", s."bounding_box" as "boundingBox",
                 s."tile_format" as "tileFormat", s."min_native_zoom" as "minNativeZoom",
                 s."max_native_zoom" as "maxNativeZoom", s."max_zoom" as "maxZoom", s."legend",
                 s."path", s."tile_pattern" as "tilePattern", s."is_time_based" as "isTimeBased",
                 s."time_layer_manifest" as "timeLayerManifest", ${timestamps("s")}
          from "sublayer_db" s where s."mission_id" = ? order by s."name"`,
  },
  presets: {
    table: "preset_db",
    sql: `select p."uuid"::text, p."owner_id" as "ownerId", p."mission_id" as "missionId", p."name",
                 p."description", p."mission_default" as "missionDefault",
                 p."map_sublayer_controls" as "mapSublayerControls", p."layer_order" as "layerOrder",
                 p."map_circle_controls" as "mapCircleControls", p."map_grid_control" as "mapGridControl",
                 p."sun_azimuth" as "sunAzimuth", p."sun_enabled" as "sunEnabled",
                 p."earth_azimuth" as "earthAzimuth", p."earth_enabled" as "earthEnabled",
                 p."earth_as_moon" as "earthAsMoon", ${timestamps("p")}
          from "preset_db" p where p."mission_id" = ? order by p."name"`,
  },
  stmLevel1s: {
    table: "stm_level1_db",
    sql: `select l1."uuid", l1."mission_id" as "missionId", l1."name", l1."numbering", ${timestamps("l1")}
          from "stm_level1_db" l1 where l1."mission_id" = ? order by l1."numbering"`,
  },
  stmLevel2s: {
    table: "stm_level2_db",
    sql: `select l2."uuid", l2."level1_uuid" as "level1Uuid", l2."name", l2."numbering", ${timestamps("l2")}
          from "stm_level2_db" l2
          join "stm_level1_db" l1 on l1."uuid" = l2."level1_uuid"
          where l1."mission_id" = ? order by l2."numbering"`,
  },
  stmLevel3s: {
    table: "stm_level3_db",
    sql: `select l3."uuid", l3."level2_uuid" as "level2Uuid", l3."name", l3."numbering", ${timestamps("l3")}
          from "stm_level3_db" l3
          join "stm_level2_db" l2 on l2."uuid" = l3."level2_uuid"
          join "stm_level1_db" l1 on l1."uuid" = l2."level1_uuid"
          where l1."mission_id" = ? order by l3."numbering"`,
  },
  stmRules: {
    table: "stm_rule_db",
    sql: `select r."uuid", r."mission_id" as "missionId", r."stm_uuid" as "stmUuid", r."count",
                 r."verb_uuids" as "verbUuids", r."noun_uuids" as "nounUuids",
                 r."adjective_uuids" as "adjectiveUuids", r."verb_any" as "verbAny",
                 r."noun_any" as "nounAny", r."adjective_any" as "adjectiveAny", ${timestamps("r")}
          from "stm_rule_db" r where r."mission_id" = ? order by r."created_at"`,
  },
};

const toMs = (value: number | string): number => Number(value);

const byUuid = <T extends { uuid: string }>(items: T[]): { [uuid: string]: T } =>
  Object.fromEntries(items.map((item) => [item.uuid, item]));

/**
 * Bring a preset style object in line with the current MapSublayerStyle shape. Covers the
 * label stroke → halo rename and the fillOpacity backfill that the preset_db SQL migrations
 * applied, for databases older than those migrations, plus any other missing style field.
 */
const normalizeStyle = (
  style: Partial<MapSublayerStyle> | null | undefined,
  defaults: MapSublayerStyle
): MapSublayerStyle => {
  const legacyStyle = { ...(style ?? {}) } as MapSublayerStyle;
  migrateLegacyHaloStyle(legacyStyle);
  const definedValues = Object.fromEntries(
    Object.entries(legacyStyle).filter(([, value]) => value != null)
  );
  return { ...defaults, ...definedValues };
};

/** Drop non-numeric bounding box entries (e.g. `[null]`); an empty array means "unset". */
const normalizeBoundingBox = (boundingBox: unknown): number[] | null =>
  Array.isArray(boundingBox)
    ? boundingBox.filter((value): value is number => typeof value === "number")
    : null;

/**
 * Fill missing legend fields. Some imported legends carry `unitsName` and no `version`, and
 * some items use `value` instead of `description`.
 */
const normalizeLegend = (legend: Partial<Legend> | null): Legend | null => {
  if (!legend) return null;
  return {
    ...legend,
    legend: (legend.legend ?? []).map((item) => ({
      ...item,
      color: item?.color ?? "",
      description: item?.description ?? item?.value ?? "",
    })),
    unitsAbbr: legend.unitsAbbr ?? "",
    version: legend.version ?? "",
  };
};

/**
 * Convert the legacy SQL rows of one mission into the mission doc collections. Also performs
 * the one-time consistency cleanup that the client-side preset and folder audits used to do,
 * so presets match the mission's layers and folders only reference existing items.
 */
export const convertLegacyMissionTableRows = (
  rows: LegacyMissionTableRows,
  mission: Pick<Mission, "pois" | "stations" | "evas">
): MigratedCollections => {
  const layers = byUuid<Layer>(
    rows.layers.map((row) => ({
      uuid: row.uuid,
      missionId: row.missionId,
      name: row.name ?? "",
      createdAt: toMs(row.createdAt),
      updatedAt: toMs(row.updatedAt),
    }))
  );

  const sublayers = byUuid<Sublayer>(
    rows.sublayers
      .filter((row) => row.layerUuid in layers)
      .map((row) => ({
        uuid: row.uuid,
        missionId: row.missionId,
        layerUuid: row.layerUuid,
        type: row.type ?? "tile",
        name: row.name ?? "",
        description: row.description ?? "",
        legend: normalizeLegend(row.legend),
        path: row.path ?? "",
        tilePattern: row.tilePattern ?? null,
        boundingBox: normalizeBoundingBox(row.boundingBox),
        tileFormat: row.tileFormat ?? null,
        minNativeZoom: row.minNativeZoom ?? null,
        maxNativeZoom: row.maxNativeZoom ?? null,
        maxZoom: row.maxZoom ?? null,
        isTimeBased: row.isTimeBased ?? false,
        timeLayerManifest: row.timeLayerManifest ?? [],
        createdAt: toMs(row.createdAt),
        updatedAt: toMs(row.updatedAt),
      }))
  );

  const layersSortedByName = Object.values(layers).sort((a, b) => a.name.localeCompare(b.name));
  const sublayersSortedByName = Object.values(sublayers).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const presets = byUuid<Preset>(
    rows.presets.map((row) => {
      // Keep the stored order for layers/sublayers that still exist, then append new ones
      const layerOrder: PresetLayerOrder[] = (row.layerOrder ?? [])
        .filter((entry) => entry?.layerUuid in layers)
        .map((entry) => ({
          layerUuid: entry.layerUuid,
          sublayerUuids: (entry.sublayerUuids ?? []).filter(
            (sublayerUuid) => sublayers[sublayerUuid]?.layerUuid === entry.layerUuid
          ),
        }));
      for (const layer of layersSortedByName) {
        let entry = layerOrder.find((item) => item.layerUuid === layer.uuid);
        if (!entry) {
          entry = { layerUuid: layer.uuid, sublayerUuids: [] };
          layerOrder.push(entry);
        }
        for (const sublayer of sublayersSortedByName) {
          if (sublayer.layerUuid === layer.uuid && !entry.sublayerUuids.includes(sublayer.uuid)) {
            entry.sublayerUuids.push(sublayer.uuid);
          }
        }
      }

      const mapSublayerControls: MapSublayerControls = {};
      for (const sublayer of Object.values(sublayers)) {
        const existing = row.mapSublayerControls?.[sublayer.uuid];
        mapSublayerControls[sublayer.uuid] = {
          name: sublayer.name,
          sublayerUuid: sublayer.uuid,
          visible: existing?.visible ?? false,
          style: normalizeStyle(existing?.style, defaultSublayerStyle),
        };
      }

      const mapCircleControls: MapCircleControls = structuredClone(row.mapCircleControls ?? {});
      migrateLegacyCircleControlHaloStyles(mapCircleControls);

      return {
        uuid: row.uuid,
        ownerId: row.ownerId ?? null,
        missionId: row.missionId,
        name: row.name,
        description: row.description ?? "",
        missionDefault: row.missionDefault,
        mapSublayerControls,
        mapCircleControls,
        mapGridControl: {
          visible: row.mapGridControl?.visible ?? false,
          labelsVisible: row.mapGridControl?.labelsVisible ?? false,
          style: normalizeStyle(row.mapGridControl?.style, defaultGridStyle),
        },
        layerOrder,
        sunAzimuth: row.sunAzimuth ?? 0,
        sunEnabled: row.sunEnabled ?? false,
        earthAzimuth: row.earthAzimuth ?? 0,
        earthEnabled: row.earthEnabled ?? false,
        earthAsMoon: row.earthAsMoon ?? false,
        createdAt: toMs(row.createdAt),
        updatedAt: toMs(row.updatedAt),
      };
    })
  );

  const itemsByFolderType: Record<FolderType, { [uuid: string]: unknown }> = {
    poi: mission.pois ?? {},
    station: mission.stations ?? {},
    eva: mission.evas ?? {},
    preset: presets,
    layer: layers,
  };
  const folders = byUuid<Folder>(
    rows.folders
      .filter((row) => row.type in itemsByFolderType)
      .map((row) => ({
        uuid: row.uuid,
        missionId: row.missionId,
        name: row.name,
        type: row.type,
        items: (row.items ?? []).filter((itemUuid) => itemUuid in itemsByFolderType[row.type]),
        createdAt: toMs(row.createdAt),
        updatedAt: toMs(row.updatedAt),
      }))
  );

  const stmLevel1s = byUuid<STMLevel1>(
    rows.stmLevel1s.map((row) => ({
      ...row,
      createdAt: toMs(row.createdAt),
      updatedAt: toMs(row.updatedAt),
    }))
  );
  const stmLevel2s = byUuid<STMLevel2>(
    rows.stmLevel2s.map((row) => ({
      ...row,
      createdAt: toMs(row.createdAt),
      updatedAt: toMs(row.updatedAt),
    }))
  );
  const stmLevel3s = byUuid<STMLevel3>(
    rows.stmLevel3s.map((row) => ({
      ...row,
      createdAt: toMs(row.createdAt),
      updatedAt: toMs(row.updatedAt),
    }))
  );
  const stmRules = byUuid<STMRule>(
    rows.stmRules.map((row) => ({
      ...row,
      count: Number(row.count),
      verbUuids: row.verbUuids ?? [],
      nounUuids: row.nounUuids ?? [],
      adjectiveUuids: row.adjectiveUuids ?? [],
      createdAt: toMs(row.createdAt),
      updatedAt: toMs(row.updatedAt),
    }))
  );

  return {
    folders,
    layers,
    sublayers,
    presets,
    stmLevel1s,
    stmLevel2s,
    stmLevel3s,
    stmRules,
  };
};

export const Migration20261009000000: AutomergeMigration = {
  version: 20261009000000,
  name: "move-folders-layers-presets-stm-into-mission-documents",
  migrate: async (docHandle, { orm }) => {
    const doc = docHandle.doc();
    const missionId = doc.id;

    // A failed run can still persist some docs through the Repo's debounced saves, so while the
    // legacy tables exist the collections are always rebuilt from them rather than skipped.
    const connection = orm.em.fork().getConnection();
    const rows = {} as LegacyMissionTableRows;
    const missingTables: string[] = [];
    for (const [key, { table, sql }] of Object.entries(LEGACY_QUERIES) as [
      keyof LegacyMissionTableRows,
      { table: string; sql: string },
    ][]) {
      const [{ exists }] = (await connection.execute(
        `select to_regclass(?) is not null as "exists"`,
        [`public.${table}`]
      )) as { exists: boolean }[];
      if (!exists) {
        missingTables.push(table);
        rows[key] = [];
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows[key] = (await connection.execute(sql, [missionId])) as any;
    }

    const collections = convertLegacyMissionTableRows(rows, doc);
    const stmLevel3Uuids = new Set(Object.keys(collections.stmLevel3s));
    const tableByKey = Object.fromEntries(
      Object.entries(LEGACY_QUERIES).map(([key, { table }]) => [key, table])
    ) as Record<keyof LegacyMissionTableRows, string>;

    docHandle.change((mission: Mission) => {
      for (const key of COLLECTION_KEYS) {
        const tableExists = !missingTables.includes(tableByKey[key]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (tableExists || !(key in mission)) (mission as any)[key] = collections[key];
      }
      // STM priorities on actions are keyed by level 3 uuid; drop keys for removed levels
      if (missingTables.includes("stm_level3_db")) return;
      for (const action of Object.values(mission.actions ?? {})) {
        if (!action.stmPriorities) continue;
        for (const stmUuid of Object.keys(action.stmPriorities)) {
          if (!stmLevel3Uuids.has(stmUuid)) delete action.stmPriorities[stmUuid];
        }
      }
    });

    const counts = COLLECTION_KEYS.map(
      (key) => `${key}=${Object.keys(collections[key]).length}`
    ).join(" ");
    const droppedRows = COLLECTION_KEYS.filter(
      (key) =>
        key in rows &&
        !isEqual(
          (rows[key] as { uuid: string }[]).map((row) => row.uuid).sort(),
          Object.keys(collections[key]).sort()
        )
    );
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Mission ${missionId} folders/layers/presets/stm migration: ${counts}${
        missingTables.length > 0 ? ` (missing tables: ${missingTables.join(", ")})` : ""
      }${droppedRows.length > 0 ? ` (dropped orphaned rows in: ${droppedRows.join(", ")})` : ""}`,
    });
  },
};
