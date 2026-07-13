import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Automerge_Native_db {
  @PrimaryKey({ type: MikroTypes.array })
  key: Uint8Array[];
  @Property({ type: MikroTypes.uint8array, nullable: false })
  value: Uint8Array;
}
