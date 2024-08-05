import { Factory } from "@mikro-orm/seeder";
import { Rex_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class RexFactory extends Factory<Rex_db> {
  model = Rex_db;
  definition(): EntityData<Rex_db> {
    const rex: Rex_db = {
      uuid: uuidv4(),
      owner: null,
      mission: null,
      name: "Jest Rex-1",
      description: null,
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      evaUuid: null,
      isRunning: false,
      posEntries: null,
      posTypes: null,
      stationEntries: null,
      traverseEntries: null,
      actionEntries: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return rex;
  }
}
