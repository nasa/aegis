import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261014000000 } from "server/automerge/migrations/Migration20261014000000";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankMission } from "store/storeUtils/mission";
import { missionValidator } from "utils/validateSchemaServer";

describe("shared folder visibility migration", () => {
  it("runs after the migration that moves folders into Automerge", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261014000000);
    expect(index).toBeGreaterThan(0);
    expect(AUTOMERGE_MIGRATIONS[index - 1].version).toBe(20261009000000);
  });

  it("defaults legacy folders to visible, preserves shared values, and is idempotent", async () => {
    const types: FolderType[] = ["poi", "station", "eva", "preset", "layer"];
    const folders = Object.fromEntries(
      types.map((type) => {
        const folder = generateBlankFolder({ uuid: type, type, items: ["item"] });
        delete (folder as Partial<Folder>).visible;
        return [type, folder];
      })
    );
    folders.hidden = generateBlankFolder({ uuid: "hidden", visible: false });
    folders.shown = generateBlankFolder({ uuid: "shown", visible: true });
    let doc = Automerge.from({ ...generateBlankMission({ folders }) });
    const before = Automerge.toJS(doc);
    expect(missionValidator(before)).toBe(false);
    expect(missionValidator.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: "required", params: { missingProperty: "visible" } }),
      ])
    );
    const handle = {
      change: (callback: (m: Mission) => void) => {
        doc = Automerge.change(doc, callback);
      },
    } as DocHandle<Mission>;

    await Migration20261014000000.migrate(handle, null);
    expect(missionValidator(Automerge.toJS(doc))).toBe(true);
    for (const type of types) {
      expect(doc.folders[type]).toEqual({ ...before.folders[type], visible: true });
    }
    expect(doc.folders.hidden).toEqual(before.folders.hidden);
    expect(doc.folders.shown).toEqual(before.folders.shown);
    const heads = Automerge.getHeads(doc);
    await Migration20261014000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
    expect(Automerge.load<Mission>(Automerge.save(doc)).folders.hidden.visible).toBe(false);
  });

  it("handles missions without folders", async () => {
    let doc = Automerge.from({ ...generateBlankMission() });
    const handle = {
      change: (callback: (m: Mission) => void) => {
        doc = Automerge.change(doc, callback);
      },
    } as DocHandle<Mission>;
    await Migration20261014000000.migrate(handle, null);
    expect(doc.folders).toEqual({});
  });
});
