type Mission_db = import("server/database/models/_allModels").Mission_db;
type Station_db = import("server/database/models/_allModels").Station_db;
type Poi_db = import("server/database/models/_allModels").Poi_db;
type Action_db = import("server/database/models/_allModels").Action_db;
type Eva_db = import("server/database/models/_allModels").Eva_db;
type Layer_db = import("server/database/models/_allModels").Layer_db;
type Sublayer_db = import("server/database/models/_allModels").Sublayer_db;
type Traverse_db = import("server/database/models/_allModels").Traverse_db;
type Preset_db = import("server/database/models/_allModels").Preset_db;
type Rex_db = import("server/database/models/_allModels").Rex_db;
type STM_Level1_db = import("server/database/models/_allModels").STM_Level1_db;
type STM_Level2_db = import("server/database/models/_allModels").STM_Level2_db;
type STM_Level3_db = import("server/database/models/_allModels").STM_Level3_db;
type STM_Rule_db = import("server/database/models/_allModels").STM_Rule_db;
type Grid_db = import("server/database/models/_allModels").Grid_db;
type Folder_db = import("server/database/models/_allModels").Folder_db;

// Type definitions
type UuidMap = Map<string, string>;
type EntityMaps = {
  stations: UuidMap;
  pois: UuidMap;
  actions: UuidMap;
  evas: UuidMap;
  layers: UuidMap;
  sublayers: UuidMap;
  traverses: UuidMap;
  presets: UuidMap;
  rexes: UuidMap;
  stmLevel1s: UuidMap;
  stmLevel2s: UuidMap;
  stmLevel3s: UuidMap;
  stmRules: UuidMap;
  grids: UuidMap;
  folders: UuidMap;
};

type MissionDump = {
  exportDate: string;
  missionData: MissionSourceData;
};

type MissionSourceData = {
  mission: Mission_db;
  stations: Station_db[];
  pois: Poi_db[];
  actions: Action_db[];
  evas: Eva_db[];
  layers: Layer_db[];
  sublayers: Sublayer_db[];
  traverses: Traverse_db[];
  presets: Preset_db[];
  rexes: Rex_db[];
  stmLevel1s?: STM_Level1_db[];
  stmLevel2s?: STM_Level2_db[];
  stmLevel3s?: STM_Level3_db[];
  stmRules?: STM_Rule_db[];
  grids: Grid_db[];
  folders: Folder_db[];
};

interface MissionCopyOptions {
  nameSuffix: string;
  copyAssets?: boolean;
}

// Type for STM entities return
interface StmEntitiesResult {
  stmLevel1s: STM_Level1_db[];
  stmLevel2s: STM_Level2_db[];
  stmLevel3s: STM_Level3_db[];
  stmRules: STM_Rule_db[];
}

// Type definitions for REX entries (assuming these exist elsewhere or should be defined here)
// Replace with actual definitions if available
type DupStationEntries = Record<string, ActivityEntry>;
type DupTraverseEntries = Record<string, ActivityEntry>;
type DupActionEntries = Record<string, ActionEntry>;
