import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Poi_db } from "server/database/models/_allModels";
import { convertPoisTypeStoreToDb, generateBlankPoi } from "store/storeUtils/poi";

export default class PoiFactory extends Factory<Poi_db> {
  model = Poi_db;
  definition(): EntityData<Poi_db> {
    const poi = convertPoisTypeStoreToDb([generateBlankPoi({ name: "Jest Poi-1" })])[0];
    return poi;
  }
}
