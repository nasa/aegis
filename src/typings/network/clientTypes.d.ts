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

type LayerUpsertRequest = {
  missionId: number;
  layers: Layer[];
};

type LayerDeleteRequest = {
  missionId: number;
  layerUuids: string[];
};

type LogUpsertRequest = {
  missionId: number;
  logs: Log[];
};

type LogDeleteRequest = {
  missionIds: number[];
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
