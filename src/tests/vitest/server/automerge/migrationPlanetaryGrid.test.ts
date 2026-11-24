import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { AUTOMERGE_MIGRATIONS, getPendingAutomergeMigrations } from "server/automerge/migrations";
import { Migration20261110000000 as selectGrid } from "server/automerge/migrations/Migration20261110000000";
import { Migration20261119000000 as configureMission } from "server/automerge/migrations/Migration20261119000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { getMissionGridSystemId } from "utils/lgrs/system";
import { currentMissionValidator } from "utils/validateSchemaServer";

test.each([
  ["earth", 6371000, "earth-wgs84"],
  ["moon", 1737400, "moon-m2025"],
  ["mars", 3389500, null],
] as const)(
  "migrates historical %s documents with or without a prior grid deployment",
  async (planet, planetRadius, expectedSystem) => {
    const serverFileGrid = { name: "Custom", fileName: "custom.json", numRows: 2, numCols: 2 };
    for (const gridAlreadyApplied of [false, true]) {
      const legacy = {
        ...generateBlankMission({ serverFileGrid, landerLocation: { lat: 0, lng: 0 } }),
        planetRadius,
        usingLGRSCoordinates: false,
        gridRenderMode: "server-file",
        earthGridLabelScheme: "mgrs",
      };
      delete (legacy as Partial<Mission>).planet;
      let doc = Automerge.from(legacy);
      const handle = {
        change: (update: (draft: typeof legacy) => void) => {
          doc = Automerge.change(doc, update);
        },
      } as unknown as DocHandle<Mission>;
      const completed = AUTOMERGE_MIGRATIONS.filter(
        (migration) =>
          migration !== configureMission && (gridAlreadyApplied || migration !== selectGrid)
      );
      if (gridAlreadyApplied) await selectGrid.migrate(handle, null);
      for (const migration of getPendingAutomergeMigrations(AUTOMERGE_MIGRATIONS, completed)) {
        await migration.migrate(handle, null);
      }
      const mission = Automerge.toJS(doc) as unknown as Mission;
      expect(mission.planet).toBe(planet);
      expect(getMissionGridSystemId(mission)).toBe(expectedSystem);
      expect(mission).not.toHaveProperty("gridSystem");
      expect(mission).not.toHaveProperty("gridRenderMode");
      expect(mission).not.toHaveProperty("planetRadius");
      expect(mission.earthGridLabelScheme).toBe("mgrs");
      expect(mission.serverFileGrid).toEqual(planet === "earth" ? serverFileGrid : null);
      expect(currentMissionValidator(mission)).toBe(true);
      const heads = Automerge.getHeads(doc);
      await configureMission.migrate(handle, null);
      expect(Automerge.getHeads(doc)).toEqual(heads);
    }
  }
);

test("runs the combined mission migration when the inherited grid migration is already recorded", () => {
  const index = AUTOMERGE_MIGRATIONS.indexOf(configureMission);
  expect(index).toBeGreaterThan(0);
  expect(AUTOMERGE_MIGRATIONS[index - 1]).toBe(selectGrid);
  const pending = getPendingAutomergeMigrations(
    AUTOMERGE_MIGRATIONS,
    AUTOMERGE_MIGRATIONS.filter((migration) => migration !== configureMission)
  );
  expect(pending).toEqual([configureMission]);
});

test.each([
  ["moon", 1737400, false],
  ["earth", 6378137, true],
] as const)(
  "deletes uploaded grid files only for non-Earth missions (%s)",
  async (_planet, planetRadius, fileKept) => {
    const staticDir = await mkdtemp(path.join(tmpdir(), "aegis-grid-migration-"));
    vi.stubEnv("STATIC_DIR", staticDir);
    try {
      const missionId = 4242;
      const dataDir = path.join(staticDir, "missionFiles", `${missionId}`, "Data");
      const gridFile = path.join(dataDir, "custom.json");
      await mkdir(dataDir, { recursive: true });
      await writeFile(gridFile, "[]");
      const serverFileGrid = { name: "Custom", fileName: "custom.json", numRows: 2, numCols: 2 };
      const legacy = {
        ...generateBlankMission({ id: missionId, serverFileGrid }),
        planetRadius,
      };
      delete (legacy as Partial<Mission>).planet;
      let doc = Automerge.from(legacy);
      const handle = {
        change: (update: (draft: typeof legacy) => void) => {
          doc = Automerge.change(doc, update);
        },
      } as unknown as DocHandle<Mission>;

      await configureMission.migrate(handle, null);

      expect(existsSync(gridFile)).toBe(fileKept);
      expect(doc.serverFileGrid).toEqual(fileKept ? serverFileGrid : null);
      // A rerun with the file already gone is a no-op.
      await configureMission.migrate(handle, null);
    } finally {
      vi.unstubAllEnvs();
      await rm(staticDir, { recursive: true, force: true });
    }
  }
);
