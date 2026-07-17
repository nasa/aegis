import appCreateAsyncThunk from "./thunkUtil";
import { thunkFetchElevation } from "./thunkElevation";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyUpdateActionByField } from "operations/apply/apply-action";

export const thunkDocUpdateActionLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  actionUuid: string;
}>("updateActionLocation", async ({ location, actionUuid }, { dispatch }) => {
  // Step 1: Fetch elevation for the new location
  const elevation = await dispatch(
    thunkFetchElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: actionUuid,
    })
  );

  const newElevation: number | null =
    elevation.meta.requestStatus === "rejected" ? null : (elevation.payload as number);

  // Step 2: Write location + elevation atomically
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  missionDocHandle.change((m: Mission) => {
    applyUpdateActionByField(m, { actionUuid, fieldName: "location", value: location });
    applyUpdateActionByField(m, { actionUuid, fieldName: "elevation", value: newElevation });
  });

  // No Step 3: this thunk has no UI side-effects of its own.
});
