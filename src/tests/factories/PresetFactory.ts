import { Factory } from "@mikro-orm/seeder";
import { Preset_db } from "server/database/models/_allModels";
import { v4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class PresetFactory extends Factory<Preset_db> {
  model = Preset_db;
  definition(): EntityData<Preset_db> {
    const preset: Preset_db = {
      uuid: v4(),
      owner: null,
      mission: null,
      name: "Jest Test Preset",
      description: "Test Preset Description",
      mapSublayerControls: {
        Basemaps: {
          name: "Basemaps",
          sublayerUuid: v4(),
          visible: true,
          style: null,
        },
      },
      missionPreset: false,
      missionPresetDefault: false,
      mapCircleControls: {},
      layerOrder: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return preset;
  }
}

export const createTestPreset = (): Preset => {
  return {
    uuid: v4(),
    ownerId: null,
    missionId: null,
    name: "Jest Test Preset",
    description: "Test Preset Description",
    mapSublayerControls: {
      Basemaps: {
        name: "Basemaps",
        sublayerUuid: v4(),
        visible: true,
        style: null,
      },
    },
    missionPreset: false,
    missionPresetDefault: false,
    mapCircleControls: {},
    layerOrder: [],
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
