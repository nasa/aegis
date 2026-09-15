/**
 * Data-level validation for an incoming `sendMDAU` payload.
 *
 * Schema validation only proves the payload is structurally
 * well-formed; these checks prove its contents are valid
 */
import type { MDAU } from "./types/mdau";

/** A single data-validation failure. */
export interface MdauValidationError {
  /** path into the MDAU payload that caused the failure. */
  path: string;
  /** description including the offending value. */
  message: string;
}

/**
 * A single validation rule. Receives mission and mdau payload, and
 * returns every failure it found (an empty array means it passed).
 *
 * Add new rules by writing one of these and adding it in
 * `MDAU_DATA_CHECKS` array.
 */
type MdauDataCheck = (mission: Mission, mdau: MDAU.MaestroDataAegisUses) => MdauValidationError[];

/**
 * Every `actionDefinition` uuid an action references must exist in the
 * mission's verb/noun/adjective catalogs.
 */
const checkActionDefinitions: MdauDataCheck = (mission, mdau) => {
  const errors: MdauValidationError[] = [];
  const definitions = mission.actionDefinitions;
  const fields: [keyof ActionDefinition, ActionDefinitionType][] = [
    ["verbUuid", "verbs"],
    ["nounUuid", "nouns"],
    ["adjectiveUuid", "adjectives"],
  ];

  for (const refUuid in mdau.aegisAction ?? {}) {
    const actionDefinition = mdau.aegisAction[refUuid].actionDefinition;
    if (!actionDefinition) continue;

    for (const [field, catalog] of fields) {
      const value = actionDefinition[field];
      if (!value) continue;
      if (!definitions?.[catalog]?.[value]) {
        errors.push({
          path: `aegisAction.${refUuid}.actionDefinition.${field}`,
          message: `actionDefinitionExists - ${value} does not match any ${catalog} definition on the mission`,
        });
      }
    }
  }

  return errors;
};

/** All the data-validation rules to run, run in order. */
const MDAU_DATA_CHECKS: MdauDataCheck[] = [checkActionDefinitions];

/**
 * Run data-validation rules against a mdau payload.
 *
 * @returns every failure found across all rules. An empty array means the
 *          payload is safe to process.
 */
export const mdauDataValidator = (
  mission: Mission,
  mdau: MDAU.MaestroDataAegisUses
): MdauValidationError[] => MDAU_DATA_CHECKS.flatMap((check) => check(mission, mdau));
