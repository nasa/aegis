import type { FunctionComponent } from "react";

import assetStyles from "./map-menu-assets.module.css";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/** Calculated from the current location, including an unsaved position draft. */
export const PositionWalkback: FunctionComponent<{
  location: AEGISPoint | null;
  evaUuid: string;
  testIdPrefix: string;
}> = ({ location, evaUuid, testIdPrefix }) => {
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
    <>
      <span className={assetStyles.fieldLabel}>Lander Dist.</span>
      <span data-testid={`${testIdPrefix}-lander-distance`}>
        {Number.isFinite(distanceToLander) ? `${distanceToLander.toFixed(2)} m` : unavailableValue}
      </span>
      <span className={assetStyles.fieldLabel}>WB Dur.</span>
      <span data-testid={`${testIdPrefix}-walkback`}>
        {Number.isFinite(walkbackMins) ? `${walkbackMins} min` : unavailableValue}
      </span>
    </>
  );
};
