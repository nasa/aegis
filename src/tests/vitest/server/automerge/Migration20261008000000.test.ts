import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { Migration20261008000000 } from "server/automerge/migrations/Migration20261008000000";
import type { AutomergeMigrationContext } from "server/automerge/migrations/types";
import { generateBlankRex } from "store/storeUtils/rex";

beforeAll(() => setMissionAutomergeDocHandle(null));

describe("Migration20261008000000 add-pos-source-path-color", () => {
  test("backfills default colors by source name, white for custom sources, keeps existing", async () => {
    const rex = generateBlankRex({ evaUuid: "eva-migration-test" });
    const legacyPosSources = [
      { uuid: "src-crew", name: "Crew", abbr: "C" },
      { uuid: "src-task", name: "Task", abbr: "T" },
      { uuid: "src-ser", name: "SER", abbr: "S" },
      { uuid: "src-custom", name: "Rover", abbr: "R" },
      { uuid: "src-existing", name: "Crew", abbr: "X", pathColor: "#123456" },
    ];
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((m) => {
      if (!m.rexes) m.rexes = {};
      m.rexes[rex.uuid] = { ...rex, posSources: legacyPosSources as PosSource[] };
    });

    await Migration20261008000000.migrate(missionDocHandle, {} as AutomergeMigrationContext);

    const colors = missionDocHandle
      .doc()
      .rexes[rex.uuid].posSources.map((posSource) => posSource.pathColor);
    expect(colors).toEqual(["#ff0000", "#009CE0", "#68BC00", "#ffffff", "#123456"]);

    missionDocHandle.change((m) => {
      delete m.rexes[rex.uuid];
    });
  });
});
