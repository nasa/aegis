/**
 * Legacy MikroORM schemas pinned to the staged migration boundaries:
 * `mission_db` immediately before `Migration20260416000000-manual`, and the remaining
 * entity tables immediately before `Migration20260828000000_manual` (August 28, 2026).
 *
 * These schemas exist only for bootstrap and historical Automerge migrations. They describe
 * database dumps from before their respective cutover dates, not the runtime database schema.
 */
import { defineEntity, p } from "@mikro-orm/postgresql";

export const LegacyMissionDbSchema = defineEntity({
  name: "LegacyMissionDb",
  tableName: "mission_db",
  properties: {
    id: p.integer().primary(),
    name: p.text(),
    description: p.text(),
    missionBanner: p.text().nullable(),
    actionSystemVersion: p.integer().default(1),
    landerLocation: p.json<AEGISPoint>().nullable(),
    traverseRate: p.float().nullable(),
    landerElevationMeters: p.float().nullable(),
    defaultEvaDuration: p.float().nullable(),
    walkbackRate: p.float().nullable().default(2),
    equipmentItems: p.json<EquipmentItems>().nullable(),
    geographicUnits: p.json<GeographicUnits>().nullable(),
    activeGridUuid: p.string().nullable(),
    planetRadius: p.float().nullable(),
    initialZoom: p.float().nullable(),
    demFilePath: p.text().nullable(),
    demResolution: p.float().nullable(),
    projIsCustom: p.boolean().default(false),
    projEpsg: p.text().nullable(),
    projProj4String: p.text().nullable(),
    projBoundsMinX: p.float().nullable(),
    projBoundsMinY: p.float().nullable(),
    projBoundsMaxX: p.float().nullable(),
    projBoundsMaxY: p.float().nullable(),
    projOriginX: p.float().nullable(),
    projOriginY: p.float().nullable(),
    projResZoomLevel: p.float().nullable(),
    projResUnitsPerPixel: p.float().nullable(),
    circleDefinitions: p.json<CircleDefinitions>().nullable(),
    actionTemplates: p.json<ActionTemplates>().nullable(),
    stmLevel1Enabled: p.boolean().default(true),
    stmLevel1Name: p.text().nullable().default("Goal"),
    stmLevel2Name: p.text().nullable().default("Objective"),
    stmLevel3Name: p.text().nullable().default("Investigation"),
    actionDefinitions: p.json<ActionDefinitions>().nullable(),
    isArchived: p.boolean().default(false),
    usingLGRSCoordinates: p.boolean().default(false),
    createdAt: p.double(),
    updatedAt: p.double(),
    version: p.integer().version(),
  },
});

export class LegacyMissionDb extends LegacyMissionDbSchema.class {}
LegacyMissionDbSchema.setClass(LegacyMissionDb);

export const Action_dbSchema = defineEntity({
  name: "Action_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    poi: () => p.manyToOne(Poi_db).nullable().updateRule("cascade").deleteRule("set null"),
    station: () => p.manyToOne(Station_db).nullable().updateRule("cascade").deleteRule("set null"),
    traverse: () =>
      p.manyToOne(Traverse_db).nullable().updateRule("cascade").deleteRule("set null"),
    parentAction: () =>
      p.manyToOne(Action_db).nullable().updateRule("cascade").deleteRule("set null"),
    parentCopyDate: p.double().$type<number>().nullable(),
    name: p.text(),
    priority: p.integer().nullable(),
    stmPriorities: p.json<StmPriorities>().nullable(),
    type: p.string().$type<ActionType>(),
    stmAction: p.boolean().default(false),
    actionDefinition: p.json<ActionDefinition>().nullable(),
    description: p.text(),
    descriptionTask: p.text().nullable(),
    icon: p.string().nullable(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    duration: p.float().nullable(),
    equipmentItemsUsage: p.json<EquipmentItemUsages>().nullable(),
    geographicUnitsUsage: p.json<string[]>().nullable(),
    mass: p.float().nullable(),
    status: p.string().$type<POIStatus>(),
    enabled: p.boolean().default(true),
    crewAssigned: p.json<Crew[]>().nullable(),
    createdAt: p.double().$type<number>(),
    updatedAt: p.double().$type<number>(),
    version: p.integer().version(),
  },
});

export class Action_db extends Action_dbSchema.class implements Action_db_type {}
Action_dbSchema.setClass(Action_db);

