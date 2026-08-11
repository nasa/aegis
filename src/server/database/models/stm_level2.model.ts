import { Collection } from "@mikro-orm/core";

import type { STM_Level3_db, STM_Level1_db } from "./_allModels";

export class STM_Level2_db implements STMLevel2_db_type {
  uuid!: string;

  //many level2s have one level1
  level1!: STM_Level1_db;
  //one level2 has many level3s
  level3s = new Collection<STM_Level3_db>(this);

  name!: string;

  numbering!: string;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
