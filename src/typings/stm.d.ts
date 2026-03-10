/**
 * Science Traceability Matrix (STM) shaped like:
 *
 * 1. Mission A (e.g. Artemis 3)
 *    1. Level1 1
 *       a. Level2 1a
 *          1. Level3 1a-1
 *          2. Level3 1a-2
 *       b. Level2 1b
 *       c. Level2 1c
 *    2. Level1 2
 * 2. Mission B
 *    1. ...
 */

type STMLevel3 = {
  uuid: string; //unique identifier
  numbering: string; // e.g. "1"
  name: string; // e.g. "Inventory, relationships, and ages of nonmare rocks"
  level2Uuid: string;
  createdAt?: string;
  updatedAt?: string;
};
type STMLevel2 = {
  uuid: string;
  numbering: string; // e.g. "a"
  name: string; // e.g. "Differentiation: Magma Oceans, Crust, and Mantle"
  level1Uuid: string;
  createdAt?: string;
  updatedAt?: string;
};
type STMLevel1 = {
  uuid: string;
  numbering: string; // e.g. "1"
  name: string; // Understanding Planetary Processes
  missionId: number;
  createdAt?: string;
  updatedAt?: string;
};

type STMLevel1_db_type = Omit<STMLevel1, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

type STMLevel2_db_type = Omit<STMLevel2, "level1Uuid" | "createdAt" | "updatedAt"> & {
  level1: STMLevel1_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMLevel3_db_type = Omit<STMLevel3, "level2Uuid" | "createdAt" | "updatedAt"> & {
  level2: STMLevel2_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMRule = {
  uuid: string;
  missionId: number;
  stmUuid: string;
  count: number;
  verbUuids: string[];
  nounUuids: string[];
  adjectiveUuids: string[];
  verbAny: boolean;
  nounAny: boolean;
  adjectiveAny: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type STMRule_db_type = Omit<STMRule, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};
