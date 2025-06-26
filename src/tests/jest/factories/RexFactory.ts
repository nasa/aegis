import { Factory } from "@mikro-orm/seeder";
import { Rex_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class RexFactory extends Factory<Rex_db> {
  model = Rex_db;
  definition(): EntityData<Rex_db> {
    const rex: Rex_db = {
      uuid: uuidv4(),
      ownerId: null,
      mission: null,
      name: "Jest Rex-1",
      description: null,
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      evaUuid: uuidv4(),
      isRunning: false,
      posEntries: null,
      posTypes: null,
      posSources: null,
      stationEntries: null,
      traverseEntries: null,
      actionEntries: null,
      xgressEntries: null,
      maestroControlled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return rex;
  }
}
