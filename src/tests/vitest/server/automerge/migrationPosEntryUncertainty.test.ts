import * as Automerge from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { Migration20261109000000 } from "server/automerge/migrations/Migration20261109000000";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { missionValidator } from "utils/validateSchemaServer";
import { applyCreatePosEntry } from "operations/apply/apply-rex";

type MissionDoc = Automerge.Doc<Mission>;

const fromMission = (mission: Partial<Mission>): MissionDoc =>
  Automerge.from({ ...mission } as unknown as Record<string, unknown>) as unknown as MissionDoc;

const handleFor = (getDoc: () => MissionDoc, setDoc: (doc: MissionDoc) => void) =>
  ({
    change: (callback: (m: Mission) => void) => setDoc(Automerge.change(getDoc(), callback)),
  }) as unknown as DocHandle<Mission>;

function legacyMissionWithEntries(entries: Partial<PosEntry>[]): Partial<Mission> {
  const rex = generateBlankRex({ evaUuid: "eva-1" });
  rex.posEntries = entries as PosEntry[];
  return generateBlankMission({ rexes: { [rex.uuid]: rex } });
}

describe("add-pos-entry-uncertainty migration", () => {
  it("is registered after the mission grid system migration", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261109000000);
    expect(index).toBeGreaterThan(0);
    expect(AUTOMERGE_MIGRATIONS[index - 1].version).toBe(20261106000000);
  });

  it("adds a zero radius and null color, validates, and is idempotent", async () => {
    const legacyEntry: Partial<PosEntry> = generateBlankPosEntry({ location: { lat: 1, lng: 2 } });
    delete legacyEntry.uncertaintyMeters;
    delete legacyEntry.color;
    let doc = fromMission(legacyMissionWithEntries([legacyEntry]));
    expect(missionValidator(Automerge.toJS(doc))).toBe(false);
    const handle = handleFor(
      () => doc,
      (next) => (doc = next)
    );

    await Migration20261109000000.migrate(handle, null);
    const entry = Object.values(doc.rexes)[0].posEntries[0];
    expect(entry.uncertaintyMeters).toBe(0);
    expect(entry.color).toBeNull();
    expect(missionValidator(Automerge.toJS(doc))).toBe(true);
    const heads = Automerge.getHeads(doc);
    await Migration20261109000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
  });

  it.each(["#ff0000", null])(
    "keeps existing radius and color (%s) and tolerates REXes without entries",
    async (color) => {
      const entry = generateBlankPosEntry({ uncertaintyMeters: 12, color });
      const mission = legacyMissionWithEntries([entry]);
      const emptyRex = generateBlankRex({ evaUuid: "eva-2", posEntries: null });
      mission.rexes[emptyRex.uuid] = emptyRex;
      let doc = fromMission(mission);
      await Migration20261109000000.migrate(
        handleFor(
          () => doc,
          (next) => (doc = next)
        ),
        null
      );
      const rexWithEntry = Object.values(doc.rexes).find((rex) => rex.posEntries?.length);
      expect(rexWithEntry.posEntries[0]).toEqual(entry);
      expect(doc.rexes[emptyRex.uuid].posEntries).toEqual([]);
    }
  );

  it("initializes missing position lists and preserves concurrent first additions after migration", async () => {
    const rex = generateBlankRex({ evaUuid: "eva-1", posEntries: null });
    const missing = generateBlankRex({ evaUuid: "eva-2" });
    delete missing.posEntries;
    let doc = fromMission(
      generateBlankMission({ rexes: { [rex.uuid]: rex, [missing.uuid]: missing } })
    );
    const handle = handleFor(
      () => doc,
      (next) => (doc = next)
    );
    await Migration20261109000000.migrate(handle, null);
    expect(doc.rexes[rex.uuid].posEntries).toEqual([]);
    expect(doc.rexes[missing.uuid].posEntries).toEqual([]);
    expect(missionValidator(Automerge.toJS(doc))).toBe(true);
    const heads = Automerge.getHeads(doc);
    await Migration20261109000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);

    const entryA = generateBlankPosEntry({ posSourceUuid: rex.posSources[0].uuid });
    const entryB = generateBlankPosEntry({ posSourceUuid: rex.posSources[1].uuid });
    const docA = Automerge.change(Automerge.clone(doc), (m) =>
      applyCreatePosEntry(m, { rexUuid: rex.uuid, posEntry: entryA })
    );
    const docB = Automerge.change(Automerge.clone(doc), (m) =>
      applyCreatePosEntry(m, { rexUuid: rex.uuid, posEntry: entryB })
    );
    expect(
      Automerge.merge(docA, docB)
        .rexes[rex.uuid].posEntries.map((entry) => entry.uuid)
        .sort()
    ).toEqual([entryA.uuid, entryB.uuid].sort());
  });
});
