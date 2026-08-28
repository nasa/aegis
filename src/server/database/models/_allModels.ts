// import all models here so that they can be exported from a single file. This avoids circular dependency issues
// The order of imports is important. Models that are referenced by other models must be imported first.
import { App_User_db, App_User_dbSchema } from "./app_user.model";
import { Automerge_Native_db, Automerge_Native_dbSchema } from "./automerge_native.model";
import { Doc_Listing_db, Doc_Listing_dbSchema } from "./doc_listing.model";
import { EnvironmentConfig_db, EnvironmentConfig_dbSchema } from "./environmentConfig.model";
import { Folder_db, Folder_dbSchema } from "./folder.model";
import { Layer_db, Layer_dbSchema } from "./layer.model";
import { Preset_db, Preset_dbSchema } from "./preset.model";
import { STM_Level1_db, STM_Level1_dbSchema } from "./stm_level1.model";
import { STM_Level2_db, STM_Level2_dbSchema } from "./stm_level2.model";
import { STM_Level3_db, STM_Level3_dbSchema } from "./stm_level3.model";
import { STM_Rule_db, STM_Rule_dbSchema } from "./stm_rules.model";
import { Sublayer_db, Sublayer_dbSchema } from "./sublayer.model";

export const allSchemas = [
  App_User_dbSchema,
  Automerge_Native_dbSchema,
  Doc_Listing_dbSchema,
  EnvironmentConfig_dbSchema,
  Folder_dbSchema,
  Layer_dbSchema,
  Preset_dbSchema,
  STM_Level1_dbSchema,
  STM_Level2_dbSchema,
  STM_Level3_dbSchema,
  STM_Rule_dbSchema,
  Sublayer_dbSchema,
];

export {
  App_User_db,
  Layer_db,
  Preset_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  STM_Rule_db,
  Folder_db,
  Doc_Listing_db,
  Automerge_Native_db,
  EnvironmentConfig_db,
};
