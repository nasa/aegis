import type { FunctionComponent } from "react";
import { useEffect, useId, useRef } from "react";
import styles from "./map-sunearth.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEarthAmerica, faMoon, faSun, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "react-tooltip";
import { numericDatetimeToISO } from "utils/formatting";
import { useSunEarthAzimuths } from "../hooks/useSunEarthAzimuths";

export const SunEarth: FunctionComponent<{
  type: "editor" | "dashboard";
  selectedPreset: Preset;
}> = ({ type, selectedPreset }) => {
  const azimuths = useSunEarthAzimuths(selectedPreset);
  const tooltipId = useId();
  if (!selectedPreset) return null;

  let height = 180;
  if (
    (selectedPreset.earthEnabled && !selectedPreset.sunEnabled) ||
    (!selectedPreset.earthEnabled && selectedPreset.sunEnabled)
  ) {
    height = 90;
  }

  if (selectedPreset.sunEnabled || selectedPreset.earthEnabled) {
    return (
      <div
        className={`${type === "editor" ? styles.sunEarthContainerEditor : styles.sunEarthContainerDashboard} ${azimuths.warning ? styles.hasWarning : ""}`}
        style={{ height: `${height + 40}px` }}
      >
        <Tooltip
          id={tooltipId}
          place={type === "editor" ? "right" : "left"}
          className={styles.sourceTooltip}
        >
          {azimuths.source === "date" ? (
            <>
              <div>Date (UTC): {numericDatetimeToISO(azimuths.datetime)}</div>
              <div>
                Date Source:{" "}
                {azimuths.datetimeSourceLabel?.replace(/ \(fallback\)$/, " (initial date)")}
              </div>
            </>
          ) : (
            <>
              <div>Date (UTC): unavailable</div>
              <div>Date Source: manual preset azimuths</div>
            </>
          )}
        </Tooltip>
        {selectedPreset.sunEnabled && (
          <AzimuthIndicator
            sunEarth="sun"
            earthAsMoon={selectedPreset?.earthAsMoon}
            azimuth={azimuths.sunAzimuth}
            dashboard={type === "dashboard"}
          />
        )}
        {selectedPreset.earthEnabled && (
          <AzimuthIndicator
            sunEarth="earth"
            earthAsMoon={selectedPreset?.earthAsMoon}
            azimuth={azimuths.earthAzimuth}
            dashboard={type === "dashboard"}
          />
        )}
        <button
          type="button"
          className={styles.sourceButton}
          aria-label="Sun/Earth value source"
          aria-description={azimuths.warning || azimuths.statusLabel}
          data-status={azimuths.statusLabel}
          data-warning={Boolean(azimuths.warning)}
          data-tooltip-id={tooltipId}
        >
          <FontAwesomeIcon icon={faCircleInfo} />
        </button>
      </div>
    );
  }
  // If neither sun nor earth is enabled, return an empty div
  return null;
};

export default SunEarth;

const AzimuthIndicator: FunctionComponent<{
  sunEarth: "sun" | "earth";
  earthAsMoon: boolean;
  azimuth: number;
  dashboard: boolean;
}> = ({ sunEarth, earthAsMoon, azimuth, dashboard }) => {
  const sunEarthRef = useRef(null);
  useEffect(() => {
    if (!sunEarthRef.current) return;
    const sunEarthIcon = sunEarthRef.current;

    const radius = 30; // Half of the circle's diameter
    const radians = (azimuth - 90) * (Math.PI / 180); // Convert degrees to radians and adjust by -90 degrees
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
            <div className={styles.azimuthText}>{Math.round(azimuth) % 360}°</div>
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
              icon={sunEarth === "sun" ? faSun : earthAsMoon ? faMoon : faEarthAmerica}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