export const Eva_dbSchema = defineEntity({
  name: "Eva_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    name: p.text(),
    status: p.string().$type<StationStatus>(),
    sequence: p.json<EvaSequenceItem[]>().nullable(),
    description: p.text(),
    duration: p.float().nullable(),
    traverseRate: p.float().nullable(),
    egressDuration: p.float().nullable(),
    ingressDuration: p.float().nullable(),
    egressLocationUuid: p.string().nullable(),
    ingressLocationUuid: p.string().nullable(),
    traverseColor: p.string().nullable(),
    ownerId: p.integer().nullable(),
    datetime: p.string().nullable(),
    showEditWarning: p.boolean().default(false),
    editWarningMsg: p.text().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Eva_db extends Eva_dbSchema.class implements Eva_db_type {}
Eva_dbSchema.setClass(Eva_db);

export const Poi_dbSchema = defineEntity({
  name: "Poi_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer(),
    station: () => p.manyToMany(Station_db).mappedBy("poi"),
    name: p.text(),
    description: p.text(),
    priorityOverride: p.integer().nullable(),
    radius: p.float(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    icon: p.string().nullable(),
    tags: p.json<string[]>().nullable(),
    status: p.string().$type<POIStatus>(),
    actionOrderUuids: p.json<string[]>().nullable(),
    ownerId: p.integer().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Poi_db extends Poi_dbSchema.class implements Poi_db_type {}
Poi_dbSchema.setClass(Poi_db);

type LegacyXgressEntries = Record<string, { rexStatus: RexStatus }>;

export const Rex_dbSchema = defineEntity({
  name: "Rex_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer(),
    name: p.text(),
    description: p.text().nullable(),
    petStartStopTimestamp: p.string().nullable(),
    petValueAtStartStop: p.string().nullable(),
    petRunning: p.boolean().nullable(),
    evaUuid: p.string(),
    isRunning: p.boolean().nullable(),
    posEntries: p.json<PosEntry[]>().nullable(),
    posTypes: p.json<PosType[]>().nullable(),
    posSources: p.json<PosSource[]>().nullable(),
    stationEntries: p.json<ActivityEntries>().nullable(),
    traverseEntries: p.json<ActivityEntries>().nullable(),
    actionEntries: p.json<ActionEntries>().nullable(),
    xgressEntries: p.json<LegacyXgressEntries>().nullable(),
    ownerId: p.integer().nullable(),
    maestroControlled: p.boolean().default(false),
    maestroEventId: p.string().nullable(),
    maestroEventUrl: p.string().nullable(),
    maestroActivityPropertiesByRefUuid: p.json<MaestroActivityPropertiesByRefUuid>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Rex_db extends Rex_dbSchema.class implements Rex_db_type {}
Rex_dbSchema.setClass(Rex_db);

export const Station_dbSchema = defineEntity({
  name: "Station_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    action: () => p.oneToMany(Action_db).mappedBy("station"),
    poi: () => p.manyToMany(Poi_db).inversedBy("station").owner(),
    name: p.text(),
    status: p.string().$type<StationStatus>(),
    description: p.text(),
    radius: p.float(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    walkbackPath: p.json<AEGISPoint[]>().nullable(),
    walkbackPathSegmentDistances: p.json<number[]>().nullable(),
    walkbackPathSegmentElevations: p.json<number[][]>().nullable(),
    walkbackTraverseRate: p.float().nullable(),
    actionOrderUuids: p.json<string[]>().nullable(),
    duration: p.float().nullable(),
    icon: p.string().nullable(),
    ownerId: p.integer().nullable(),
    mapCircleControls: p.json<MapCircleControls>().default("{}"),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Station_db extends Station_dbSchema.class implements Station_db_type {}
Station_dbSchema.setClass(Station_db);

export const Traverse_dbSchema = defineEntity({
  name: "Traverse_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    action: () => p.oneToMany(Action_db).mappedBy("traverse"),
    name: p.text(),
    path: p.json<AEGISPoint[]>().nullable(),
    pathSegmentDistances: p.json<number[]>().nullable(),
    pathSegmentElevations: p.json<number[][]>().nullable(),
    duration: p.float().nullable(),
    description: p.text(),
    status: p.string().$type<TraverseStatus>().nullable(),
    traverseRate: p.float().nullable().default(null),
    color: p.string().nullable(),
    actionOrderUuids: p.json<string[]>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Traverse_db extends Traverse_dbSchema.class implements Traverse_db_type {}
Traverse_dbSchema.setClass(Traverse_db);

export const legacyAutomergeSchemas = [
  Action_dbSchema,
  Eva_dbSchema,
  Poi_dbSchema,
  Rex_dbSchema,
  Station_dbSchema,
  Traverse_dbSchema,
];
