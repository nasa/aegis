const automergeDocHandles: AutomergeDocHandles = {
  mission: null,
  // Other future doc handles can go here
};

// Used mainly for getting the docHandle from a thunk where we don't have access to the automerge react hooks
export const getAutomergeDocHandles = (): AutomergeDocHandles => {
  return automergeDocHandles;
};

export const setMissionAutomergeDocHandle = (docHandle: DocHandle<Mission>): void => {
  automergeDocHandles.mission = docHandle;
};
