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
  @Property({
    type: MikroTypes.string,
    nullable: false,
    defaultRaw: "uuid_generate_v4()",
  })
  refUuid: string; // assigned on creation and is preserved when duplication for a rex

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
  @Property({ type: MikroTypes.float, nullable: true })
  walkbackTraverseRate: number;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];
  @Property({ type: MikroTypes.float, nullable: true })
  duration: number;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;
  @Property({ type: MikroTypes.json, nullable: false, default: "{}" })
  mapCircleControls!: MapCircleControls;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;
}
