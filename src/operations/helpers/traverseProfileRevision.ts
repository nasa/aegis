let nextRevision = 0;
const latestRevisionByTraverse = new Map<string, number>();

export const claimTraverseProfileRevision = (traverseUuid: string): number => {
  const revision = ++nextRevision;
  latestRevisionByTraverse.set(traverseUuid, revision);
  return revision;
};

export const claimTraverseProfileRevisions = (traverseUuids: string[]): Map<string, number> => {
  const revisions = new Map<string, number>();
  new Set(traverseUuids).forEach((traverseUuid) => {
    revisions.set(traverseUuid, claimTraverseProfileRevision(traverseUuid));
  });
  return revisions;
};

export const areTraverseProfileUpdatesCurrent = (
  updates: Pick<TraverseUpdateStageData, "traverseUuid" | "profileRevision">[]
): boolean =>
  updates.every(
    ({ traverseUuid, profileRevision }) =>
      latestRevisionByTraverse.get(traverseUuid) === profileRevision
  );
