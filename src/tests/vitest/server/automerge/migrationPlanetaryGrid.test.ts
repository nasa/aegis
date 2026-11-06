import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { AUTOMERGE_MIGRATIONS, getPendingAutomergeMigrations } from "server/automerge/migrations";
import { Migration20261105000000 as selectPlanet } from "server/automerge/migrations/Migration20261105000000";
import { Migration20261106000000 as selectGrid } from "server/automerge/migrations/Migration20261106000000";
import { Migration20261107000000 as deriveGrid } from "server/automerge/migrations/Migration20261107000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { getMissionGridSystemId } from "utils/lgrs/system";
import { currentMissionValidator } from "utils/validateSchemaServer";

vi.unmock("utils/validateSchemaServer");

test.each([
  ["earth", 6371000, "earth-wgs84"],
  ["moon", 1737400, "moon-m2025"],
  ["mars", 3389500, null],
] as const)(
  "migrates historical %s documents across either branch's deployment order",
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
      if (gridAlreadyApplied) await selectGrid.migrate(handle, null);
      await selectPlanet.migrate(handle, null);
      if (!gridAlreadyApplied) await selectGrid.migrate(handle, null);
      await deriveGrid.migrate(handle, null);
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
      await deriveGrid.migrate(handle, null);
      expect(Automerge.getHeads(doc)).toEqual(heads);
    }
  }
);

test("runs the planet migration even if the later grid migration is already recorded", () => {
  const pending = getPendingAutomergeMigrations(
    AUTOMERGE_MIGRATIONS,
    AUTOMERGE_MIGRATIONS.filter(
      (migration) => migration !== selectPlanet && migration !== deriveGrid
    )
  );
  expect(pending).toEqual([selectPlanet, deriveGrid]);
});
