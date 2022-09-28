import { BeforeCreate, BeforeUpdate, Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";

import * as bcrypt from "bcryptjs";

@Entity()
export class User {
  @PrimaryKey({ type: "number" })
  id!: number;

  @Property({ type: "string" })
  username!: string;

  @Property({ type: "string" })
  email: string;

  @Property({ type: "string" })
  password!: string;

  @Enum({ items: () => PermissionRole, type: "string" })
  permission: PermissionRole;

  @Property({ length: 2048, nullable: true, type: "string" })
  token?: string;

  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  @Property()
  validPassword(password: string) {
    return bcrypt.compareSync(password, this.password);
  }

  @BeforeCreate()
  async beforeCreate() {
    const salt = await bcrypt.genSaltSync();
    this.password = await bcrypt.hashSync(this.password, salt);
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  @BeforeUpdate()
  async beforeUpdate() {
    this.updatedAt = new Date();
  }

  constructor(username: string, password: string, email: string, permission: PermissionRole) {
    this.username = username;
    this.password = password;
    this.email = email;
    this.permission = permission;
  }
}

export enum PermissionRole {
  ADMIN = "admin",
  USER = "user",
}
