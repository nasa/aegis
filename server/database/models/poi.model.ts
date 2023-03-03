import { Collection, Entity, ManyToMany, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";

import { Mission } from "./mission.model";
import { User } from "./user.model";
import { types as MikroTypes } from "@mikro-orm/core";
import { Station } from "./station.model";

@Entity()
export class Poi implements Poi_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;
  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;
  @ManyToMany(() => Station, (station) => station.poi) //a poi can belong to many stations
  station = new Collection<Station>(this);

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.text })
  description!: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  priorityOverride: number;
  @Property({ type: MikroTypes.float })
  radius!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  location: AEGISPoint;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;
  @Property({ type: MikroTypes.json, nullable: true })
  tags: string[];
  @Property({ type: MikroTypes.string })
  status!: POIStatus;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
