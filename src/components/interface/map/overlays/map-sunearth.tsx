import type { FunctionComponent } from "react";
import { useEffect, useId, useRef } from "react";
import styles from "./map-sunearth.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEarthAmerica, faMoon, faSun, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "react-tooltip";
import { longDateFromDateNumeric } from "utils/formatting";
import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useSunEarthAzimuths } from "../hooks/useSunEarthAzimuths";

export const SunEarth: FunctionComponent<{
  type: "editor" | "dashboard";
}> = ({ type }) => {
  const azimuths = useSunEarthAzimuths(true);
  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const evaStartTime = useMissionDocSelector((m) => m.evas?.[selectedEvaUuid]?.datetime, refEqual);
  const isLunar = useMissionDocSelector((m) => m.planetRadius === 1737400, refEqual);
  const tooltipId = useId();
  const info =
    azimuths.warning ||
    (azimuths.source === "date"
      ? `Calculated at EVA start: ${longDateFromDateNumeric(evaStartTime)} (UTC)`
      : "Manual EVA directions");
  return (
    <div
      className={`${type === "editor" ? styles.sunEarthContainerEditor : styles.sunEarthContainerDashboard} ${!azimuths.available ? styles.unavailable : ""}`}
      style={{ height: "205px" }}
    >
      <Tooltip
        id={tooltipId}
        place={type === "editor" ? "right" : "left"}
        className={styles.sourceTooltip}
      >
        {info}
      </Tooltip>
      <AzimuthIndicator
        sunEarth="sun"
        azimuth={azimuths.available ? azimuths.sunAzimuth : null}
        dashboard={type === "dashboard"}
      />
      <AzimuthIndicator
        sunEarth="earth"
        azimuth={azimuths.available ? azimuths.earthAzimuth : null}
        dashboard={type === "dashboard"}
      />
      <button
        type="button"
        className={styles.sourceButton}
        aria-label={`Sun/${isLunar ? "Earth" : "Moon"} value source`}
        aria-description={info}
        data-tooltip-id={tooltipId}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
    </div>
  );
};

export default SunEarth;

export const AzimuthIndicator: FunctionComponent<{
  sunEarth: "sun" | "earth";
  azimuth: number | null;
  dashboard: boolean;
}> = ({ sunEarth, azimuth, dashboard }) => {
  const isLunar = useMissionDocSelector((m) => m.planetRadius === 1737400, refEqual);
  const sunEarthRef = useRef(null);
  useEffect(() => {
    if (!sunEarthRef.current) return;
    const sunEarthIcon = sunEarthRef.current;

    const radius = 30; // Half of the circle's diameter
    const radians = ((azimuth ?? 0) - 90) * (Math.PI / 180); // Convert degrees to radians and adjust by -90 degrees
    const x = radius * Math.cos(radians); // Calculate the x position
    const y = radius * Math.sin(radians); // Calculate the y position

    sunEarthIcon.style.left = `${x}px`;
    sunEarthIcon.style.top = `${y}px`;
  }, [azimuth, sunEarthRef]);

  return (
    <div className={styles.azimuthIndicatorContainer}>
      <div className={styles.azimuthIndicator}>
        <div
          className={
            dashboard ? styles.azimuthCircleContainerDashboard : styles.azimuthCircleContainer
          }
        >
          <div className={dashboard ? styles.azimuthCircleDashboard : styles.azimuthCircle} />
        </div>
        {!dashboard && (
          <div className={styles.azimuthTextContainer}>
            <div className={styles.azimuthText}>
              {azimuth == null ? "—" : `${Math.round(azimuth) % 360}°`}
            </div>
          </div>
        )}
        <div
          className={
            dashboard ? styles.sunEarthIconContainerDashboard : styles.sunEarthIconContainer
          }
        >
          <div
            ref={sunEarthRef}
            className={dashboard ? styles.sunEarthIconDashboard : styles.sunEarthIcon}
            style={{
              color: sunEarth === "sun" ? "yellow" : "lightblue",
            }}
          >
            <FontAwesomeIcon
              icon={sunEarth === "sun" ? faSun : isLunar ? faEarthAmerica : faMoon}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
