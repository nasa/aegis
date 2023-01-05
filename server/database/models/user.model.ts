import { BeforeCreate, Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/core";
import * as bcrypt from "bcryptjs";

@Entity()
export class User implements AEGISUser_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.string })
  username!: string;
  @Property({ type: MikroTypes.string })
  email: string;
  @Property({ type: MikroTypes.string })
  password!: string;
  @Property({ type: MikroTypes.string })
  permission: PermissionRole;
  @Property({ type: MikroTypes.string, length: 2048, nullable: true })
  token?: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;

  @Property()
  validPassword(password: string): boolean {
    return bcrypt.compareSync(password, this.password);
  }

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = await bcrypt.hash(this.password, salt);
  }
}
