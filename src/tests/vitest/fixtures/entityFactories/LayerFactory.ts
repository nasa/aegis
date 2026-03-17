import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Layer_db } from "server/database/models/_allModels";
import { convertLayersTypeStoreToDb, generateBlankLayer } from "store/storeUtils/layer";

export default class LayerFactory extends Factory<Layer_db> {
  model = Layer_db;
  definition(): EntityData<Layer_db> {
    const layer = convertLayersTypeStoreToDb([
      generateBlankLayer({ name: "Vitest Test Layer" }),
    ])[0];
    return layer;
  }
}
