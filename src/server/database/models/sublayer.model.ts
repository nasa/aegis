import type { Layer_db } from "./_allModels";

export class Sublayer_db implements Sublayer_db_type {
  uuid: string;

  missionId!: number;

  layer!: Layer_db;

  name!: string;

  description: string;

  legend: Legend;

  type: SublayerType;

  path: string;

  tilePattern: string;

  boundingBox: number[];

  tileFormat: string;

  minNativeZoom: number;

  maxNativeZoom: number;

  maxZoom: number;

  isTimeBased: boolean;

  timeLayerManifest: TimeLayerInfo[];

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
