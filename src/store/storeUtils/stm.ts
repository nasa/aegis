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
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewStm, ...partialStm };
};

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
    level1Uuid: "",
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewStm, ...partialStm };
};

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
    level2Uuid: "",
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewStm, ...partialStm };
};

/**
 * Generate a blank STM rule
 */
export const generateBlankStmRule = ({ stmUuid }: { stmUuid: string }): STMRule => {
  return {
    uuid: uuidv4(),
    stmUuid,
    count: 1,
    verbUuids: [],
    nounUuids: [],
    adjectiveUuids: [],
    verbAny: false,
    nounAny: false,
    adjectiveAny: false,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
};
