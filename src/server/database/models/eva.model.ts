import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class Eva_db implements Eva_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @Property({
    type: MikroTypes.string,
    nullable: false,
    defaultRaw: "uuid_generate_v4()",
  })
  refUuid: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  status!: StationStatus;
  @Property({ type: MikroTypes.json, nullable: true })
  sequence!: EvaSequenceItem[];
  @Property({ type: MikroTypes.text })
  description!: string;
  @Property({ type: MikroTypes.float, nullable: true })
  duration!: number;
  @Property({ type: MikroTypes.float, nullable: true })
  traverseRate!: number;
  @Property({ type: MikroTypes.float, nullable: true })
  egressDuration: number;
  @Property({ type: MikroTypes.float, nullable: true })
  ingressDuration: number;
  @Property({ type: MikroTypes.string, nullable: true })
  egressLocationUuid!: string;
  @Property({ type: MikroTypes.string, nullable: true })
  ingressLocationUuid!: string;
  @Property({ type: MikroTypes.string, nullable: true })
  traverseColor: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;
  @Property({ type: MikroTypes.string, nullable: true })
  datetime: string;
  @Property({ type: MikroTypes.boolean, nullable: false, default: false })
  showEditWarning: boolean;
  @Property({ type: MikroTypes.text, nullable: true })
  editWarningMsg: string;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
