import { Entity, PrimaryKey, Property, ManyToOne, types as MikroTypes } from "@mikro-orm/core";
import { Mission_db } from "./_allModels";

@Entity()
export class STM_Rule_db implements STMRule_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;
  @ManyToOne(() => Mission_db) //many STM_Rules have one mission
  mission!: Mission_db;

  @Property({ type: MikroTypes.string })
  stmUuid!: string;

  @Property({ type: MikroTypes.float })
  count: number;
  @Property({ type: MikroTypes.array, columnType: "text[]" })
  verbUuids: string[];
  @Property({ type: MikroTypes.array, columnType: "text[]" })
  nounUuids: string[];
  @Property({ type: MikroTypes.array, columnType: "text[]" })
  adjectiveUuids: string[];
  @Property({ type: MikroTypes.boolean })
  verbAny: boolean;
  @Property({ type: MikroTypes.boolean })
  nounAny: boolean;
  @Property({ type: MikroTypes.boolean })
  adjectiveAny: boolean;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;
}
