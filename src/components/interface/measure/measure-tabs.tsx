import type { FunctionComponent } from "react";
import styles from "./measure.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faRuler, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { setSelectedMeasurementUuid } from "store/measure";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";

import { thunkAddNewMeasurement, thunkRemoveMeasurement } from "store/thunk/thunkMeasurement";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import sortBy from "lodash/sortBy";

const MeasureTabs: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const measurements = useAppSelector((state) => state.measure.measurements, shallowEqual);
  const sortedMeasurements = sortBy(measurements, "createdAt");

  return (
    <div className={styles.measureTabsContainer}>
      {sortedMeasurements.map((measurement) => (
        <MeasureTab key={measurement.uuid} uuid={measurement.uuid} color={measurement.color} />
      ))}
      <div
        className={styles.measurementAdd}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Add Temporary Measurement"
        onClick={() => {
          dispatch(thunkAddNewMeasurement());
        }}
      >
        <FontAwesomeIcon icon={faPlus} size="sm" />
      </div>
    </div>
  );
};

export default MeasureTabs;

const MeasureTab: FunctionComponent<{ uuid: string; color: string }> = ({ uuid, color }) => {
  const dispatch = useAppDispatch();
  const selectedMeasurementUuid = useAppSelector(
    (state) => state.measure.selectedMeasurementUuid,
    refEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, refEqual);

  return (
    <div
      className={`${styles.measureTabContainer} ${selectedMeasurementUuid === uuid ? styles.measureTabSelected : ""}`}
      onClick={() => {
        // if deselecting, save the edit
        if (selectedMeasurementUuid === uuid) {
          if (mapDirective?.uuid === uuid) {
            dispatch(
              thunkUpdateMapDirective({
                uuid,
                mapItemType: "measurement",
                mapAction: "saveEditPolyline",
              })
            );
          }
          dispatch(setSelectedMeasurementUuid(null));
        } else {
          if (mapDirective?.mapItemType === "measurement") {
            dispatch(
              thunkUpdateMapDirective({
                uuid: mapDirective.uuid,
                mapItemType: "measurement",
                mapAction: "saveEditPolyline",
              })
            );
          }
          dispatch(setSelectedMeasurementUuid(uuid));
        }
      }}
    >
      <FontAwesomeIcon icon={faRuler} size="sm" />
      <div className={styles.measureTabColorCircle} style={{ backgroundColor: color }}></div>
      <div
        className={styles.measureTabRemove}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Remove Measurement"
        onClick={() => {
          dispatch(thunkRemoveMeasurement({ measurementUuid: uuid }));
        }}
      >
        <FontAwesomeIcon icon={faXmark} size="sm" />
      </div>
    </div>
  );
};
