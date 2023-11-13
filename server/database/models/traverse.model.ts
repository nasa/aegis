import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Mission_db } from "./_allModels";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Traverse_db implements Traverse_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  path: AEGISPoint[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentDistances: number[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentElevations: number[][];
  @Property({ type: MikroTypes.double, nullable: true })
  predictedDurationLower: number;
  @Property({ type: MikroTypes.double, nullable: true })
  predictedDurationUpper: number;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.string, nullable: true })
  status: TraverseStatus;
  @Property({ type: MikroTypes.double, nullable: true, default: null })
  traverseRate: number;
  @Property({ type: MikroTypes.string, nullable: true })
  rexStatus: RexStatus;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
