import * as Automerge from "@automerge/automerge";
import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateAsset,
  applyDeleteAsset,
  applyMoveAssetToFolder,
  applyToggleAssetVisible,
  applyUpdateAsset,
} from "operations/apply/apply-asset";
import { applyToggleFolderVisible, applyUpsertFolder } from "operations/apply/apply-mission-folder";
import { opDeleteFolder } from "operations/op-folder";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { checkMissionIntegrity } from "server/automerge/checkMissionIntegrity";

const getMission = (): Mission => getMissionDocHandle().doc();
const membership = (assetUuid: string) =>
  Object.values(getMission().folders)
    .filter((f) => f.items.includes(assetUuid))
    .map((f) => f.uuid);

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  getMissionDocHandle().change((m) => {
    m.folders = {};
    m.assets = {};
    m.pois = {};
  });
});

describe("apply-asset", () => {
  it("creates an unplaced asset at the root even if a folder lists its uuid", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", items: [asset.uuid] });
    withMissionChange((m) => {
      applyUpsertFolder(m, folder);
      applyCreateAsset(m, asset);
    });
    expect(getMission().assets[asset.uuid]).toEqual(asset);
    expect(getMission().assets[asset.uuid].location).toBeNull();
    expect(membership(asset.uuid)).toEqual([]);
  });

  it("writes only the changed fields and bumps updatedAt", () => {
    const asset = generateBlankAsset({ name: "Drill", notes: "keep", updatedAt: 1 });
    withMissionChange((m) => applyCreateAsset(m, asset));
    withMissionChange((m) =>
      applyUpdateAsset(m, { assetUuid: asset.uuid, changes: { name: "Hammer" } })
    );
    const saved = getMission().assets[asset.uuid];
    expect(saved.name).toBe("Hammer");
    expect(saved.notes).toBe("keep");
    expect(saved.updatedAt).toBeGreaterThan(1);
  });

  it("does not recreate a deleted asset on update", () => {
    withMissionChange((m) => applyUpdateAsset(m, { assetUuid: "gone", changes: { name: "X" } }));
    expect(getMission().assets.gone).toBeUndefined();
  });

  it("moves between folders and root with at most one membership", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const a = generateBlankFolder({ type: "asset", name: "A" });
    const b = generateBlankFolder({ type: "asset", name: "B" });
    withMissionChange((m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, a);
      applyUpsertFolder(m, b);
    });
    withMissionChange((m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: a.uuid })
    );
    withMissionChange((m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: b.uuid })
    );
    expect(membership(asset.uuid)).toEqual([b.uuid]);
    withMissionChange((m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: null })
    );
    expect(membership(asset.uuid)).toEqual([]);
  });

  it("leaves membership unchanged for a missing or non-asset target folder", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const assetFolder = generateBlankFolder({ type: "asset" });
    const poiFolder = generateBlankFolder({ type: "poi" });
    withMissionChange((m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, assetFolder);
      applyUpsertFolder(m, poiFolder);
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: assetFolder.uuid });
    });
    withMissionChange((m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: "missing" })
    );
    withMissionChange((m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: poiFolder.uuid })
    );
    expect(membership(asset.uuid)).toEqual([assetFolder.uuid]);
  });

  it("deletes an asset with its membership", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset" });
    withMissionChange((m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, folder);
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: folder.uuid });
    });
    withMissionChange((m) => applyDeleteAsset(m, asset.uuid));
    expect(getMission().assets[asset.uuid]).toBeUndefined();
    expect(getMission().folders[folder.uuid].items).toEqual([]);
  });

  it("toggles shared asset and asset-folder visibility independently", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", items: [] });
    withMissionChange((m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, folder);
    });
    withMissionChange((m) => applyToggleAssetVisible(m, asset.uuid));
    withMissionChange((m) => applyToggleFolderVisible(m, folder.uuid));
    withMissionChange((m) => applyToggleFolderVisible(m, folder.uuid));
    expect(getMission().assets[asset.uuid].visible).toBe(false);
    expect(getMission().folders[folder.uuid].visible).toBe(true);
  });

  it("refuses to delete a populated asset folder and deletes an empty one", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset" });
    withMissionChange((m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, folder);
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: folder.uuid });
    });
    expect(opDeleteFolder(getMissionDocHandle(), folder.uuid, () => true)).toMatch(/Cannot delete/);
    withMissionChange((m) => applyDeleteAsset(m, asset.uuid));
    expect(opDeleteFolder(getMissionDocHandle(), folder.uuid, () => true)).toBeUndefined();
    expect(getMission().folders[folder.uuid]).toBeUndefined();
  });

  it("merges concurrent edits from two clients without losing membership", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset" });
    let docA = Automerge.from({ ...generateBlankMission() });
    docA = Automerge.change(docA, (m) => {
      applyCreateAsset(m, asset);
      applyUpsertFolder(m, folder);
    });
    let docB = Automerge.clone(docA);
    docA = Automerge.change(docA, (m) =>
      applyMoveAssetToFolder(m, { assetUuid: asset.uuid, folderUuid: folder.uuid })
    );
    docB = Automerge.change(docB, (m) =>
      applyUpdateAsset(m, { assetUuid: asset.uuid, changes: { notes: "from B" } })
    );
    const merged = Automerge.merge(docA, docB);
    expect(merged.assets[asset.uuid].notes).toBe("from B");
    expect(merged.folders[folder.uuid].items).toEqual([asset.uuid]);
  });
});

describe("checkMissionIntegrity assets", () => {
  it("reports orphan asset folder items, duplicate membership, and broken placement", () => {
    const placed = generateBlankAsset({ location: { lat: 1, lng: 1 }, placement: null });
    const unplaced = generateBlankAsset();
    const poi = generateBlankPoi();
    const mission = generateBlankMission({
      pois: { [poi.uuid]: poi },
      assets: { [placed.uuid]: placed, [unplaced.uuid]: unplaced },
      folders: {
        a: generateBlankFolder({ uuid: "a", type: "asset", items: [unplaced.uuid, poi.uuid] }),
        b: generateBlankFolder({ uuid: "b", type: "asset", items: [unplaced.uuid] }),
      },
    });
    const findings = checkMissionIntegrity(1, mission).map((f) => `${f.entity}:${f.field}`);
    expect(findings).toEqual(
      expect.arrayContaining(["Folder:items", "Folder:items (duplicate)", "Asset:placement"])
    );
    expect(findings.filter((f) => f.startsWith("Asset"))).toEqual(["Asset:placement"]);
  });
});
