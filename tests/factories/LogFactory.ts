import { Factory } from "@mikro-orm/seeder";
import { Log as Log_db } from "server/database/models/log.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class LogFactory extends Factory<Log_db> {
  model = Log_db;
  definition(): EntityData<Log_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      type: "rexUpsert",
      payloadJson: "",
      createdAt: new Date(),
    };
  }
}
