import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Folder_db } from "server/database/models/_allModels";
import { generateBlankFolder, convertFolderStoreToDb } from "store/storeUtils/folder";

export default class FolderFactory extends Factory<Folder_db> {
  model = Folder_db;
  definition(): EntityData<Folder_db> {
    return convertFolderStoreToDb(generateBlankFolder({ name: "Vitest Test Folder", type: "poi" }));
  }
}
