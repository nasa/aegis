import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261105000000 } from "server/automerge/migrations/Migration20261105000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankStation } from "store/storeUtils/station";
import { currentMissionValidator as missionValidator } from "utils/validateSchemaServer";

test.each([1737400, 6371000, 6378137, 3389500, 0, null])(
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

test("rejects unknown legacy radii without changing the document", async () => {
  const legacy = { ...generateBlankMission(), planetRadius: 123 };
  delete (legacy as Partial<Mission>).planet;
  let doc: Automerge.Doc<Mission> = Automerge.from(legacy);
  const heads = Automerge.getHeads(doc);
  const handle = {
    change: (update: (mission: Mission) => void) => {
      doc = Automerge.change(doc, update);
    },
  } as DocHandle<Mission>;
  await expect(Migration20261105000000.migrate(handle, null)).rejects.toThrow(
    "Unsupported legacy planet radius: 123"
  );
  expect(Automerge.getHeads(doc)).toEqual(heads);
});

test("recalculates historical Earth path distances and is safe to repeat", async () => {
  const points = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ];
  const traverse = generateBlankTraverse({ path: points, pathSegmentDistances: [1] });
  const station = generateBlankStation({ walkbackPath: points, walkbackPathSegmentDistances: [1] });
  const legacy = {
    ...generateBlankMission({
      traverses: { [traverse.uuid]: traverse },
      stations: { [station.uuid]: station },
    }),
    planetRadius: 6371000,
  };
  delete (legacy as Partial<Mission>).planet;
  let doc: Automerge.Doc<Mission> = Automerge.from(legacy);
  const handle = {
    change: (update: (mission: Mission) => void) => {
      doc = Automerge.change(doc, update);
    },
  } as DocHandle<Mission>;
  await Migration20261105000000.migrate(handle, null);
  const expected = (6378137 * Math.PI) / 180;
  expect(doc.traverses[traverse.uuid].pathSegmentDistances[0]).toBeCloseTo(expected, 6);
  expect(doc.stations[station.uuid].walkbackPathSegmentDistances[0]).toBeCloseTo(expected, 6);
  const heads = Automerge.getHeads(doc);
  await Migration20261105000000.migrate(handle, null);
  expect(Automerge.getHeads(doc)).toEqual(heads);
});

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
