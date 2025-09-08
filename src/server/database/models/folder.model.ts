import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/postgresql";
import { types as MikroTypes } from "@mikro-orm/postgresql";

import { Mission_db } from "./_allModels";

@Entity()
export class Folder_db implements Folder_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

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
}
