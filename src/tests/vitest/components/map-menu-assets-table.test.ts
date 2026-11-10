/**
 * Unit tests for compareByName, the exported comparator that orders the Assets table's
 * folders and rows case-insensitively by name with a uuid tie-breaker.
 */
import { compareByName } from "components/interface/map/overlays/map-menu-assets-table";

describe("compareByName", () => {
  test("sorts by name case-insensitively with a uuid tie-breaker", () => {
    const items = [
      { name: "zebra", uuid: "1" },
      { name: "Alpha", uuid: "b" },
      { name: "alpha", uuid: "a" },
    ];
    expect([...items].sort(compareByName).map((i) => i.uuid)).toEqual(["a", "b", "1"]);
  });
});
