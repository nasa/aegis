import { Factory } from "@mikro-orm/seeder";
import { Rex as Rex_db } from "server/database/models/rex.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class RexFactory extends Factory<Rex_db> {
  model = Rex_db;
  definition(): EntityData<Rex_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      name: "Jest Rex-1",
      description: null,
      petStartStopTimestamp: null,
      petValueAtStartStop: null,
      petRunning: null,
      selectedRexEvaUuid: null,
      rexRunning: null,
      crewPos: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
