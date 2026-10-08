import type { AutomergeMigration } from "server/automerge/migrations/types";

const DEFAULT_POS_SOURCE_PATH_COLORS: { [name: string]: string } = {
  Crew: "#ff0000",
  Task: "#009CE0",
  SER: "#68BC00",
};

/** Backfill `pathColor` on every REX position source; custom sources default to white. */
export const Migration20261008000000: AutomergeMigration = {
  version: 20261008000000,
  name: "add-pos-source-path-color",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const rex of Object.values(mission.rexes ?? {})) {
        for (const posSource of rex.posSources ?? []) {
          const partialPosSource = posSource as Partial<PosSource>;
          if ("pathColor" in partialPosSource) continue;
          partialPosSource.pathColor = DEFAULT_POS_SOURCE_PATH_COLORS[posSource.name] ?? "#ffffff";
        }
      }
    });
  },
};
