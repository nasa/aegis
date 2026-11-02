// import all models here so that they can be exported from a single file. This avoids circular dependency issues
// The order of imports is important. Models that are referenced by other models must be imported first.
import { App_User_db, App_User_dbSchema } from "./app_user.model";
import { Automerge_Native_db, Automerge_Native_dbSchema } from "./automerge_native.model";
import { Doc_Listing_db, Doc_Listing_dbSchema } from "./doc_listing.model";
import { EnvironmentConfig_db, EnvironmentConfig_dbSchema } from "./environmentConfig.model";
import {
  Terrain_Profile_Cache_db,
  Terrain_Profile_Cache_dbSchema,
} from "./terrain_profile_cache.model";
import {
  Mission_Catalog_db,
  Mission_Catalog_dbSchema,
  Mission_Eva_Catalog_db,
  Mission_Eva_Catalog_dbSchema,
} from "./mission_catalog.model";

export const allSchemas = [
  App_User_dbSchema,
  Automerge_Native_dbSchema,
  Doc_Listing_dbSchema,
  EnvironmentConfig_dbSchema,
  Mission_Catalog_dbSchema,
  Mission_Eva_Catalog_dbSchema,
  Terrain_Profile_Cache_dbSchema,
];

export {
  App_User_db,
  Doc_Listing_db,
  Automerge_Native_db,
  EnvironmentConfig_db,
  Mission_Catalog_db,
  Mission_Eva_Catalog_db,
  Terrain_Profile_Cache_db,
};
