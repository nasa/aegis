import { Collection } from "@mikro-orm/core";

import type { Action_db } from "./_allModels";

export class Traverse_db implements Traverse_db_type {
  uuid!: string;

  refUuid: string; // assigned on creation and is preserved when duplication for a rex

  missionId!: number;
  //one traverse has many actions
  action = new Collection<Action_db>(this);

  name!: string;

  path: AEGISPoint[];

  pathSegmentDistances: number[];

  pathSegmentElevations: number[][];

  duration: number;

  description: string;

  status: TraverseStatus;

  traverseRate: number;

  color: string;

  actionOrderUuids: string[];

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
