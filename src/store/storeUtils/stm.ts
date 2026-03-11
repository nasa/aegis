import type { EntityData } from "@mikro-orm/postgresql";
import type { STM_Level1_db, STM_Rule_db } from "server/database/models/_allModels";
import type { STM_Level2_db } from "server/database/models/_allModels";
import type { STM_Level3_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank stm lvl 1
 * @param partialStm any fields that are to be overridden from default
 * @returns the generated stm lvl 1
 */
export const generateBlankStmLvl1 = (partialStm?: Partial<STMLevel1>): STMLevel1 => {
  const defaultNewStm: STMLevel1 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    missionId: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
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
      missionId: dbStm.missionId,
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
      missionId: storeStm.missionId,
      createdAt: new Date(storeStm.createdAt),
      updatedAt: new Date(storeStm.updatedAt),
    };
    dbStms.push(convertedRecord);
  }
  return dbStms;
}

/**
 * Generate a blank stm lvl 2
 * @param partialStm any fields that are to be overridden from default
 * @returns the generated stm lvl 2
 */
export const generateBlankStmLvl2 = (partialStm?: Partial<STMLevel2>): STMLevel2 => {
  const defaultNewStm: STMLevel2 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    level1Uuid: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
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
 * @param partialStm any fields that are to be overridden from default
 * @returns the generated stm lvl 3
 */
export const generateBlankStmLvl3 = (partialStm?: Partial<STMLevel3>): STMLevel3 => {
  const defaultNewStm: STMLevel3 = {
    uuid: uuidv4(),
    name: "",
    numbering: "",
    level2Uuid: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
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

/**
 * Generate a blank STM rule
 */
export const generateBlankStmRule = ({ stmUuid }: { stmUuid: string }): STMRule => {
  return {
    uuid: uuidv4(),
    missionId: null,
    stmUuid,
    count: 1,
    verbUuids: [],
    nounUuids: [],
    adjectiveUuids: [],
    verbAny: false,
    nounAny: false,
    adjectiveAny: false,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
};

/**
 * Converts db stmRule fks to their uuid/id arrays
 * @param dbStmRules an array of stms in mikro db format
 * @returns an a converted array of stms or a single stm
 */
export function convertStmRulesTypeDbToStore(dbStmRules: STM_Rule_db[]): STMRule[] {
  const stmRules: STMRule[] = [];
  for (const dbStm of dbStmRules) {
    const convertedStm: STMRule = {
      uuid: dbStm.uuid,
      missionId: dbStm.missionId,
      stmUuid: dbStm.stmUuid,
      count: dbStm.count,
      verbUuids: dbStm.verbUuids,
      nounUuids: dbStm.nounUuids,
      adjectiveUuids: dbStm.adjectiveUuids,
      verbAny: dbStm.verbAny,
      nounAny: dbStm.nounAny,
      adjectiveAny: dbStm.adjectiveAny,
      createdAt: dbStm.createdAt.toISOString(),
      updatedAt: dbStm.updatedAt.toISOString(),
    };
    stmRules.push(convertedStm);
  }
  return stmRules;
}

/**
 * Converts stmRules that come from the store into the db type
 * @param storeStmRules
 * @returns
 */
export function convertStmRulesTypeStoreToDb(storeStmRules: STMRule[]): EntityData<STM_Rule_db>[] {
  const dbStmRules: EntityData<STM_Rule_db>[] = [];
  for (const storeStm of storeStmRules) {
    const convertedRecord: EntityData<STM_Rule_db> = {
      uuid: storeStm.uuid,
      missionId: storeStm.missionId,
      stmUuid: storeStm.stmUuid,
      count: storeStm.count,
      verbUuids: storeStm.verbUuids,
      nounUuids: storeStm.nounUuids,
      adjectiveUuids: storeStm.adjectiveUuids,
      verbAny: storeStm.verbAny,
      nounAny: storeStm.nounAny,
      adjectiveAny: storeStm.adjectiveAny,
      createdAt: new Date(storeStm.createdAt),
      updatedAt: new Date(storeStm.updatedAt),
    };
    dbStmRules.push(convertedRecord);
  }
  return dbStmRules;
}
