import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";
import { v4 as uuidv4 } from "uuid";

import { Grid_db } from "server/database/models/_allModels";

export default class GridFactory extends Factory<Grid_db> {
  model = Grid_db;
  definition(): EntityData<Grid_db> {
    return {
      uuid: uuidv4(),
      missionId: null,
      name: "Vitest Test Grid",
      numRows: 10,
      numCols: 10,
      spacing: 100,
      isActiveGrid: true,
    };
  }
}
