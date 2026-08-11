import { Collection } from "@mikro-orm/core";

import type { Station_db } from "./_allModels";

export class Poi_db implements Poi_db_type {
  uuid!: string;

  missionId!: number;
  //a poi can belong to many stations
  station = new Collection<Station_db>(this);

  name!: string;

  description!: string;

  priorityOverride: number;

  radius!: number;

  location: AEGISPoint;

  elevation!: number;

  icon: string;

  tags: string[];

  status!: POIStatus;

  actionOrderUuids: string[];

  ownerId: number;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
