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
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      selectedRexEvaUuid: null,
      rexRunning: false,
      crewPos: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const createTestRex = (): Rex => {
  return {
    uuid: uuidv4(),
    missionId: null,
    name: "Jest Rex-1",
    description: null,
    petStartStopTimestamp: null,
    petValueAtStartStop: "+00:00:00",
    petRunning: false,
    selectedRexEvaUuid: null,
    rexRunning: false,
    crewPos: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};

export const createTestCrewPos = (): CrewPos => {
  return {
    uuid: uuidv4(),
    location: null,
    elevation: null,
    seconds: null,
    crew: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
