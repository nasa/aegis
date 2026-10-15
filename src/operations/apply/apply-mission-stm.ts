import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

type StmLevelCollection = "stmLevel1s" | "stmLevel2s" | "stmLevel3s";
type StmLevelByCollection = {
  stmLevel1s: STMLevel1;
  stmLevel2s: STMLevel2;
  stmLevel3s: STMLevel3;
};

/** Remove `action.stmPriorities` keys that are not an existing level 3 uuid. */
const removeStalePriorityKeys = (m: Mission): void => {
  for (const action of Object.values(m.actions ?? {})) {
    if (!action.stmPriorities) continue;
    for (const stmUuid of Object.keys(action.stmPriorities)) {
      if (!(stmUuid in m.stmLevel3s)) delete action.stmPriorities[stmUuid];
    }
  }
};

/** Insert/replace an STM level 1, 2, or 3 item in the doc. */
export function applyUpsertStmLevel<C extends StmLevelCollection>(
  m: Mission,
  { collection, level }: { collection: C; level: StmLevelByCollection[C] }
): void {
  (m[collection] as { [uuid: string]: StmLevelByCollection[C] })[level.uuid] = cloneDeep(level);
}

/** Update the name or numbering of an STM level item. */
export function applyUpdateStmLevelByField(
  m: Mission,
  {
    collection,
    uuid,
    fieldName,
    value,
  }: {
    collection: StmLevelCollection;
    uuid: string;
    fieldName: "name" | "numbering";
    value: string;
  }
): void {
  const level = m[collection][uuid];
  if (!level) return;
  level[fieldName] = value;
  level.updatedAt = getAccurateNow().getTime();
}

/**
 * Explain why an STM level item cannot be deleted, or return null when it can.
 * An item cannot be deleted while it has child levels or STM rules assigned to it.
 */
export function getStmLevelDeleteBlocker(
  m: Mission,
  { collection, uuid }: { collection: StmLevelCollection; uuid: string }
): string | null {
  if (
    collection === "stmLevel1s" &&
    Object.values(m.stmLevel2s).some((level2) => level2.level1Uuid === uuid)
  ) {
    return "STM has a level 2 child";
  }
  if (
    collection === "stmLevel2s" &&
    Object.values(m.stmLevel3s).some((level3) => level3.level2Uuid === uuid)
  ) {
    return "STM has a level 3 child";
  }
  if (Object.values(m.stmRules).some((rule) => rule.stmUuid === uuid)) {
    return "STM has a rule assigned";
  }
  return null;
}

/**
 * Delete an STM level item. Does nothing when the item still has children or rules
 * (see `getStmLevelDeleteBlocker`). Deleting a level 3 also removes it from every action's
 * STM priorities.
 */
export function applyDeleteStmLevel(
  m: Mission,
  { collection, uuid }: { collection: StmLevelCollection; uuid: string }
): void {
  if (getStmLevelDeleteBlocker(m, { collection, uuid })) return;
  delete m[collection][uuid];
  if (collection === "stmLevel3s") removeStalePriorityKeys(m);
}

/**
 * Replace the whole STM tree with new levels. Rules and action STM priorities that point at
 * removed level 3 items are deleted, since they cannot match any new item.
 */
export function applyReplaceStmTree(
  m: Mission,
  {
    level1s,
    level2s,
    level3s,
  }: { level1s: STMLevel1[]; level2s: STMLevel2[]; level3s: STMLevel3[] }
): void {
  m.stmLevel1s = Object.fromEntries(level1s.map((level) => [level.uuid, cloneDeep(level)]));
  m.stmLevel2s = Object.fromEntries(level2s.map((level) => [level.uuid, cloneDeep(level)]));
  m.stmLevel3s = Object.fromEntries(level3s.map((level) => [level.uuid, cloneDeep(level)]));
  for (const rule of Object.values(m.stmRules)) {
    if (!(rule.stmUuid in m.stmLevel3s)) delete m.stmRules[rule.uuid];
  }
  removeStalePriorityKeys(m);
}

/** Insert/replace an STM rule in the doc. */
export function applyUpsertStmRule(m: Mission, rule: STMRule): void {
  m.stmRules[rule.uuid] = cloneDeep(rule);
}

/** Update a single STM rule field. */
export function applyUpdateStmRuleByField<K extends keyof STMRule>(
  m: Mission,
  { ruleUuid, fieldName, value }: { ruleUuid: string; fieldName: K; value: STMRule[K] }
): void {
  const rule = m.stmRules[ruleUuid];
  if (!rule) return;
  rule[fieldName] = cloneDeep(value);
  rule.updatedAt = getAccurateNow().getTime();
}

/** Delete an STM rule from the doc. */
export function applyDeleteStmRule(m: Mission, ruleUuid: string): void {
  delete m.stmRules[ruleUuid];
}
