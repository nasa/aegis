import { BeforeCreate, Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/core";
import * as bcrypt from "bcryptjs";

@Entity()
export class User implements User_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  username!: string;
  @Property({ type: MikroTypes.text })
  email: string;
  @Property({ type: MikroTypes.text })
  password!: string;
  @Property({ type: MikroTypes.string, length: 2048, nullable: true })
  token?: string;

  @Property({ type: MikroTypes.boolean, nullable: true })
  adminPermission: boolean;

  @Property({ type: MikroTypes.json, nullable: true })
  permissionList?: Permission[];

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = bcrypt.hashSync(this.password, salt);
  }
}
