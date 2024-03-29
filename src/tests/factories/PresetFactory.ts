import { Factory } from "@mikro-orm/seeder";
import { Preset_db } from "server/database/models/_allModels";
import { v4 } from "uuid";
import { EntityData } from "@mikro-orm/core";
import { convertPresetsTypeStoreToDb, generateBlankPreset } from "store/storeUtils/preset";

export default class PresetFactory extends Factory<Preset_db> {
  model = Preset_db;
  definition(): EntityData<Preset_db> {
    const preset = convertPresetsTypeStoreToDb([
      generateBlankPreset({
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
      }),
    ])[0];
    return preset;
  }
}
