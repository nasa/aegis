let nextRevision = 0;
const latestRevisionByTraverse = new Map<string, number>();

export const getNextTraverseProfileRevision = (traverseUuid: string): number => {
  const revision = ++nextRevision;
  latestRevisionByTraverse.set(traverseUuid, revision);
  return revision;
};

export const getNextTraverseProfileRevisions = (traverseUuids: string[]): Map<string, number> => {
  const revisions = new Map<string, number>();
  new Set(traverseUuids).forEach((traverseUuid) => {
    revisions.set(traverseUuid, getNextTraverseProfileRevision(traverseUuid));
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
