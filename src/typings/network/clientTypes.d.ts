type ActionUpsertRequest = {
  socketId: string;
  missionId: number;
  log: boolean;
  actions: Action[];
};

type ActionDeleteRequest = {
  socketId: string;
  missionId: number;
  log: boolean;
  actionUuids: string[];
};

type EvaUpsertRequest = {
  socketId: string;
  missionId: number;
  log: boolean;
  evas: Eva[];
};

type EvaDeleteRequest = {
  socketId: string;
  missionId: number;
  log: boolean;
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
  log: boolean;
  missions: Mission[];
};

type MissionDeleteRequest = {
  missionIds: number[];
  log: boolean;
};

type POIUpsertRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  pois: POI[];
};

type POIDeleteRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  poiUuids: string[];
};

type PresetUpsertRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  presets: Preset[];
};

type PresetDeleteRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  presetUuids: string[];
};

type RexUpsertRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  rexes: Rex[];
};

type RexDeleteRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  uuids: string[];
};

type StationUpsertRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  stations: Station[];
};

type StationDeleteRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
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
  log: boolean;
  traverses: Traverse[];
};

type TraverseDeleteRequest = {
  missionId: number;
  socketId: string;
  log: boolean;
  traverseUuids: string[];
};

type UserUpsertRequest = {
  users: User[];
};

type UserDeleteRequest = {
  userIds: number[];
};
