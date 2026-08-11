import type { STM_Level2_db } from "./_allModels";

export class STM_Level3_db implements STMLevel3_db_type {
  uuid!: string;

  //many level3s have one level2
  level2!: STM_Level2_db;

  name!: string;

  numbering!: string;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
