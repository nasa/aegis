import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { stageLanderLocationUpdate } from "operations/stage/stage-lander";
import { applyLanderLocationUpdateStage } from "operations/apply/apply-mission";
import { areTraverseProfileUpdatesCurrent } from "operations/helpers/traverseProfileRevision";
import { clientLogger } from "utils/logging/clientLogger";

let latestLanderLocationRequest = 0;

export const thunkDocUpdateLanderLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
}>("updateLanderLocation", async ({ location }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;
  const requestId = ++latestLanderLocationRequest;

  // Step 1: Fetch all elevations in parallel and build the full stage.
  // No .change() calls happen here — stageLanderLocationUpdate only reads the
  // doc and dispatches read-only thunkFetchElevation calls.
  const stage = await stageLanderLocationUpdate(mission, dispatch, location);
  if (requestId !== latestLanderLocationRequest) {
    clientLogger.debug({
      logId: "thunk-mission",
      logValue: "thunkDocUpdateLanderLocation: stale request, skipping apply",
    });
    return;
  }
  if (!areTraverseProfileUpdatesCurrent(stage.traverseUpdates)) {
    clientLogger.debug({
      logId: "thunk-mission",
      logValue: "thunkDocUpdateLanderLocation: superseded traverse profile, skipping apply",
    });
    return;
  }

  // Step 2: Apply everything atomically in a single .change():
  //  - mission.landerLocation + landerElevationMeters
  //  - walkback path/distances/elevations for every station
  //  - path/distances/elevations for all affected egress/ingress traverses
  missionDocHandle.change((m: Mission) => applyLanderLocationUpdateStage(m, stage));

  // No Step 3: this thunk has no UI side-effects of its own.
});
