import type { FunctionComponent } from "react";

import assetStyles from "./map-menu-assets.module.css";
import posStyles from "./map-menu-pos.module.css";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/** Calculated from the current location, including an unsaved position draft. */
export const PositionWalkback: FunctionComponent<{
  location: AEGISPoint | null;
  evaUuid: string;
  testIdPrefix: string;
  showLanderDistance?: boolean;
}> = ({ location, evaUuid, testIdPrefix, showLanderDistance = true }) => {
  const walkback = useMissionDocSelector(
    (m) => ({
      landerLocation: m.landerLocation,
      planetRadius: m.planetRadius,
      traverseRate: m.evas?.[evaUuid]?.traverseRate || m.traverseRate,
    }),
    deepEqual
  );
  const distanceToLander =
    location && walkback.landerLocation && walkback.planetRadius
      ? getDistanceBetweenTwoCoordinates(location, walkback.landerLocation, walkback.planetRadius)
      : NaN;
  const walkbackMins = Number.isFinite(distanceToLander)
    ? Math.ceil(calcPathDurationMins([distanceToLander], walkback.traverseRate))
    : NaN;
  const unavailableValue = location ? "Not set" : "-";

  return (
    <div className={posStyles.pairedFields}>
      {showLanderDistance && (
        <>
          <span className={assetStyles.fieldLabel}>Lander Dist (m)</span>
          <span data-testid={`${testIdPrefix}-lander-distance`}>
            {Number.isFinite(distanceToLander) ? Math.round(distanceToLander) : unavailableValue}
          </span>
        </>
      )}
      <span className={assetStyles.fieldLabel}>WB Dur (m)</span>
      <span data-testid={`${testIdPrefix}-walkback`}>
        {Number.isFinite(walkbackMins) ? walkbackMins : unavailableValue}
      </span>
    </div>
  );
};
