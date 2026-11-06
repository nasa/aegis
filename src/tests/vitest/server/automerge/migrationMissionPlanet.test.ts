import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261105000000 } from "server/automerge/migrations/Migration20261105000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { missionValidator } from "utils/validateSchemaServer";

test.each([1737400, 6371000, 6378137, 3389500, null])(
  "migrates legacy mission radius %s",
  async (planetRadius) => {
    const legacy = { ...generateBlankMission(), planetRadius, usingLGRSCoordinates: true };
    delete (legacy as Partial<Mission>).planet;
    let doc: Automerge.Doc<Mission> = Automerge.from(legacy);
    const handle = {
      change: (update: (mission: Mission) => void) => {
        doc = Automerge.change(doc, update);
      },
    } as DocHandle<Mission>;
    await Migration20261105000000.migrate(handle, null);
    expect(doc).not.toHaveProperty("planetRadius");
    expect(doc).not.toHaveProperty("usingLGRSCoordinates");
    expect(doc.planet).toBe(
      planetRadius > 6e6 ? "earth" : planetRadius === 3389500 ? "mars" : "moon"
    );
    expect(missionValidator(Automerge.toJS(doc))).toBe(true);
    const heads = Automerge.getHeads(doc);
    await Migration20261105000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
  }
);

test.each(["earth", "moon"] as const)(
  "cleans up legacy grid mode and unknown elevation for %s",
  async (planet) => {
    const serverFileGrid = { name: "Old grid", fileName: "old.json", numRows: 2, numCols: 2 };
    let doc: Automerge.Doc<Mission> = Automerge.from({
      ...generateBlankMission({
        planet,
        landerLocation: { lat: -85, lng: 0 },
        serverFileGrid,
        landerElevationMeters: 0,
      }),
      gridRenderMode: "server-file",
    });
    const handle = {
      change: (update: (mission: Mission) => void) => {
        doc = Automerge.change(doc, update);
      },
    } as DocHandle<Mission>;
    await Migration20261105000000.migrate(handle, null);
    expect(doc.landerElevationMeters).toBeNull();
    expect(doc).not.toHaveProperty("gridRenderMode");
    expect(doc.serverFileGrid).toEqual(planet === "moon" ? null : serverFileGrid);
  }
);
