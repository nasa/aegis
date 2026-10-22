import * as A from "@automerge/automerge";
import { Migration20261022000000 } from "server/automerge/migrations/Migration20261022000000";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankStation } from "store/storeUtils/station";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

it("removes legacy arrays, preserves geometry and is idempotent", async () => {
  setMissionAutomergeDocHandle(null);
  const handle = getMissionDocHandle();
  const traverse = generateBlankTraverse({
    path: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
  });
  const station = { ...generateBlankStation(), walkbackPathSegmentElevations: [[5, 6]] };
  handle.change((m) =>
    Object.assign(
      m,
      generateBlankMission({
        traverses: {
          [traverse.uuid]: {
            ...traverse,
            ...{ pathSegmentElevations: [[1, 2]], pathSegmentAbsoluteSlopes: [[3, 4]] },
          },
        },
        stations: { [station.uuid]: station },
      })
    )
  );
  await Migration20261022000000.migrate(handle, undefined);
  expect(handle.doc().traverses[traverse.uuid].path).toEqual(traverse.path);
  expect(handle.doc().traverses[traverse.uuid]).not.toHaveProperty("pathSegmentElevations");
  expect(handle.doc().traverses[traverse.uuid]).not.toHaveProperty("pathSegmentAbsoluteSlopes");
  expect(handle.doc().stations[station.uuid]).not.toHaveProperty("walkbackPathSegmentElevations");
  const heads = A.getHeads(handle.doc());
  await Migration20261022000000.migrate(handle, undefined);
  expect(A.getHeads(handle.doc())).toEqual(heads);
});
