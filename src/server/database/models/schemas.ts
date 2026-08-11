import { EntitySchema } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/postgresql";

import { Action_db } from "./action.model";
import { App_User_db } from "./app_user.model";
import { Automerge_Native_db } from "./automerge_native.model";
import { Doc_Listing_db } from "./doc_listing.model";
import { EnvironmentConfig_db } from "./environmentConfig.model";
import { Eva_db } from "./eva.model";
import { Folder_db } from "./folder.model";
import { Grid_db } from "./grid.model";
import { Layer_db } from "./layer.model";
import { MissionBackup_db } from "./missionBackup.model";
import { Poi_db } from "./poi.model";
import { Preset_db } from "./preset.model";
import { Rex_db } from "./rex.model";
import { Station_db } from "./station.model";
import { STM_Level1_db } from "./stm_level1.model";
import { STM_Level2_db } from "./stm_level2.model";
import { STM_Level3_db } from "./stm_level3.model";
import { STM_Rule_db } from "./stm_rules.model";
import { Sublayer_db } from "./sublayer.model";
import { Traverse_db } from "./traverse.model";

export const Action_dbSchema = new EntitySchema<Action_db>({
  class: Action_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    refUuid: {
      type: MikroTypes.string,
      nullable: false,
      defaultRaw: "uuid_generate_v4()",
    },
    missionId: { type: MikroTypes.integer },
    poi: { kind: "m:1", entity: () => Poi_db },
    station: { kind: "m:1", entity: () => Station_db },
    traverse: { kind: "m:1", entity: () => Traverse_db },
    parentAction: { kind: "m:1", entity: () => Action_db },
    parentCopyDate: { type: MikroTypes.double, nullable: true },
    name: { type: MikroTypes.text },
    priority: { type: MikroTypes.integer, nullable: true },
    stmPriorities: { type: MikroTypes.json, nullable: true },
    type: { type: MikroTypes.string },
    stmAction: { type: MikroTypes.boolean, default: false },
    actionDefinition: { type: MikroTypes.json, nullable: true },
    description: { type: MikroTypes.text },
    descriptionTask: { type: MikroTypes.text, nullable: true },
    icon: { type: MikroTypes.string, nullable: true },
    location: { type: MikroTypes.json, nullable: true },
    elevation: { type: MikroTypes.float, nullable: true },
    duration: { type: MikroTypes.float, nullable: true },
    equipmentItemsUsage: { type: MikroTypes.json, nullable: true },
    geographicUnitsUsage: { type: MikroTypes.json, nullable: true },
    mass: { type: MikroTypes.float, nullable: true },
    status: { type: MikroTypes.string },
    enabled: { type: MikroTypes.boolean, default: true },
    crewAssigned: { type: MikroTypes.json, nullable: true },
    createdAt: { type: MikroTypes.double },
    updatedAt: { type: MikroTypes.double },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const App_User_dbSchema = new EntitySchema<App_User_db>({
  class: App_User_db,
  properties: {
    id: { type: MikroTypes.integer, primary: true },
    username: { type: MikroTypes.text },
    password: { type: MikroTypes.text },
    isSuperAdmin: { type: MikroTypes.boolean, nullable: true, default: false },
    isAdmin: { type: MikroTypes.boolean, nullable: true, default: false },
    permissionList: { type: MikroTypes.json, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

App_User_dbSchema.addHook("beforeCreate", async ({ entity }) => entity.beforeCreate());

export const Automerge_Native_dbSchema = new EntitySchema<Automerge_Native_db>({
  class: Automerge_Native_db,
  properties: {
    key: { type: MikroTypes.array, primary: true },
    value: { type: MikroTypes.uint8array, nullable: false },
  },
});

export const Doc_Listing_dbSchema = new EntitySchema<Doc_Listing_db>({
  class: Doc_Listing_db,
  properties: {
    missionId: { type: MikroTypes.integer, autoincrement: true, primary: true },
    automergeUrl: { type: MikroTypes.text, nullable: true },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const EnvironmentConfig_dbSchema = new EntitySchema<EnvironmentConfig_db>({
  class: EnvironmentConfig_db,
  properties: {
    id: { type: MikroTypes.integer, autoincrement: true, primary: true },
    key: { type: MikroTypes.text, nullable: false, unique: true },
    value: { type: MikroTypes.text, nullable: true },
    description: { type: MikroTypes.text, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Eva_dbSchema = new EntitySchema<Eva_db>({
  class: Eva_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    refUuid: {
      type: MikroTypes.string,
      nullable: false,
      defaultRaw: "uuid_generate_v4()",
    },
    missionId: { type: MikroTypes.integer },
    name: { type: MikroTypes.text },
    status: { type: MikroTypes.string },
    sequence: { type: MikroTypes.json, nullable: true },
    description: { type: MikroTypes.text },
    duration: { type: MikroTypes.float, nullable: true },
    traverseRate: { type: MikroTypes.float, nullable: true },
    egressDuration: { type: MikroTypes.float, nullable: true },
    ingressDuration: { type: MikroTypes.float, nullable: true },
    egressLocationUuid: { type: MikroTypes.string, nullable: true },
    ingressLocationUuid: { type: MikroTypes.string, nullable: true },
    traverseColor: { type: MikroTypes.string, nullable: true },
    ownerId: { type: MikroTypes.integer, nullable: true },
    datetime: { type: MikroTypes.string, nullable: true },
    showEditWarning: { type: MikroTypes.boolean, nullable: false, default: false },
    editWarningMsg: { type: MikroTypes.text, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Folder_dbSchema = new EntitySchema<Folder_db>({
  class: Folder_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    missionId: { type: MikroTypes.integer },
    name: { type: MikroTypes.text },
    type: { type: MikroTypes.text },
    items: { type: MikroTypes.json },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Grid_dbSchema = new EntitySchema<Grid_db>({
  class: Grid_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    missionId: { type: MikroTypes.integer, nullable: true },
    numRows: { type: MikroTypes.integer, nullable: true },
    numCols: { type: MikroTypes.integer, nullable: true },
    spacing: { type: MikroTypes.integer, nullable: true },
    name: { type: MikroTypes.text, nullable: true },
    fileName: { type: MikroTypes.text, nullable: true },
    isActiveGrid: { type: MikroTypes.boolean, nullable: true },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Layer_dbSchema = new EntitySchema<Layer_db>({
  class: Layer_db,
  properties: {
    uuid: { type: MikroTypes.uuid, primary: true },
    missionId: { type: MikroTypes.integer },
    name: { type: MikroTypes.text, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const MissionBackup_dbSchema = new EntitySchema<MissionBackup_db>({
  class: MissionBackup_db,
  tableName: "mission_backup_db",
  properties: {
    missionId: { type: MikroTypes.integer, primary: true },
    data: { type: MikroTypes.json, columnType: "jsonb" },
  },
});

export const Poi_dbSchema = new EntitySchema<Poi_db>({
  class: Poi_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    missionId: { type: MikroTypes.integer },
    station: { kind: "m:n", entity: () => Station_db, mappedBy: "poi" },
    name: { type: MikroTypes.text },
    description: { type: MikroTypes.text },
    priorityOverride: { type: MikroTypes.integer, nullable: true },
    radius: { type: MikroTypes.float },
    location: { type: MikroTypes.json, nullable: true },
    elevation: { type: MikroTypes.float, nullable: true },
    icon: { type: MikroTypes.string, nullable: true },
    tags: { type: MikroTypes.json, nullable: true },
    status: { type: MikroTypes.string },
    actionOrderUuids: { type: MikroTypes.json, nullable: true },
    ownerId: { type: MikroTypes.integer, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Preset_dbSchema = new EntitySchema<Preset_db>({
  class: Preset_db,
  properties: {
    uuid: { type: MikroTypes.uuid, unique: true, primary: true },
    missionId: { type: MikroTypes.integer },
    name: { type: MikroTypes.text },
    description: { type: MikroTypes.text, nullable: true },
    missionDefault: { type: MikroTypes.boolean, default: false },
    mapSublayerControls: { type: MikroTypes.json, nullable: true },
    mapCircleControls: { type: MikroTypes.json, nullable: true },
    mapGridControl: { type: MikroTypes.json, nullable: true },
    layerOrder: { type: MikroTypes.json, nullable: true },
    sunAzimuth: { type: MikroTypes.float, nullable: true },
    sunEnabled: { type: MikroTypes.boolean, nullable: true, default: true },
    earthAzimuth: { type: MikroTypes.float, nullable: true },
    earthEnabled: { type: MikroTypes.boolean, nullable: true, default: true },
    earthAsMoon: { type: MikroTypes.boolean, nullable: true, default: false },
    ownerId: { type: MikroTypes.integer, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Rex_dbSchema = new EntitySchema<Rex_db>({
  class: Rex_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    missionId: { type: MikroTypes.integer },
    name: { type: MikroTypes.text },
    description: { type: MikroTypes.text, nullable: true },
    petStartStopTimestamp: { type: MikroTypes.string, nullable: true },
    petValueAtStartStop: { type: MikroTypes.string, nullable: true },
    petRunning: { type: MikroTypes.boolean, nullable: true },
    evaUuid: { type: MikroTypes.string, nullable: false },
    isRunning: { type: MikroTypes.boolean, nullable: true },
    posEntries: { type: MikroTypes.json, nullable: true },
    posTypes: { type: MikroTypes.json, nullable: true },
    posSources: { type: MikroTypes.json, nullable: true },
    stationEntries: { type: MikroTypes.json, nullable: true },
    traverseEntries: { type: MikroTypes.json, nullable: true },
    actionEntries: { type: MikroTypes.json, nullable: true },
    xgressEntries: { type: MikroTypes.json, nullable: true },
    ownerId: { type: MikroTypes.integer, nullable: true },
    maestroControlled: { type: MikroTypes.boolean, nullable: false, default: false },
    maestroEventId: { type: MikroTypes.string, nullable: true },
    maestroEventUrl: { type: MikroTypes.string, nullable: true },
    maestroActivityPropertiesByRefUuid: { type: MikroTypes.json, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Station_dbSchema = new EntitySchema<Station_db>({
  class: Station_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    refUuid: {
      type: MikroTypes.string,
      nullable: false,
      defaultRaw: "uuid_generate_v4()",
    },
    missionId: { type: MikroTypes.integer },
    action: { kind: "1:m", entity: () => Action_db, mappedBy: "station" },
    poi: { kind: "m:n", entity: () => Poi_db, inversedBy: "station", owner: true },
    name: { type: MikroTypes.text },
    status: { type: MikroTypes.string },
    description: { type: MikroTypes.text },
    radius: { type: MikroTypes.float },
    location: { type: MikroTypes.json, nullable: true },
    elevation: { type: MikroTypes.float, nullable: true },
    walkbackPath: { type: MikroTypes.json, nullable: true },
    walkbackPathSegmentDistances: { type: MikroTypes.json, nullable: true },
    walkbackPathSegmentElevations: { type: MikroTypes.json, nullable: true },
    walkbackTraverseRate: { type: MikroTypes.float, nullable: true },
    actionOrderUuids: { type: MikroTypes.json, nullable: true },
    duration: { type: MikroTypes.float, nullable: true },
    icon: { type: MikroTypes.string, nullable: true },
    ownerId: { type: MikroTypes.integer, nullable: true },
    mapCircleControls: { type: MikroTypes.json, nullable: false, default: "{}" },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const STM_Level1_dbSchema = new EntitySchema<STM_Level1_db>({
  class: STM_Level1_db,
  properties: {
    uuid: { type: MikroTypes.string, primary: true },
    missionId: { type: MikroTypes.integer },
    level2s: { kind: "1:m", entity: () => STM_Level2_db, mappedBy: "level1" },
    name: { type: MikroTypes.text },
    numbering: { type: MikroTypes.string },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const STM_Level2_dbSchema = new EntitySchema<STM_Level2_db>({
  class: STM_Level2_db,
  properties: {
    uuid: { type: MikroTypes.string, primary: true },
    level1: { kind: "m:1", entity: () => STM_Level1_db },
    level3s: { kind: "1:m", entity: () => STM_Level3_db, mappedBy: "level2" },
    name: { type: MikroTypes.text },
    numbering: { type: MikroTypes.string },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const STM_Level3_dbSchema = new EntitySchema<STM_Level3_db>({
  class: STM_Level3_db,
  properties: {
    uuid: { type: MikroTypes.string, primary: true },
    level2: { kind: "m:1", entity: () => STM_Level2_db },
    name: { type: MikroTypes.text },
    numbering: { type: MikroTypes.string },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const STM_Rule_dbSchema = new EntitySchema<STM_Rule_db>({
  class: STM_Rule_db,
  properties: {
    uuid: { type: MikroTypes.string, primary: true },
    missionId: { type: MikroTypes.integer },
    stmUuid: { type: MikroTypes.string },
    count: { type: MikroTypes.float },
    verbUuids: { type: MikroTypes.array, columnType: "text[]" },
    nounUuids: { type: MikroTypes.array, columnType: "text[]" },
    adjectiveUuids: { type: MikroTypes.array, columnType: "text[]" },
    verbAny: { type: MikroTypes.boolean },
    nounAny: { type: MikroTypes.boolean },
    adjectiveAny: { type: MikroTypes.boolean },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Sublayer_dbSchema = new EntitySchema<Sublayer_db>({
  class: Sublayer_db,
  properties: {
    uuid: { type: MikroTypes.uuid, primary: true },
    missionId: { type: MikroTypes.integer },
    layer: { kind: "m:1", entity: () => Layer_db },
    name: { type: MikroTypes.text, nullable: true },
    description: { type: MikroTypes.text, nullable: true },
    legend: { type: MikroTypes.json, nullable: true },
    type: { type: MikroTypes.text, nullable: true },
    path: { type: MikroTypes.text, nullable: true },
    tilePattern: { type: MikroTypes.text, nullable: true },
    boundingBox: { type: MikroTypes.json, nullable: true },
    tileFormat: { type: MikroTypes.text, nullable: true },
    minNativeZoom: { type: MikroTypes.float, nullable: true },
    maxNativeZoom: { type: MikroTypes.float, nullable: true },
    maxZoom: { type: MikroTypes.float, nullable: true },
    isTimeBased: { type: MikroTypes.boolean, nullable: true },
    timeLayerManifest: { type: MikroTypes.json, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const Traverse_dbSchema = new EntitySchema<Traverse_db>({
  class: Traverse_db,
  properties: {
    uuid: { type: MikroTypes.string, unique: true, primary: true },
    refUuid: {
      type: MikroTypes.string,
      nullable: false,
      defaultRaw: "uuid_generate_v4()",
    },
    missionId: { type: MikroTypes.integer },
    action: { kind: "1:m", entity: () => Action_db, mappedBy: "traverse" },
    name: { type: MikroTypes.text },
    path: { type: MikroTypes.json, nullable: true },
    pathSegmentDistances: { type: MikroTypes.json, nullable: true },
    pathSegmentElevations: { type: MikroTypes.json, nullable: true },
    duration: { type: MikroTypes.float, nullable: true },
    description: { type: MikroTypes.text },
    status: { type: MikroTypes.string, nullable: true },
    traverseRate: { type: MikroTypes.float, nullable: true, default: null },
    color: { type: MikroTypes.string, nullable: true },
    actionOrderUuids: { type: MikroTypes.json, nullable: true },
    createdAt: { type: MikroTypes.datetime, length: 3 },
    updatedAt: { type: MikroTypes.datetime, length: 3 },
    version: { type: MikroTypes.integer, version: true },
  },
});

export const allSchemas = [
  Action_dbSchema,
  App_User_dbSchema,
  Automerge_Native_dbSchema,
  Doc_Listing_dbSchema,
  EnvironmentConfig_dbSchema,
  Eva_dbSchema,
  Folder_dbSchema,
  Grid_dbSchema,
  Layer_dbSchema,
  MissionBackup_dbSchema,
  Poi_dbSchema,
  Preset_dbSchema,
  Rex_dbSchema,
  Station_dbSchema,
  STM_Level1_dbSchema,
  STM_Level2_dbSchema,
  STM_Level3_dbSchema,
  STM_Rule_dbSchema,
  Sublayer_dbSchema,
  Traverse_dbSchema,
];
