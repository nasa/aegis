export class Preset_db implements Preset_db_type {
  uuid!: string;

  missionId!: number;

  name: string;

  description: string;

  missionDefault: boolean;

  mapSublayerControls!: MapSublayerControls;

  mapCircleControls!: MapCircleControls;

  mapGridControl!: MapGridControl;

  layerOrder: PresetLayerOrder[];

  sunAzimuth: number;

  sunEnabled: boolean;

  earthAzimuth: number;

  earthEnabled: boolean;

  earthAsMoon: boolean;

  ownerId: number;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
