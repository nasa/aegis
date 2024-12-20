import { FunctionComponent } from "react";
import { useAppSelector, refEqual } from "utils/useAppSelector";

import styles from "./timeline.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { Button } from "components/interface/form/globalFields";
import { faChartArea, faChartLine } from "@fortawesome/free-solid-svg-icons";
import { setShowDistanceFromLander, setShowElevation } from "store/interface";

const TimelineHoverValues: FunctionComponent<{ hoverValues: TimelineHoverValues }> = ({
  hoverValues,
}) => {
  const dispatch = useAppDispatch();
  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);

  const distanceFromLanderSelectedColor = showDistanceFromLander ? "#93AFD790" : "var(--grey3)";
  const elevationSelectedColor = showElevation ? "#8fae9590" : "var(--grey3)";

  return (
    <div className={styles.timelineHoverContainer}>
      <div className={styles.timelineOptions}>
        <Button
          icon={faChartLine}
          onClick={() => {
            dispatch(setShowDistanceFromLander(!showDistanceFromLander));
          }}
          toolTip="Show Distance From Lander"
          style={{
            backgroundColor: distanceFromLanderSelectedColor,
            width: "30px",
            fontSize: "1em",
            paddingLeft: "10px",
            marginRight: "2px",
          }}
        />
        <Button
          icon={faChartArea}
          onClick={() => {
            dispatch(setShowElevation(!showElevation));
          }}
          toolTip="Show Elevation"
          style={{
            backgroundColor: elevationSelectedColor,
            width: "30px",
            fontSize: "1em",
            paddingLeft: "10px",
          }}
        />
      </div>
      <div className={styles.timelineHoverValues}>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Lander Distance (m)</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.distanceFromLanderMeters?.toFixed(0)}
          </div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Relative Elevation (m)</div>
          <div className={styles.timelineHoverValue}>{hoverValues.elevationMeters?.toFixed(0)}</div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Walkback Dist (m)</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.walkbackDistanceFromLanderMeters?.toFixed(0)}
          </div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Walkback Elevation (m)</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.walkbackElevationMeters?.toFixed(0)}
          </div>
        </div>
      </div>
      <div className={styles.timelineKey}>
        <div className={styles.timelineKeyItem}>
          <div className={styles.timelineKeyName}>Traverse</div>
          <div className={styles.timelinKeySymbols}>
            <div className={styles.line} style={{ borderColor: "#93AFD7" }}></div>
            <div className={styles.line} style={{ borderColor: "#8fae95" }}></div>
          </div>
        </div>
        <div className={styles.timelineKeyItem}>
          <div className={styles.timelineKeyName}>Walkback</div>
          <div className={styles.timelinKeySvgSymbols}>
            <div className={styles.svgLine}>
              <svg>
                <line
                  x1="0"
                  y1="5"
                  x2="20"
                  y2="5"
                  stroke="#93AFD7"
                  strokeWidth="2"
                  strokeDasharray="5 2"
                />
              </svg>
            </div>
            <div className={styles.svgLine}>
              <svg>
                <line
                  x1="0"
                  y1="5"
                  x2="20"
                  y2="5"
                  stroke="#8fae95"
                  strokeWidth="2"
                  strokeDasharray="5 2"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineHoverValues;
