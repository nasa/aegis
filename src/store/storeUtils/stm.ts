import { roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { STM_Level1_db } from "server/database/models/_allModels";
import { STM_Level2_db } from "server/database/models/_allModels";
import { STM_Level3_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank stm lvl 1
 * @param partialStm any fields that are to be overriden from default
 * @returns the generated stm lvl 1
 */
export const generateBlankStmLvl1 = (partialStm?: Partial<STMLevel1>): STMLevel1 => {
  const defaultNewStm: STMLevel1 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    missionId: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  return { ...defaultNewStm, ...partialStm };
};

/**
 * Converts db stm fks to their uuid/id arrays
 * @param dbStms an array of stms in mikro db format
 * @returns an a converted array of stms or a single stm
 */
export function convertStms1TypeDbToStore(dbStms: STM_Level1_db[]): STMLevel1[] {
  const stms: STMLevel1[] = [];
  for (const dbStm of dbStms) {
    const convertedStm: STMLevel1 = {
      uuid: dbStm.uuid,
      numbering: dbStm.numbering,
      name: dbStm.name,
      missionId: dbStm.mission.id,
      createdAt: dbStm.createdAt.toISOString(),
      updatedAt: dbStm.updatedAt.toISOString(),
    };
    stms.push(convertedStm);
  }
  return stms;
}

/**
 * Converts stms that come from the store into the db type
 * @param storeStms
 * @returns
 */
export function convertStms1TypeStoreToDb(storeStms: STMLevel1[]): EntityData<STM_Level1_db>[] {
  const dbStms: EntityData<STM_Level1_db>[] = [];
  for (const storeStm of storeStms) {
    const convertedRecord: EntityData<STM_Level1_db> = {
      uuid: storeStm.uuid,
      numbering: storeStm.numbering,
      name: storeStm.name,
      mission: storeStm.missionId,
      createdAt: new Date(storeStm.createdAt),
      updatedAt: new Date(storeStm.updatedAt),
    };
    dbStms.push(convertedRecord);
  }
  return dbStms;
}

/**
 * Generate a blank stm lvl 2
 * @param partialStm any fields that are to be overriden from default
 * @returns the generated stm lvl 2
 */
export const generateBlankStmLvl2 = (partialStm?: Partial<STMLevel2>): STMLevel2 => {
  const defaultNewStm: STMLevel2 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    level1Uuid: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  return { ...defaultNewStm, ...partialStm };
};

/**
 * Converts db stm fks to their uuid/id arrays
 * @param dbStms an array of stms in mikro db format
 * @returns an a converted array of stms or a single stm
 */
export function convertStms2TypeDbToStore(dbStms: STM_Level2_db[]): STMLevel2[] {
  const stms: STMLevel2[] = [];
  for (const dbStm of dbStms) {
    const convertedStm: STMLevel2 = {
      uuid: dbStm.uuid,
      numbering: dbStm.numbering,
      name: dbStm.name,
      level1Uuid: dbStm.level1.uuid,
      createdAt: dbStm.createdAt.toISOString(),
      updatedAt: dbStm.updatedAt.toISOString(),
    };
    stms.push(convertedStm);
  }
  return stms;
}

/**
 * Converts stms that come from the store into the db type
 * @param storeStms
 * @returns
 */
export function convertStms2TypeStoreToDb(storeStms: STMLevel2[]): EntityData<STM_Level2_db>[] {
  const dbStms: EntityData<STM_Level2_db>[] = [];
  for (const storeStm of storeStms) {
    const convertedRecord: EntityData<STM_Level2_db> = {
      uuid: storeStm.uuid,
      numbering: storeStm.numbering,
      name: storeStm.name,
      level1: storeStm.level1Uuid,
      createdAt: new Date(storeStm.createdAt),
      updatedAt: new Date(storeStm.updatedAt),
    };
    dbStms.push(convertedRecord);
  }
  return dbStms;
}

/**
 * Generate a blank stm lvl 3
 * @param partialStm any fields that are to be overriden from default
 * @returns the generated stm lvl 3
 */
export const generateBlankStmLvl3 = (partialStm?: Partial<STMLevel3>): STMLevel3 => {
  const defaultNewStm: STMLevel3 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    level2Uuid: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  return { ...defaultNewStm, ...partialStm };
};

/**
 * Converts db stm fks to their uuid/id arrays
 * @param dbStms an array of stms in mikro db format
 * @returns an a converted array of stms or a single stm
 */
export function convertStms3TypeDbToStore(dbStms: STM_Level3_db[]): STMLevel3[] {
  const stms: STMLevel3[] = [];
  for (const dbStm of dbStms) {
    const convertedStm: STMLevel3 = {
      uuid: dbStm.uuid,
      numbering: dbStm.numbering,
      name: dbStm.name,
      level2Uuid: dbStm.level2.uuid,
      createdAt: dbStm.createdAt.toISOString(),
      updatedAt: dbStm.updatedAt.toISOString(),
    };
    stms.push(convertedStm);
  }
  return stms;
}

/**
 * Converts stms that come from the store into the db type
 * @param storeStms
 * @returns
 */
export function convertStms3TypeStoreToDb(storeStms: STMLevel3[]): EntityData<STM_Level3_db>[] {
  const dbStms: EntityData<STM_Level3_db>[] = [];
  for (const storeStm of storeStms) {
    const convertedRecord: EntityData<STM_Level3_db> = {
      uuid: storeStm.uuid,
      numbering: storeStm.numbering,
      name: storeStm.name,
      level2: storeStm.level2Uuid,
      createdAt: new Date(storeStm.createdAt),
      updatedAt: new Date(storeStm.updatedAt),
    };
    dbStms.push(convertedRecord);
  }
  return dbStms;
}
