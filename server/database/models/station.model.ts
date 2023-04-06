import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";

import { Mission } from "./mission.model";
import { User } from "./user.model";
import { types as MikroTypes } from "@mikro-orm/core";
import { Poi } from "./poi.model";
import { Action } from "./action.model";

@Entity()
export class Station implements Station_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;
  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;
  @OneToMany(() => Action, (i) => i.station) //one station has many actions
  action = new Collection<Action>(this);
  @ManyToMany(() => Poi, "station", { owner: true }) //many stations can have many pois
  poi = new Collection<Poi>(this);

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.string })
  status!: StationStatus;
  @Property({ type: MikroTypes.string })
  description!: string;
  @Property({ type: MikroTypes.float })
  radius!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  location: AEGISPoint;
  @Property({ type: MikroTypes.float, nullable: true })
  elevation!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  walkbackPath: AEGISPoint[];
  @Property({ type: MikroTypes.json, nullable: true })
  walkbackPathSegmentDistances: number[];
  @Property({ type: MikroTypes.json, nullable: true })
  walkbackPathSegmentElevations: number[][];
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];
  @Property({ type: MikroTypes.double, nullable: true })
  durationLower!: number;
  @Property({ type: MikroTypes.double, nullable: true })
  durationUpper: number;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
