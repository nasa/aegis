import * as fs from "node:fs";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import { serverLogger } from "utils/logging/serverLogger";

type LegacyGridRow = {
  uuid: string;
  numRows: number | null;
  numCols: number | null;
  spacing: number | string | null;
  name: string | null;
  fileName: string | null;
  isActiveGrid: boolean | null;
};

export const Migration20260722000000: AutomergeMigration = {
  version: 20260722000000,
  name: "move-grid-into-mission-documents",
  migrate: async (docHandle, { orm }) => {
    const doc = docHandle.doc();
    const missionId = doc.id;

    if ("serverFileGrid" in doc && !("activeGridUuid" in doc)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyActiveUuid: string | null = (doc as any).activeGridUuid ?? null;
    let rows: LegacyGridRow[] = [];
    let tableExists = true;
    try {
      const em = orm.em.fork();
      rows = (await em.getConnection().execute(
        `select "uuid", "num_rows" as "numRows", "num_cols" as "numCols", "spacing",
                "name", "file_name" as "fileName", "is_active_grid" as "isActiveGrid"
         from "grid_db" where "mission_id" = ?`,
        [missionId]
      )) as LegacyGridRow[];
    } catch {
      tableExists = false;
    }

    let chosen: LegacyGridRow | undefined;
    let outcome: string;
    if (legacyActiveUuid) chosen = rows.find((row) => row.uuid === legacyActiveUuid);
    if (!chosen) chosen = rows.find((row) => row.isActiveGrid);
    if (!chosen && rows.length === 1) chosen = rows[0];
    if (!chosen && rows.length > 1) {
      chosen = rows[0];
      outcome = `ambiguous (${rows.length} grids, none active) — kept first`;
    }

    let definition: MissionGridDefinition | null = null;
    if (chosen) {
      definition = {
        numRows: Number(chosen.numRows) || 0,
        numCols: Number(chosen.numCols) || 0,
        name: chosen.name ?? "",
        fileName: chosen.fileName ?? "",
      };
      outcome ??= "migrated";
      const coordinateFilePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${definition.fileName}`;
      if (!definition.fileName || !fs.existsSync(coordinateFilePath)) {
        outcome = `migrated (coordinate file missing: ${definition.fileName || "<none>"})`;
      }

      const unusedFileNames = new Set(
        rows
          .filter((row) => row.uuid !== chosen.uuid)
          .map((row) => row.fileName)
          .filter((fileName): fileName is string => !!fileName && fileName !== definition.fileName)
      );
      for (const fileName of unusedFileNames) {
        const filePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${fileName}`;
        fs.rmSync(filePath, { force: true });
      }
    } else if (!tableExists && legacyActiveUuid) {
      outcome = "grid_db already dropped — metadata unrecoverable, cleared";
      serverLogger.error(
        {
          logId: "automerge-migration",
          logValue: `Mission ${missionId} had activeGridUuid ${legacyActiveUuid} but grid_db is gone; grid cleared`,
        },
        new Error(`Grid metadata unrecoverable for mission ${missionId}`)
      );
    } else {
      outcome = "no grid";
    }

    docHandle.change((mission: Mission) => {
      mission.serverFileGrid = definition;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ("activeGridUuid" in mission) delete (mission as any).activeGridUuid;
    });

    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Mission ${missionId} grid migration: ${outcome}`,
    });
  },
};
