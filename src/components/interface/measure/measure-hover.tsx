import type { FunctionComponent } from "react";

import timelineStyles from "../timeline/timeline.module.css";
import measureStyles from "./measure.module.css";

const MeasureHoverValues: FunctionComponent<{
  hoverValues: MeasureHoverValues;
}> = ({ hoverValues }) => {
  return (
    <div className={measureStyles.measureHoverContainer}>
      <div className={timelineStyles.timelineHoverValues}>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Tot Distance (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.totalDistanceMeters?.toFixed(0)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Absolute Slope (°)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.absoluteSlopeDegrees?.toFixed(1)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Distance (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.distanceFromStartMeters?.toFixed(0)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Rel Elev (m)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.elevationMeters?.toFixed(0)}
          </div>
        </div>
        <div className={timelineStyles.timelineHoverValueItem}>
          <div className={timelineStyles.timelineHoverValueTitle}>Path Slope (°)</div>
          <div className={timelineStyles.timelineHoverValue}>
            {hoverValues.slopeDegrees?.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeasureHoverValues;
