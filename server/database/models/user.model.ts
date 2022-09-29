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
  validPassword(password: string): boolean {
    return bcrypt.compareSync(password, this.password);
  }

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = await bcrypt.hash(this.password, salt);
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  @BeforeUpdate()
  async beforeUpdate(): Promise<void> {
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
