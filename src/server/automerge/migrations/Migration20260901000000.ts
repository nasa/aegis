import type { AutomergeMigration } from "server/automerge/migrations/types";

/**
 * Add the mission priority master list plus the per-action/per-template reference to it.
 * The reference is seeded to null everywhere; the feature is v2-only, so v1 missions
 * simply keep the null value.
 */
export const Migration20260901000000: AutomergeMigration = {
  version: 20260901000000,
  name: "add-mission-priorities",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const partialMission = mission as Partial<Mission>;
      if (!("missionPriorities" in partialMission)) partialMission.missionPriorities = {};

      for (const action of Object.values(mission.actions ?? {})) {
        const partialAction = action as Partial<Action>;
        if (!("missionPriorityUuid" in partialAction)) partialAction.missionPriorityUuid = null;
      }

      for (const actionTemplate of Object.values(mission.actionTemplates ?? {})) {
        const partialTemplate = actionTemplate as Partial<ActionTemplate>;
        if (!("missionPriorityUuid" in partialTemplate)) {
          partialTemplate.missionPriorityUuid = null;
        }
      }
    });
  },
};
