import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class Grid_db {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @Property({ type: MikroTypes.integer, nullable: true })
  missionId: number;

  @Property({ type: MikroTypes.integer, nullable: true })
  numRows!: number;
  @Property({ type: MikroTypes.integer, nullable: true })
  numCols!: number;
  @Property({ type: MikroTypes.integer, nullable: true })
  spacing!: number;
  @Property({ type: MikroTypes.text, nullable: true })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  fileName!: string;
  @Property({ type: MikroTypes.boolean, nullable: true })
  isActiveGrid!: boolean;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
