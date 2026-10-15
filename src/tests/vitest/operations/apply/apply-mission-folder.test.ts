import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyDeleteFolder,
  applyMoveItemToFolder,
  applyRemoveItemsFromAllFolders,
  applyRenameFolder,
  applyUpsertFolder,
} from "operations/apply/apply-mission-folder";
import { applyDeleteStations } from "operations/apply/apply-station";
import { applyDeletePois } from "operations/apply/apply-poi";
import { applyDeleteEvas } from "operations/apply/apply-eva";
import { generateBlankFolder } from "store/storeUtils/folder";

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  getMissionDocHandle().change((m) => {
    m.folders = {};
    m.stations = {};
    m.pois = {};
    m.evas = {};
    m.rexes = {};
  });
});

describe("apply-mission-folder", () => {
  it("applyUpsertFolder() and applyRenameFolder() store and rename a folder", () => {
    const folder = generateBlankFolder({ name: "Vitest Folder", type: "station" });
    withMissionChange((m) => applyUpsertFolder(m, folder));
    withMissionChange((m) => applyRenameFolder(m, { folderUuid: folder.uuid, name: "Renamed" }));

    expect(getMission().folders[folder.uuid].name).toBe("Renamed");
  });

  it("applyMoveItemToFolder() moves an item out of its previous folder", () => {
    const folderA = generateBlankFolder({ type: "station", items: ["station-1"] });
    const folderB = generateBlankFolder({ type: "station" });
    withMissionChange((m) => {
      applyUpsertFolder(m, folderA);
      applyUpsertFolder(m, folderB);
    });

    withMissionChange((m) =>
      applyMoveItemToFolder(m, { folderUuid: folderB.uuid, itemUuid: "station-1" })
    );
    expect(getMission().folders[folderA.uuid].items).toEqual([]);
    expect(getMission().folders[folderB.uuid].items).toEqual(["station-1"]);

    withMissionChange((m) => applyMoveItemToFolder(m, { folderUuid: null, itemUuid: "station-1" }));
    expect(getMission().folders[folderB.uuid].items).toEqual([]);
  });

  it("applyRemoveItemsFromAllFolders() removes every listed item", () => {
    const folder = generateBlankFolder({ type: "poi", items: ["a", "b", "c"] });
    withMissionChange((m) => applyUpsertFolder(m, folder));

    withMissionChange((m) => applyRemoveItemsFromAllFolders(m, ["a", "c"]));
    expect(getMission().folders[folder.uuid].items).toEqual(["b"]);
  });

  it("applyDeleteFolder() removes the folder", () => {
    const folder = generateBlankFolder();
    withMissionChange((m) => applyUpsertFolder(m, folder));
    withMissionChange((m) => applyDeleteFolder(m, folder.uuid));
    expect(getMission().folders[folder.uuid]).toBeUndefined();
  });

  it("deleting stations, POIs, and EVAs removes them from folders in the same change", () => {
    const folder = generateBlankFolder({ items: ["station-1", "poi-1", "eva-1", "keep"] });
    withMissionChange((m) => applyUpsertFolder(m, folder));

    withMissionChange((m) => {
      applyDeleteStations(m, ["station-1"]);
      applyDeletePois(m, ["poi-1"]);
      applyDeleteEvas(m, ["eva-1"]);
    });
    expect(getMission().folders[folder.uuid].items).toEqual(["keep"]);
  });
});
