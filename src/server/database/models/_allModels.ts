// import all models here so that they can be exported from a single file. This avoids circular dependency issues
// The order of imports is important. Models that are referenced by other models must be imported first.
import { Action_db, Action_dbSchema } from "./action.model";
import { App_User_db, App_User_dbSchema } from "./app_user.model";
import {
  Automerge_Document_Revision_db,
  Automerge_Document_Revision_dbSchema,
} from "./automerge_document_revision.model";
import { Automerge_Native_db, Automerge_Native_dbSchema } from "./automerge_native.model";
import {
  Automerge_Operational_State_db,
  Automerge_Operational_State_dbSchema,
} from "./automerge_operational_state.model";
import { Doc_Listing_db, Doc_Listing_dbSchema } from "./doc_listing.model";
import { EnvironmentConfig_db, EnvironmentConfig_dbSchema } from "./environmentConfig.model";
import { Eva_db, Eva_dbSchema } from "./eva.model";
import { Folder_db, Folder_dbSchema } from "./folder.model";
import { Grid_db, Grid_dbSchema } from "./grid.model";
import { Layer_db, Layer_dbSchema } from "./layer.model";
import { Poi_db, Poi_dbSchema } from "./poi.model";
import { Preset_db, Preset_dbSchema } from "./preset.model";
import { Rex_db, Rex_dbSchema } from "./rex.model";
import { Station_db, Station_dbSchema } from "./station.model";
import { STM_Level1_db, STM_Level1_dbSchema } from "./stm_level1.model";
import { STM_Level2_db, STM_Level2_dbSchema } from "./stm_level2.model";
import { STM_Level3_db, STM_Level3_dbSchema } from "./stm_level3.model";
import { STM_Rule_db, STM_Rule_dbSchema } from "./stm_rules.model";
import { Sublayer_db, Sublayer_dbSchema } from "./sublayer.model";
import { Traverse_db, Traverse_dbSchema } from "./traverse.model";

export const allSchemas = [
  Action_dbSchema,
  App_User_dbSchema,
  Automerge_Document_Revision_dbSchema,
  Automerge_Native_dbSchema,
  Automerge_Operational_State_dbSchema,
  Doc_Listing_dbSchema,
  EnvironmentConfig_dbSchema,
  Eva_dbSchema,
  Folder_dbSchema,
  Grid_dbSchema,
  Layer_dbSchema,
  Poi_dbSchema,
  Preset_dbSchema,
  Rex_dbSchema,
  Station_dbSchema,
  STM_Level1_dbSchema,
  STM_Level2_dbSchema,
  STM_Level3_dbSchema,
  STM_Rule_dbSchema,
  Sublayer_dbSchema,
  Traverse_dbSchema,
];

export {
  App_User_db,
  Station_db,
  Poi_db,
  Action_db,
  Eva_db,
  Automerge_Document_Revision_db,
  Automerge_Operational_State_db,
  Layer_db,
  Preset_db,
  Rex_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  Traverse_db,
  STM_Rule_db,
  Folder_db,
  Grid_db,
  Doc_Listing_db,
  Automerge_Native_db,
  EnvironmentConfig_db,
};
