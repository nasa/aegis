import * as A from "@automerge/automerge";
import { Migration20260902000000 } from "server/automerge/migrations/Migration20260902000000";
import { Migration20261022010000 } from "server/automerge/migrations/Migration20261022010000";
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
  const station = generateBlankStation();
  const legacyStation = { ...station, walkbackPathSegmentElevations: [[5, 6]] };
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
        stations: { [station.uuid]: legacyStation },
      })
    )
  );
  await Migration20261022010000.migrate(handle, undefined);
  expect(handle.doc().traverses[traverse.uuid]).toEqual(traverse);
  expect(handle.doc().stations[station.uuid]).toEqual(station);
  const heads = A.getHeads(handle.doc());
  await Migration20261022010000.migrate(handle, undefined);
  expect(A.getHeads(handle.doc())).toEqual(heads);
});

it("preserves the historical slope migration until the terrain cleanup runs", async () => {
  setMissionAutomergeDocHandle(null);
  const handle = getMissionDocHandle();
  const missingSlopes = generateBlankTraverse();
  const savedSlopes = generateBlankTraverse();
  const legacyTraverses = {
    [missingSlopes.uuid]: { ...missingSlopes, pathSegmentElevations: [[1, 2]] },
    [savedSlopes.uuid]: {
      ...savedSlopes,
      pathSegmentElevations: [[3, 4]],
      pathSegmentAbsoluteSlopes: [[5, null]],
    },
  };
  handle.change((mission) =>
    Object.assign(mission, generateBlankMission({ traverses: legacyTraverses }))
  );

  await Migration20260902000000.migrate(handle, undefined);
  expect(handle.doc().traverses).toEqual({
    ...legacyTraverses,
    [missingSlopes.uuid]: {
      ...legacyTraverses[missingSlopes.uuid],
      pathSegmentAbsoluteSlopes: null,
    },
  });

  await Migration20261022010000.migrate(handle, undefined);
  expect(handle.doc().traverses).toEqual({
    [missingSlopes.uuid]: missingSlopes,
    [savedSlopes.uuid]: savedSlopes,
  });
});
