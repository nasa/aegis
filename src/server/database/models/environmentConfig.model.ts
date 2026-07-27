import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class EnvironmentConfig_db {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text, nullable: false, unique: true })
  key: string;
  @Property({ type: MikroTypes.text, nullable: true })
  value: string | null = null;

  @Property({ type: MikroTypes.text, nullable: true })
  description: string | null = null;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number;
}
