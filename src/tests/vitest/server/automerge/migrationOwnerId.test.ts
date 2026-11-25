import * as Automerge from "@automerge/automerge";
import { Migration20261125000000 } from "server/automerge/migrations/Migration20261125000000";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { generateBlankMission } from "store/storeUtils/mission";

describe("remove-owner-id migration", () => {
  it("is registered after the mission planet migration", () => {
    const index = AUTOMERGE_MIGRATIONS.indexOf(Migration20261125000000);
    expect(index).toBeGreaterThan(0);
    expect(AUTOMERGE_MIGRATIONS[index - 1].version).toBe(20261119000000);
  });

  it("makes no change when no entity has ownerId", async () => {
    let doc = Automerge.from({ ...generateBlankMission() });
    const heads = Automerge.getHeads(doc);
    const handle = {
      change: (callback: (m: Mission) => void) => {
        doc = Automerge.change(doc, callback);
      },
    } as DocHandle<Mission>;
    await Migration20261125000000.migrate(handle, null);
    expect(Automerge.getHeads(doc)).toEqual(heads);
  });
});
