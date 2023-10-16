import { Factory } from "@mikro-orm/seeder";
import { Preset_db } from "server/database/models/_allModels";
import { v4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class PresetFactory extends Factory<Preset_db> {
  model = Preset_db;
  definition(): EntityData<Preset_db> {
    return {
      uuid: v4(),
      owner: null,
      mission: null,
      name: "Jest Test Preset",
      description: "Test Preset Description",
      mapSublayerControls: {
        Basemaps: {
          name: "Basemaps",
          type: "header",
          style: {
            opacity: 1,
            contrast: 1,
            brightness: 1,
            saturation: 1,
            blend: "normal",
          },
          enabled: false,
          expanded: true,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
