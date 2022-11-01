import { Factory } from "@mikro-orm/seeder";
import { Preset } from "../../server/database/models/preset.model";
import { v4 } from "uuid";

export default class PresetFactory extends Factory<Preset> {
  model = Preset;
  definition(): Object {
    return {
      uuid: v4(),
      layer_id_fk: 1,
      config: [
        {
          layer_group_name: "unknown",
          preset_name: "something",
          preset_values: {
            id: 1,
            opacity: 1,
            brightness: 1,
            contrast: 1,
            saturation: 1,
            blend: "normal",
          },
        },
      ],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
