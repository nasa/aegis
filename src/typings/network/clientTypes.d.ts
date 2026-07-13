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

type MissionDeleteRequest = {
  missionIds: number[];
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

type EnvironmentConfigData = {
  defaultUrl: string;
  urlOverride: string | null;
  effectiveUrl: string;
  isOverridden: boolean;
};

type AutomergeUpsertRequest = {
  automergeDocListings?: AutomergeDocListing[];
};

type AutomergeDeleteRequest = {
  missionIds: number[];
};
