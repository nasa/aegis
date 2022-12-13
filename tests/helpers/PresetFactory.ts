import { Factory } from "@mikro-orm/seeder";
import { Preset } from "../../server/database/models/preset.model";
import { v4 } from "uuid";

export default class PresetFactory extends Factory<Preset> {
  model = Preset;
  definition(): Object {
    return {
      uuid: v4(),
      layer_id_fk: 1,
      name: "Test Preset",
      description: "Test Preset Description",
      owner: 1,
      mission: "",
      layerControls: {
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
          mapLayerRef: null,
        },
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
