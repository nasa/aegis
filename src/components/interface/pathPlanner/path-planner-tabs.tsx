import type { FunctionComponent } from "react";
import sortBy from "lodash/sortBy";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiamondTurnRight, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";

import measureStyles from "../measure/measure.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { setSelectedPathPlanUuid } from "store/pathPlanner";
import {
  thunkAddPathPlan,
  thunkFlushPathPlan,
  thunkRemovePathPlan,
} from "store/thunk/thunkPathPlanner";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";

const PathPlannerTabs: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const plans = useAppSelector(
    (state) =>
      state.pathPlanner.plans.map(({ uuid, color, createdAt }) => ({ uuid, color, createdAt })),
    deepEqual
  );

  return (
    <div className={measureStyles.measureTabsContainer}>
      {sortBy(plans, "createdAt").map((plan) => (
        <PathPlannerTab key={plan.uuid} uuid={plan.uuid} color={plan.color} />
      ))}
      <div
        className={measureStyles.measurementAdd}
        role="button"
        aria-label="Add Newton Path Plan"
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Add Newton Path Plan"
        onClick={() => {
          dispatch(thunkAddPathPlan());
        }}
      >
        <FontAwesomeIcon icon={faPlus} size="sm" />
      </div>
    </div>
  );
};

export default PathPlannerTabs;

const PathPlannerTab: FunctionComponent<{ uuid: string; color: string }> = ({ uuid, color }) => {
  const dispatch = useAppDispatch();
  const selectedPlanUuid = useAppSelector((state) => state.pathPlanner.selectedPlanUuid, refEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, refEqual);

  // Leaving an edit by switching tabs counts as Finished: the new points are sent now.
  const finishEdit = (editedUuid: string) => {
    dispatch(
      thunkUpdateMapDirective({
        uuid: editedUuid,
        mapItemType: "pathPlan",
        mapAction: "saveEditPolyline",
      })
    );
    dispatch(thunkFlushPathPlan({ uuid: editedUuid }));
  };

  return (
    <div
      className={`${measureStyles.measureTabContainer} ${selectedPlanUuid === uuid ? measureStyles.measureTabSelected : ""}`}
      data-testid={`path-plan-tab-${uuid}`}
      onClick={() => {
        if (mapDirective?.mapItemType === "pathPlan") finishEdit(mapDirective.uuid);
        dispatch(setSelectedPathPlanUuid(selectedPlanUuid === uuid ? null : uuid));
      }}
    >
      <FontAwesomeIcon icon={faDiamondTurnRight} size="sm" />
      <div className={measureStyles.measureTabColorCircle} style={{ backgroundColor: color }}></div>
      <div
        className={measureStyles.measureTabRemove}
        role="button"
        aria-label="Remove Newton Path Plan"
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Remove Newton Path Plan"
        onClick={(event) => {
          event.stopPropagation();
          dispatch(thunkRemovePathPlan({ uuid }));
        }}
      >
        <FontAwesomeIcon icon={faXmark} size="sm" />
      </div>
    </div>
  );
};
