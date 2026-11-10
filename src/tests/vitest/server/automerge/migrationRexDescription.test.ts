import * as Automerge from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo/slim";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { Migration20261102000000 } from "server/automerge/migrations/Migration20261102000000";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";

describe("REX description migration", () => {
  it("is registered after history replacement and asset initialization", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261102000000);
    expect(index).toBeGreaterThan(0);
    expect(
      AUTOMERGE_MIGRATIONS.slice(index - 2, index).map((migration) => migration.version)
    ).toEqual([20261028000000, 20261030000000]);
  });

  it("removes populated and empty legacy descriptions while preserving execution data", async () => {
    const repo = new Repo();
    try {
      const planned = generateBlankEVA({ uuid: "planned", description: "Keep EVA notes" });
      const copied = generateBlankEVA({ uuid: "copied", refUuid: planned.refUuid });
      const stopped = generateBlankRex({
        uuid: "stopped",
        evaUuid: copied.uuid,
        posEntries: [
          generateBlankPosEntry({
            uuid: "position",
            location: { lat: 0, lng: 0 },
            elevation: 0,
            petSeconds: 0,
          }),
        ],
        stationEntries: { station: { rexStatus: "complete" } },
        actionEntries: { sample: { rexStatus: "complete", mass: 0 } },
      });
      const running = generateBlankRex({
        uuid: "running",
        evaUuid: copied.uuid,
        isRunning: true,
        petValueAtStartStop: "+01:23:45",
        petRunning: true,
        executeEditMode: "limited",
        executeEditState: {
          addedStationUuids: ["station"],
          addedTraverseUuids: [],
          addedActionUuids: ["sample"],
          actionLetterOrderByParent: { station: ["sample"] },
        },
      });
      const current = generateBlankRex({ uuid: "current", evaUuid: copied.uuid });
      const stoppedWithNotes: RexWithLegacyFields = {
        ...stopped,
        description: "Previous execution notes",
      };
      const runningWithNotes: RexWithLegacyFields = { ...running, description: "" };
      const expected = generateBlankMission({
        description: "Keep mission notes",
        evas: { planned, copied },
        rexes: { stopped, running, current },
      });
      const handle = repo.create<Mission>({
        ...expected,
        rexes: {
          stopped: stoppedWithNotes,
          running: runningWithNotes,
          current,
        },
      });

      await Migration20261102000000.migrate(handle, null);

      expect(Automerge.toJS(handle.doc())).toEqual(expected);
      for (const rex of Object.values(handle.doc().rexes)) {
        expect(rex).not.toHaveProperty("description");
      }
      expect(Automerge.load<Mission>(Automerge.save(handle.doc()))).toEqual(expected);
      const heads = Automerge.getHeads(handle.doc());
      await Migration20261102000000.migrate(handle, null);
      expect(Automerge.getHeads(handle.doc())).toEqual(heads);
    } finally {
      await repo.shutdown();
    }
  });

  it.each([false, true])(
    "leaves an empty mission unchanged (missing REX map: %s)",
    async (missing) => {
      const repo = new Repo();
      try {
        const mission = generateBlankMission();
        if (missing) delete (mission as Partial<Mission>).rexes;
        const handle = repo.create<Mission>(mission);
        const heads = Automerge.getHeads(handle.doc());

        await Migration20261102000000.migrate(handle, null);

        expect(Automerge.toJS(handle.doc())).toEqual(mission);
        expect(Automerge.getHeads(handle.doc())).toEqual(heads);
      } finally {
        await repo.shutdown();
      }
    }
  );
});
