import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { stageLanderLocationUpdate } from "client/automerge/stage/stage-lander";
import { applyLanderLocationUpdateStage } from "client/automerge/apply/apply-mission";

export const thunkDocUpdateLanderLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
}>("updateLanderLocation", async ({ location }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  // Step 1: Fetch all elevations in parallel and build the full stage.
  // No .change() calls happen here — stageLanderLocationUpdate only reads the
  // doc and dispatches read-only thunkFetchElevation calls.
  const stage = await stageLanderLocationUpdate(mission, dispatch, location);

  // Step 2: Apply everything atomically in a single .change():
  //  - mission.landerLocation + landerElevationMeters
  //  - walkback path/distances/elevations for every station
  //  - path/distances/elevations for all affected egress/ingress traverses
  missionDocHandle.change((m: Mission) => applyLanderLocationUpdateStage(m, stage));

  // No Step 3: this thunk has no UI side-effects of its own.
});
