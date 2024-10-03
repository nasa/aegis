import { FunctionComponent, useEffect, useRef } from "react";
import styles from "./map-sunearth.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEarthAmerica, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";

export const SunEarth: FunctionComponent<{
  type: "editor" | "dashboard";
  mapSelectedPreset: Preset;
}> = ({ type, mapSelectedPreset }) => {
  const selectedPreset = mapSelectedPreset;

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
        className={
          type === "editor" ? styles.sunEarthContainerEditor : styles.sunEarthContainerDashboard
        }
        style={{ height: `${height}px` }}
      >
        {selectedPreset.sunEnabled && (
          <AzimuthIndicator
            sunEarth="sun"
            earthAsMoon={selectedPreset?.earthAsMoon}
            azimuth={selectedPreset?.sunAzimuth || 0}
            dashboard={type === "dashboard"}
          />
        )}
        {selectedPreset.earthEnabled && (
          <AzimuthIndicator
            sunEarth="earth"
            earthAsMoon={selectedPreset?.earthAsMoon}
            azimuth={selectedPreset?.earthAzimuth || 0}
            dashboard={type === "dashboard"}
          />
        )}
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
            <div className={styles.azimuthText}>{azimuth}°</div>
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
