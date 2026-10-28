/** Versioned backup of rules; referenced STM and action definitions must already exist. */
export const exportStmRules = (mission: Mission): string =>
  JSON.stringify(
    {
      version: 1,
      missionId: mission.id,
      missionName: mission.name,
      stmRules: Object.values(mission.stmRules ?? {}).sort((a, b) => a.uuid.localeCompare(b.uuid)),
    },
    null,
    2
  );

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !["__proto__", "constructor", "prototype"].includes(value);

/** Validate every row before allowing an atomic replacement. No coercion or partial imports. */
export function parseStmRules(json: string, mission: Mission): STMRule[] {
  const file: unknown = JSON.parse(json);
  if (!isObject(file) || file.version !== 1 || !Array.isArray(file.stmRules)) {
    throw new Error('Expected a version 1 export with a "stmRules" array.');
  }
  const seen = new Set<string>();
  return file.stmRules.map((raw: unknown, index: number) => {
    const fail = (message: string): never => {
      throw new Error(`Rule ${index + 1}: ${message}`);
    };
    if (!isObject(raw)) return fail("must be an object.");
    if (!isId(raw.uuid) || seen.has(raw.uuid)) return fail("invalid or duplicate UUID.");
    seen.add(raw.uuid);
    if (!isId(raw.stmUuid) || !Object.hasOwn(mission.stmLevel3s, raw.stmUuid)) {
      return fail("referenced STM level 3 does not exist in this mission.");
    }
    if (!Number.isSafeInteger(raw.count) || (raw.count as number) < 1) {
      return fail("count must be a positive integer.");
    }
    for (const field of ["createdAt", "updatedAt"] as const) {
      if (typeof raw[field] !== "number" || !Number.isFinite(raw[field]) || raw[field] < 0) {
        return fail(`${field} must be a non-negative timestamp.`);
      }
    }
    const rule = {
      uuid: raw.uuid,
      stmUuid: raw.stmUuid,
      count: raw.count,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    } as STMRule;
    for (const [ids, any, category] of [
      ["verbUuids", "verbAny", "verbs"],
      ["nounUuids", "nounAny", "nouns"],
      ["adjectiveUuids", "adjectiveAny", "adjectives"],
    ] as const) {
      const values = raw[ids];
      if (!Array.isArray(values) || !values.every(isId) || new Set(values).size !== values.length) {
        return fail(`${ids} must contain unique non-empty identifiers.`);
      }
      if (typeof raw[any] !== "boolean") return fail(`${any} must be a boolean.`);
      for (const uuid of values) {
        if (!Object.hasOwn(mission.actionDefinitions?.[category] ?? {}, uuid)) {
          return fail(`${category} reference "${uuid}" does not exist in this mission.`);
        }
      }
      rule[ids] = [...values];
      rule[any] = raw[any];
    }
    return rule;
  });
}

export function applyImportStmRules(mission: Mission, json: string): number {
  const rules = parseStmRules(json, mission);
  mission.stmRules = Object.fromEntries(rules.map((rule) => [rule.uuid, rule]));
  mission.updatedAt = Date.now();
  return rules.length;
}
