import { Factory } from "@mikro-orm/seeder";
import { Action_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";

export default class ActionFactory extends Factory<Action_db> {
  model = Action_db;
  definition(): EntityData<Action_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      poi: null,
      station: null,
      name: "Jest Action-1",
      type: "measurement",
      description: "",
      icon: "",
      location: null,
      elevation: 0,
      durationLower: 0,
      status: "Candidate",
      enabled: true,
      equipmentItemsUsage: [],
      geographicUnitsUsage: [],
      crewAssigned: null,
      priority: null,
      mass: null,
      rexStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const createTestAction = ({
  poiUuid,
  stationUuid,
}: {
  poiUuid?: string;
  stationUuid?: string;
}): Action => {
  return {
    uuid: uuidv4(),
    missionId: null,
    poiUuid: poiUuid,
    stationUuid: stationUuid,
    name: "Jest Action-1",
    type: "measurement",
    description: "",
    icon: "",
    location: null,
    elevation: 0,
    durationLower: 0,
    status: "Candidate",
    enabled: true,
    equipmentItemsUsage: [],
    geographicUnitsUsage: [],
    crewAssigned: null,
    priority: null,
    mass: null,
    rexStatus: null,
    parentActionUuid: null,
    parentCopyDate: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: null,
  };
};
