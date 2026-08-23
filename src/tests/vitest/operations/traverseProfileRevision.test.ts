import {
  areTraverseProfileUpdatesCurrent,
  claimTraverseProfileRevision,
  claimTraverseProfileRevisions,
} from "operations/helpers/traverseProfileRevision";

const update = (traverseUuid: string, profileRevision: number) => ({
  traverseUuid,
  profileRevision,
});

describe("traverse profile revisions", () => {
  it("rejects an older operation after another operation claims the same traverse", () => {
    const olderRevision = claimTraverseProfileRevision("traverse-overlap");
    const newerRevision = claimTraverseProfileRevision("traverse-overlap");

    expect(areTraverseProfileUpdatesCurrent([update("traverse-overlap", olderRevision)])).toBe(
      false
    );
    expect(areTraverseProfileUpdatesCurrent([update("traverse-overlap", newerRevision)])).toBe(
      true
    );
  });

  it("rejects an entire multi-traverse operation when one traverse becomes stale", () => {
    const revisions = claimTraverseProfileRevisions(["traverse-a", "traverse-b"]);
    claimTraverseProfileRevision("traverse-b");

    expect(
      areTraverseProfileUpdatesCurrent([
        update("traverse-a", revisions.get("traverse-a")!),
        update("traverse-b", revisions.get("traverse-b")!),
      ])
    ).toBe(false);
  });
});
