const latestIssuedTraverseProfileRevisionByTraverse = new Map<string, number>();

export const getNextTraverseProfileRevision = (traverseUuid: string): number => {
  const profileRevision =
    (latestIssuedTraverseProfileRevisionByTraverse.get(traverseUuid) ?? 0) + 1;
  latestIssuedTraverseProfileRevisionByTraverse.set(traverseUuid, profileRevision);
  return profileRevision;
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
      latestIssuedTraverseProfileRevisionByTraverse.get(traverseUuid) === profileRevision
  );
