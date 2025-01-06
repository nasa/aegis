import { Collection, Entity, ManyToMany, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/core";
import { Mission_db, Station_db } from "./_allModels";

@Entity()
export class Poi_db implements Poi_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;
  @ManyToMany(() => Station_db, (station) => station.poi) //a poi can belong to many stations
  station = new Collection<Station_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text })
  description!: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  priorityOverride: number;
  @Property({ type: MikroTypes.float })
  radius!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  location: AEGISPoint;
  @Property({ type: MikroTypes.float, nullable: true })
  elevation!: number;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;
  @Property({ type: MikroTypes.json, nullable: true })
  tags: string[];
  @Property({ type: MikroTypes.string })
  status!: POIStatus;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
