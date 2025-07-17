type ActionUpsertRequest = {
  socketId: string;
  missionId: number;
  actions: Action[];
};

type ActionDeleteRequest = {
  socketId: string;
  missionId: number;
  actionUuids: string[];
};

type EvaUpsertRequest = {
  socketId: string;
  missionId: number;
  evas: Eva[];
};

type EvaDeleteRequest = {
  socketId: string;
  missionId: number;
  evaUuids: string[];
};

type GridUpsertRequest = {
  grids: MissionGrid[];
  missionId: number;
  upsertFullGrid: boolean;
};

type GridDeleteRequest = {
  gridUuid: string;
  missionId: number;
};

type LayerUpsertRequest = {
  missionId: number;
  layers: Layer[];
};

type LayerDeleteRequest = {
  missionId: number;
  layerUuids: string[];
};

type MissionUpsertRequest = {
  socketId: string;
  missions: Mission[];
};

type MissionDeleteRequest = {
  missionIds: number[];
};

type POIUpsertRequest = {
  missionId: number;
  socketId: string;
  pois: POI[];
};

type POIDeleteRequest = {
  missionId: number;
  socketId: string;
  poiUuids: string[];
};

type PresetUpsertRequest = {
  missionId: number;
  socketId: string;
  presets: Preset[];
};

type PresetDeleteRequest = {
  missionId: number;
  socketId: string;
  presetUuids: string[];
};

type RexUpsertRequest = {
  missionId: number;
  socketId: string;
  rexes: Rex[];
};

type RexDeleteRequest = {
  missionId: number;
  socketId: string;
  uuids: string[];
};

type StationUpsertRequest = {
  missionId: number;
  socketId: string;
  stations: Station[];
};

type StationDeleteRequest = {
  missionId: number;
  socketId: string;
  stationUuids: string[];
};

type STMUpsertRequest = {
  missionId: number;
  stmObjects: STMLevel1[] | STMLevel2[] | STMLevel3[];
  stmType: "Level1" | "Level2" | "Level3";
};

type STMDeleteRequest = {
  missionId: number;
  stmType: "Level1" | "Level2" | "Level3" | "ALL";
  uuids: string[];
};

type STMRuleUpsertRequest = {
  missionId: number;
  socketId: string;
  stmRules: STMRule[];
};
type STMRuleDeleteRequest = {
  missionId: number;
  socketId: string;
  stmRuleUuids: string[];
};

type SublayerUpsertRequest = {
  missionId: number;
  sublayers: Sublayer[];
};

type SublayerDeleteRequest = {
  missionId: number;
  sublayerUuids: string[];
};

type TraverseUpsertRequest = {
  missionId: number;
  socketId: string;
  traverses: Traverse[];
};

type TraverseDeleteRequest = {
  missionId: number;
  socketId: string;
  traverseUuids: string[];
};

type UserUpsertRequest = {
  users: AppUser[];
};

type UserDeleteRequest = {
  userIds: number[];
};

type FolderUpsertRequest = {
  missionId: number;
  socketId?: string;
  folders: Folder[];
};

type FolderDeleteRequest = {
  missionId: number;
  socketId?: string;
  folderUuids: string[];
};
