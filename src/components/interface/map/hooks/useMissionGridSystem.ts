import { useMemo } from "react";

import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { resolveMissionGridSystem } from "utils/lgrs/system";

/**
 * The mission's grid system in the active label scheme: the user's override, else the mission
 * default. Grid systems are cached instances, so there is one instance per `system.key`.
 */
export function useMissionGridSystem(): LgrsGridSystem {
  const gridSystem = useMissionDocSelector((m) => m.gridSystem, refEqual);
  const earthGridLabelScheme = useMissionDocSelector((m) => m.earthGridLabelScheme, refEqual);
  const userSchemeOverride = useAppSelector(
    (state) => state.interface.gridLabelSchemeOverride,
    refEqual
  );
  return useMemo(
    () => resolveMissionGridSystem({ gridSystem, earthGridLabelScheme }, userSchemeOverride),
    [gridSystem, earthGridLabelScheme, userSchemeOverride]
  );
}

/**
 * The system for grid coordinates and grid-north bearings: the mission's grid system when it
 * shows grid coordinates (`usingLGRSCoordinates`), otherwise null.
 */
export function useMissionCoordinateSystem(): LgrsGridSystem | null {
  const usingLGRSCoordinates = useMissionDocSelector((m) => m.usingLGRSCoordinates, refEqual);
  const system = useMissionGridSystem();
  return usingLGRSCoordinates ? system : null;
}
