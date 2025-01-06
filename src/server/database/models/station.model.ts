import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/core";
import { Action_db, Mission_db, Poi_db } from "./_allModels";

@Entity()
export class Station_db implements Station_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;
  @OneToMany(() => Action_db, (i) => i.station) //one station has many actions
  action = new Collection<Action_db>(this);
  @ManyToMany(() => Poi_db, "station", { owner: true }) //many stations can have many pois
  poi = new Collection<Poi_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  status!: StationStatus;
  @Property({ type: MikroTypes.text })
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
  @Property({ type: MikroTypes.double, nullable: true })
  walkbackTraverseRate: number;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];
  @Property({ type: MikroTypes.double, nullable: true })
  durationLower!: number;
  @Property({ type: MikroTypes.double, nullable: true })
  durationUpper: number;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
