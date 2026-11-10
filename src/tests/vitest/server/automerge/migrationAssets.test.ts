import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261030000000 } from "server/automerge/migrations/Migration20261030000000";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankMission } from "store/storeUtils/mission";
import { missionValidator } from "utils/validateSchemaServer";

type MissionDoc = Automerge.Doc<Mission>;

const fromMission = (mission: Partial<Mission>): MissionDoc =>
  Automerge.from({ ...mission } as unknown as Record<string, unknown>) as unknown as MissionDoc;

const handleFor = (getDoc: () => MissionDoc, setDoc: (doc: MissionDoc) => void) =>
  ({
    change: (callback: (m: Mission) => void) => setDoc(Automerge.change(getDoc(), callback)),
  }) as unknown as DocHandle<Mission>;

describe("add-mission-assets migration", () => {
  it("is registered after the document-history migration", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261030000000);
    expect(index).toBeGreaterThan(0);
    expect(AUTOMERGE_MIGRATIONS[index - 1].version).toBe(20261028000000);
  });

  it("adds an empty assets dictionary, validates, and is idempotent", async () => {
    const legacy = generateBlankMission() as Partial<Mission>;
    delete legacy.assets;
    let doc = fromMission(legacy);
    expect(missionValidator(Automerge.toJS(doc))).toBe(false);
    const handle = handleFor(
      () => doc,
      (next) => (doc = next)
    );

    await Migration20261030000000.migrate(handle, null);
    expect(doc.assets).toEqual({});
    expect(missionValidator(Automerge.toJS(doc))).toBe(true);
    const heads = Automerge.getHeads(doc);
    await Migration20261030000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
  });

  it("keeps existing assets", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    let doc = fromMission(generateBlankMission({ assets: { [asset.uuid]: asset } }));
    await Migration20261030000000.migrate(
      handleFor(
        () => doc,
        (next) => (doc = next)
      ),
      null
    );
    expect(doc.assets[asset.uuid]).toEqual(asset);
  });
});
