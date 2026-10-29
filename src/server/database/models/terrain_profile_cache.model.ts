import { defineEntity, p } from "@mikro-orm/postgresql";
import { Doc_Listing_db } from "./doc_listing.model";

export const Terrain_Profile_Cache_dbSchema = defineEntity({
  name: "Terrain_Profile_Cache_db",
  properties: {
    missionId: p
      .manyToOne(Doc_Listing_db)
      .mapToPk()
      .fieldName("mission_id")
      .primary()
      .deleteRule("cascade"),
    entity: p.text().primary(),
    fingerprint: p.text(),
    profile: p.json<TerrainProfile>(),
  },
});

export class Terrain_Profile_Cache_db extends Terrain_Profile_Cache_dbSchema.class {}
Terrain_Profile_Cache_dbSchema.setClass(Terrain_Profile_Cache_db);
