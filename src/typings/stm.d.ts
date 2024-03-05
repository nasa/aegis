/**
 * Science Traceability Matrix (STM) shaped like:
 *
 * 1. Mission A (e.g. Artemis 3)
 *    1. Objective 1
 *       a. Goal 1a
 *          1. Investigation 1a-1
 *          2. Investigation 1a-2
 *       b. Goal 1b
 *       c. Goal 1c
 *    2. Objective 2
 * 2. Mission B
 *    1. ...
 */

type STMInvestigation = {
  uuid: string; //unique identifier
  numbering: string; // e.g. "1"
  name: string; // e.g. "Inventory, relationships, and ages of nonmare rocks"
  goalUuid: string; //goal uuid
  createdAt?: string;
  updatedAt?: string;
};
type STMGoal = {
  uuid: string;
  numbering: string; // e.g. "a"
  name: string; // e.g. "Differentiation: Magma Oceans, Crust, and Mantle"
  objectiveUuid: string; //objective uuid
  createdAt?: string;
  updatedAt?: string;
};
type STMObjective = {
  uuid: string;
  numbering: string; // e.g. "1"
  name: string; // Understanding Planetary Processes
  missionId: number;
  createdAt?: string;
  updatedAt?: string;
};

type STMObjective_db_type = Omit<STMObjective, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMGoal_db_type = Omit<STMGoal, "objectiveUuid" | "createdAt" | "updatedAt"> & {
  objective: STMObjective_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMInvestigation_db_type = Omit<STMInvestigation, "goalUuid" | "createdAt" | "updatedAt"> & {
  goal: STMGoal_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};
