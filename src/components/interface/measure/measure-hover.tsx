import { FunctionComponent } from "react";

import timelineStyles from "../timeline/timeline.module.css";
import measureStyles from "./measure.module.css";

const MeasureHoverValues: FunctionComponent<{
  hoverValues: MeasureHoverValues;
}> = ({ hoverValues }) => {
  return (
    <div className={measureStyles.measureHoverContainer}>
      <div className={timelineStyles.timelineHoverValues}>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Total Distance (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.totalDistanceMeters?.toFixed(0)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Distance (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.distanceFromStartMeters?.toFixed(0)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Relative Elevation (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.elevationMeters?.toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeasureHoverValues;
