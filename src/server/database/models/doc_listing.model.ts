import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Doc_Listing_db implements DocListing_db_type {
  @PrimaryKey({ type: MikroTypes.integer, autoincrement: true })
  missionId: number;
  @Property({ type: MikroTypes.text, nullable: true })
  automergeUrl: string;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
