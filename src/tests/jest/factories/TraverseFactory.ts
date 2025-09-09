import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Traverse_db } from "server/database/models/_allModels";
import { convertTraversesTypeStoreToDb, generateBlankTraverse } from "store/storeUtils/traverse";

export default class TraverseFactory extends Factory<Traverse_db> {
  model = Traverse_db;
  definition(): EntityData<Traverse_db> {
    const traverse = convertTraversesTypeStoreToDb([
      generateBlankTraverse({ name: "Jest Traverse-1" }),
    ])[0];
    return traverse;
  }
}
