import { Collection } from "@mikro-orm/core";

import type { STM_Level2_db } from "./_allModels";

export class STM_Level1_db implements STMLevel1_db_type {
  uuid!: string;

  missionId!: number;
  //one level1 has many level2s
  level2s = new Collection<STM_Level2_db>(this);

  name!: string;

  numbering!: string;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
