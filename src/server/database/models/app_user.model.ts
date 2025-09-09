import { BeforeCreate, Entity, PrimaryKey, Property } from "@mikro-orm/postgresql";
import { types as MikroTypes } from "@mikro-orm/postgresql";

import * as bcrypt from "bcryptjs";

@Entity()
export class App_User_db implements AppUser_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  username!: string;
  @Property({ type: MikroTypes.text })
  password!: string;
  @Property({ type: MikroTypes.boolean, nullable: true, default: false })
  isSuperAdmin: boolean;
  @Property({ type: MikroTypes.boolean, nullable: true, default: false })
  isAdmin: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  permissionList?: Permission[];

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = bcrypt.hashSync(this.password, salt);
  }
}
