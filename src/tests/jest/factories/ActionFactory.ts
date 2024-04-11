import { Factory } from "@mikro-orm/seeder";
import { Action_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";
import { convertActionsTypeStoreToDb, generateBlankAction } from "store/storeUtils/action";

export default class ActionFactory extends Factory<Action_db> {
  model = Action_db;
  definition(): EntityData<Action_db> {
    const action = convertActionsTypeStoreToDb([
      generateBlankAction({
        name: "Jest Action-1",
      }),
    ])[0];

    return action;
  }
}
