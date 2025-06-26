import { Collection, Entity, ManyToOne, OneToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { Mission_db, Action_db } from "./_allModels";
import { types as MikroTypes } from "@mikro-orm/core";
@Entity()
export class Traverse_db implements Traverse_db_type {
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
  @OneToMany(() => Action_db, (i) => i.traverse) //one traverse has many actions
  action = new Collection<Action_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  path: AEGISPoint[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentDistances: number[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentElevations: number[][];
  @Property({ type: MikroTypes.float, nullable: true })
  duration: number;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.string, nullable: true })
  status: TraverseStatus;
  @Property({ type: MikroTypes.float, nullable: true, default: null })
  traverseRate: number;
  @Property({ type: MikroTypes.string, nullable: true })
  color: string;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
