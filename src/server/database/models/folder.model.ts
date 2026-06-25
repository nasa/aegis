import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class Folder_db implements Folder_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text })
  type!: FolderType;
  @Property({ type: MikroTypes.json })
  items!: string[]; // uuids of items in this folder

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
