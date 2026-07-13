import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class EnvironmentConfig_db {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text, nullable: true })
  urlOverride: string | null = null;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number;
}
