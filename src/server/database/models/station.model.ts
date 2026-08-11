import { Collection } from "@mikro-orm/core";

import type { Action_db, Poi_db } from "./_allModels";

export class Station_db implements Station_db_type {
  uuid!: string;

  refUuid: string; // assigned on creation and is preserved when duplication for a rex

  missionId!: number;
  //one station has many actions
  action = new Collection<Action_db>(this);
  //many stations can have many pois
  poi = new Collection<Poi_db>(this);

  name!: string;

  status!: StationStatus;

  description!: string;

  radius!: number;

  location: AEGISPoint;

  elevation!: number;

  walkbackPath: AEGISPoint[];

  walkbackPathSegmentDistances: number[];

  walkbackPathSegmentElevations: number[][];

  walkbackTraverseRate: number;

  actionOrderUuids: string[];

  duration: number;

  icon: string;

  ownerId: number;

  mapCircleControls!: MapCircleControls;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
